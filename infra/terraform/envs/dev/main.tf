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
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.9"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }
}

# Azure resources live in the personal subscription (ADR-011).
provider "azurerm" {
  features {}
  subscription_id     = var.subscription_id
  storage_use_azuread = true
}

# Identity lives in the partner tenant (ADR-011).
provider "azuread" {
  tenant_id = var.tenant_id
}

locals {
  tags = {
    project     = "context-aware-enterprise-knowledge"
    owner       = var.owner
    managed_by  = "terraform"
    environment = "dev"
  }
}

module "identity" {
  source = "../../modules/identity"

  environment     = "dev"
  test_user_a_upn = var.test_user_a_upn
  test_user_b_upn = var.test_user_b_upn
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
}

module "function_app" {
  source = "../../modules/function-app"

  environment          = "dev"
  resource_group_name  = azurerm_resource_group.dev.name
  location             = azurerm_resource_group.dev.location
  tags                 = local.tags
  tenant_id            = var.tenant_id
  api_client_id        = module.identity.knowledge_api_client_id
  cors_allowed_origins = [var.sharepoint_origin]

  extra_app_settings = {
    SEARCH_SITE_URLS        = join(",", var.search_site_urls)
    KEY_VAULT_KEY_ID        = module.obo_certificate.key_id
    OBO_CERT_THUMBPRINT     = module.obo_certificate.thumbprint
    AZURE_OPENAI_ENDPOINT   = module.openai.endpoint
    AZURE_OPENAI_DEPLOYMENT = module.openai.deployment_name
  }
}

# The API app registration (partner tenant) trusts the Key Vault certificate for client assertions.
resource "azuread_application_certificate" "knowledge_api_obo" {
  application_id = module.identity.knowledge_api_application_id
  type           = "AsymmetricX509Cert"
  encoding       = "base64"
  value          = module.obo_certificate.certificate_data_base64
  end_date       = module.obo_certificate.expires
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

# The operator's own Azure CLI identity runs the evaluation judge locally (no API keys).
data "azurerm_client_config" "current" {}

resource "azurerm_role_assignment" "operator_openai" {
  scope                = module.openai.account_id
  role_definition_name = "Cognitive Services OpenAI User"
  principal_id         = data.azurerm_client_config.current.object_id
}
