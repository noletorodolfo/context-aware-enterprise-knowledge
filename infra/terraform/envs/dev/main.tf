terraform {
  required_version = ">= 1.9"

  # Configured in backend.hcl (generated from the bootstrap output):
  #   terraform init -backend-config=backend.hcl
  backend "azurerm" {}

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.5"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }
}

# Azure resources live in the personal subscription (ADR-011). The partner-tenant identity is the
# separate root envs/dev-identity, applied locally by the operator (Phase 4 D1).
provider "azurerm" {
  subscription_id     = var.subscription_id
  storage_use_azuread = true

  features {
    # A destroyed environment must come back under the same names (Phase 4 D5).
    key_vault {
      purge_soft_delete_on_destroy = true
    }
    cognitive_account {
      purge_soft_delete_on_destroy = true
    }
    # Application Insights creates a "Smart Detection" action group outside Terraform; rg-kb-dev holds
    # only this project, so deleting the group with it is safe and keeps destroy one step.
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }
}

data "terraform_remote_state" "identity" {
  backend = "azurerm"

  config = {
    resource_group_name  = var.state_resource_group_name
    storage_account_name = var.state_storage_account_name
    container_name       = var.state_container_name
    key                  = "dev-identity.tfstate"
    use_azuread_auth     = true
  }
}

locals {
  tags = {
    project     = "context-aware-enterprise-knowledge"
    owner       = var.owner
    managed_by  = "terraform"
    environment = "dev"
  }
}

resource "azurerm_resource_group" "dev" {
  name     = "rg-kb-dev"
  location = var.location
  tags     = local.tags
}

module "obo_certificate" {
  source = "../../modules/obo-certificate"

  environment         = "dev"
  resource_group_name = azurerm_resource_group.dev.name
  location            = azurerm_resource_group.dev.location
  tags                = local.tags
  subject_name        = "kb-knowledge-api-dev-obo"
  name_suffix         = var.name_suffixes.key_vault

  operator_object_id    = var.operator_object_id
  ci_apply_principal_id = var.ci_apply_principal_id
  ci_plan_principal_id  = var.ci_plan_principal_id
}

module "openai" {
  source = "../../modules/openai"

  environment         = "dev"
  resource_group_name = azurerm_resource_group.dev.name
  location            = var.openai_location
  tags                = local.tags
  model_name          = var.openai_model_name
  model_version       = var.openai_model_version
  capacity            = var.openai_capacity
  name_suffix         = var.name_suffixes.openai
}

module "function_app" {
  source = "../../modules/function-app"

  environment          = "dev"
  resource_group_name  = azurerm_resource_group.dev.name
  location             = azurerm_resource_group.dev.location
  tags                 = local.tags
  tenant_id            = var.tenant_id
  api_client_id        = data.terraform_remote_state.identity.outputs.knowledge_api_client_id
  name_suffix          = var.name_suffixes.function_app
  cors_allowed_origins = [var.sharepoint_origin]

  extra_app_settings = {
    SEARCH_SITE_URLS        = join(",", var.search_site_urls)
    KEY_VAULT_KEY_ID        = module.obo_certificate.key_id
    OBO_CERT_THUMBPRINT     = module.obo_certificate.thumbprint
    AZURE_OPENAI_ENDPOINT   = module.openai.endpoint
    AZURE_OPENAI_DEPLOYMENT = module.openai.deployment_name

    # Phase 6: hybrid retrieval. "graph" stays the default until the evaluation says otherwise.
    SEARCH_BACKEND                    = var.search_backend
    SEARCH_ENDPOINT                   = module.search.endpoint
    SEARCH_INDEX_NAME                 = var.search_index_name
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT = module.openai.embedding_deployment_name
  }
}

# The Function may sign with the certificate key, never export it.
resource "azurerm_role_assignment" "function_key_sign" {
  scope                = module.obo_certificate.key_role_scope
  role_definition_name = "Key Vault Crypto User"
  principal_id         = module.function_app.principal_id
}

resource "azurerm_role_assignment" "function_openai" {
  scope                = module.openai.account_id
  role_definition_name = "Cognitive Services OpenAI User"
  principal_id         = module.function_app.principal_id
}

module "search" {
  source = "../../modules/search"

  environment           = "dev"
  resource_group_name   = azurerm_resource_group.dev.name
  location              = azurerm_resource_group.dev.location
  tags                  = local.tags
  name_suffix           = var.name_suffixes.search
  function_principal_id = module.function_app.principal_id
  operator_object_id    = var.operator_object_id
  ci_plan_principal_id  = var.ci_plan_principal_id
}

module "observability" {
  source = "../../modules/observability"

  environment             = "dev"
  resource_group_name     = azurerm_resource_group.dev.name
  location                = azurerm_resource_group.dev.location
  tags                    = local.tags
  application_insights_id = module.function_app.application_insights_id
  alert_email             = var.alert_email
}

# The operator's own Azure CLI identity runs the evaluation judge locally (no API keys).
resource "azurerm_role_assignment" "operator_openai" {
  scope                = module.openai.account_id
  role_definition_name = "Cognitive Services OpenAI User"
  principal_id         = var.operator_object_id
}
