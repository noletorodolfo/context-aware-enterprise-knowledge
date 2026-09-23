# Bootstrap: creates the remote state storage and the budget alert.
# This is the only module with local state (chicken-and-egg problem). Run it once.

terraform {
  required_version = ">= 1.9"

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

provider "azurerm" {
  features {}
  subscription_id     = var.subscription_id
  storage_use_azuread = true
}

data "azurerm_client_config" "current" {}

locals {
  tags = {
    project     = "context-aware-enterprise-knowledge"
    owner       = var.owner
    managed_by  = "terraform"
    environment = "shared"
  }
}

resource "azurerm_resource_group" "tfstate" {
  name     = "rg-kb-tfstate"
  location = var.location
  tags     = local.tags
}

resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

resource "azurerm_storage_account" "tfstate" {
  #checkov:skip=CKV_AZURE_59:GitHub-hosted runners and the operator reach the state over the public endpoint with Entra ID auth only (no keys)
  #checkov:skip=CKV2_AZURE_33:no private endpoints or VNet in a zero-cost demo; access is Entra ID only (no keys)
  #checkov:skip=CKV_AZURE_206:LRS with blob versioning and soft delete is enough for a demo's state
  #checkov:skip=CKV_AZURE_33:no queues are used; diagnostic logs would add cost
  #checkov:skip=CKV2_AZURE_1:Microsoft-managed keys; a customer-managed key needs a Key Vault key and more cost
  name                            = "stkbtfstate${random_string.suffix.result}"
  resource_group_name             = azurerm_resource_group.tfstate.name
  location                        = azurerm_resource_group.tfstate.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  # No access keys: state is read and written only with an Entra ID identity.
  shared_access_key_enabled = false

  blob_properties {
    versioning_enabled = true

    delete_retention_policy {
      days = 7
    }
  }

  tags = local.tags

  # Losing the state storage would orphan every environment.
  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_role_assignment" "tfstate_operator" {
  scope                = azurerm_storage_account.tfstate.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_storage_container" "tfstate" {
  #checkov:skip=CKV2_AZURE_21:blob read logging needs diagnostic settings and adds cost; versioning keeps every state change
  name                  = "tfstate"
  storage_account_id    = azurerm_storage_account.tfstate.id
  container_access_type = "private"

  depends_on = [azurerm_role_assignment.tfstate_operator]

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_consumption_budget_subscription" "guardrail" {
  name            = "budget-kb-portfolio"
  subscription_id = "/subscriptions/${var.subscription_id}"
  amount          = var.budget_amount
  time_grain      = "Monthly"

  time_period {
    start_date = var.budget_start_date
  }

  notification {
    enabled        = true
    threshold      = 50
    operator       = "GreaterThanOrEqualTo"
    threshold_type = "Actual"
    contact_emails = [var.budget_contact_email]
  }

  notification {
    enabled        = true
    threshold      = 100
    operator       = "GreaterThanOrEqualTo"
    threshold_type = "Forecasted"
    contact_emails = [var.budget_contact_email]
  }
}

# --- GitHub Actions identities (OIDC, no secrets) -----------------------------------------------
# Only the personal subscription is reachable from CI; the partner tenant is never (ADR-011, Phase 4 D1).

resource "azurerm_resource_group" "ci" {
  name     = "rg-kb-ci"
  location = var.location
  tags     = local.tags
}

# Pull requests: read-only plans.
resource "azurerm_user_assigned_identity" "ci_plan" {
  name                = "id-kb-ci-plan"
  resource_group_name = azurerm_resource_group.ci.name
  location            = azurerm_resource_group.ci.location
  tags                = local.tags
}

# The protected "dev" environment: applies and deployments, after the owner approves.
resource "azurerm_user_assigned_identity" "ci_apply" {
  name                = "id-kb-ci-apply"
  resource_group_name = azurerm_resource_group.ci.name
  location            = azurerm_resource_group.ci.location
  tags                = local.tags
}

locals {
  github_issuer = "https://token.actions.githubusercontent.com"
}

resource "azurerm_federated_identity_credential" "ci_plan_pull_request" {
  name                      = "github-pull-request"
  user_assigned_identity_id = azurerm_user_assigned_identity.ci_plan.id
  audience                  = ["api://AzureADTokenExchange"]
  issuer                    = local.github_issuer
  subject                   = "repo:${var.github_repository}:pull_request"
}

resource "azurerm_federated_identity_credential" "ci_apply_environment" {
  name                      = "github-environment-dev"
  user_assigned_identity_id = azurerm_user_assigned_identity.ci_apply.id
  audience                  = ["api://AzureADTokenExchange"]
  issuer                    = local.github_issuer
  subject                   = "repo:${var.github_repository}:environment:dev"
}

locals {
  subscription_scope = "/subscriptions/${var.subscription_id}"
  ci_role_assignments = {
    plan_reader        = { principal = azurerm_user_assigned_identity.ci_plan.principal_id, role = "Reader", scope = local.subscription_scope }
    plan_state         = { principal = azurerm_user_assigned_identity.ci_plan.principal_id, role = "Storage Blob Data Contributor", scope = azurerm_storage_container.tfstate.id }
    apply_contributor  = { principal = azurerm_user_assigned_identity.ci_apply.principal_id, role = "Contributor", scope = local.subscription_scope }
    apply_access_admin = { principal = azurerm_user_assigned_identity.ci_apply.principal_id, role = "User Access Administrator", scope = local.subscription_scope }
    apply_state        = { principal = azurerm_user_assigned_identity.ci_apply.principal_id, role = "Storage Blob Data Contributor", scope = azurerm_storage_container.tfstate.id }
  }
}

# Reader cannot call the POST "list" actions the azurerm provider uses to refresh state. This role adds
# only those reads (found with TF_LOG=DEBUG on a plan): no write, delete or data-plane access.
resource "azurerm_role_definition" "ci_plan_reader" {
  name        = "kb-ci-plan-reader"
  scope       = local.subscription_scope
  description = "Extra read actions Terraform needs to plan the Knowledge API environment."

  permissions {
    actions = [
      "Microsoft.Web/sites/config/list/action",
      "Microsoft.Storage/storageAccounts/listKeys/action",
      "Microsoft.OperationalInsights/workspaces/sharedKeys/action",
      # The search service has key authentication disabled, so these keys cannot be used to reach it;
      # the provider still reads them when refreshing the resource.
      "Microsoft.Search/searchServices/listAdminKeys/action",
      "Microsoft.Search/searchServices/listQueryKeys/action",
    ]
  }

  assignable_scopes = [local.subscription_scope]
}

resource "azurerm_role_assignment" "ci_plan_reader" {
  principal_id       = azurerm_user_assigned_identity.ci_plan.principal_id
  principal_type     = "ServicePrincipal"
  role_definition_id = azurerm_role_definition.ci_plan_reader.role_definition_resource_id
  scope              = local.subscription_scope
}

resource "azurerm_role_assignment" "ci" {
  for_each = local.ci_role_assignments

  principal_id         = each.value.principal
  principal_type       = "ServicePrincipal"
  role_definition_name = each.value.role
  scope                = each.value.scope
}
