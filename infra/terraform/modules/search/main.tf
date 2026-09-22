# Azure AI Search on the Free tier: one index of permission-tagged chunks for the hybrid retriever.
# Data-plane access is Entra ID only (no keys): the Function queries, the operator indexes.

terraform {
  required_version = ">= 1.9"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.5"
    }
  }
}

# tflint-ignore: azurerm_resources_missing_prevent_destroy # recreated on purpose in the recovery drill (Phase 4 D6)
resource "azurerm_search_service" "this" {
  #checkov:skip=CKV_AZURE_207:the Free tier has no replicas; the index is rebuilt by the indexing CLI
  #checkov:skip=CKV_AZURE_208:semantic search is not available on the Free tier
  #checkov:skip=CKV_AZURE_124:no private endpoints or VNet in a zero-cost demo; the Function (Flex, no VNet) and the operator reach it over the public endpoint with Entra ID auth only (no keys)
  #checkov:skip=CKV_AZURE_209:no private endpoints or VNet in a zero-cost demo; access is Entra ID only (no keys)
  name                          = "srch-kb-${var.environment}-${var.name_suffix}"
  resource_group_name           = var.resource_group_name
  location                      = var.location
  sku                           = "free"
  local_authentication_enabled  = false
  public_network_access_enabled = true
  tags                          = var.tags

  identity {
    type = "SystemAssigned"
  }
}

locals {
  # The Function only queries; the operator creates the index and uploads chunks from the CLI.
  data_roles = merge(
    {
      function_query  = { principal = var.function_principal_id, type = "ServicePrincipal", role = "Search Index Data Reader" }
      operator_write  = { principal = var.operator_object_id, type = "User", role = "Search Index Data Contributor" }
      operator_schema = { principal = var.operator_object_id, type = "User", role = "Search Service Contributor" }
    },
    var.ci_plan_principal_id == null ? {} : {
      ci_plan_query = { principal = var.ci_plan_principal_id, type = "ServicePrincipal", role = "Search Index Data Reader" }
    },
  )
}

resource "azurerm_role_assignment" "data" {
  for_each = local.data_roles

  scope                = azurerm_search_service.this.id
  principal_id         = each.value.principal
  principal_type       = each.value.type
  role_definition_name = each.value.role
}
