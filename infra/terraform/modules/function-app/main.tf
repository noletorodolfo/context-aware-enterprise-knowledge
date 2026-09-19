# Knowledge API hosting: Flex Consumption Function App with identity-based storage access
# (no shared keys) and workspace-based Application Insights.

terraform {
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

# The suffix used to be random; it is now an input so a destroyed environment comes back with the
# same names (Phase 4 D5). Forget the old random_string without touching anything.
removed {
  from = random_string.suffix

  lifecycle {
    destroy = false
  }
}

locals {
  suffix = var.name_suffix
}


resource "azurerm_storage_account" "host" {
  #checkov:skip=CKV_AZURE_59:no private endpoints or VNet in a zero-cost demo; the Function (Flex, no VNet) and CI runners reach it over the public endpoint with Entra ID auth
  #checkov:skip=CKV2_AZURE_33:no private endpoints or VNet in a zero-cost demo; the Function (Flex, no VNet) and CI runners reach it over the public endpoint with Entra ID auth
  #checkov:skip=CKV_AZURE_206:LRS is enough for a deployment package that CI can republish
  #checkov:skip=CKV_AZURE_33:the Function host does not use queues; diagnostic logs would add cost
  #checkov:skip=CKV2_AZURE_1:Microsoft-managed keys; a customer-managed key needs a Key Vault key and more cost
  name                            = "stkbfunc${var.environment}${local.suffix}"
  resource_group_name             = var.resource_group_name
  location                        = var.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  shared_access_key_enabled       = false
  tags                            = var.tags

  blob_properties {
    delete_retention_policy {
      days = 7
    }
  }
}

resource "azurerm_storage_container" "deployments" {
  #checkov:skip=CKV2_AZURE_21:blob read logging needs diagnostic settings and adds cost; CI republishes the package
  name                  = "app-package"
  storage_account_id    = azurerm_storage_account.host.id
  container_access_type = "private"
}

resource "azurerm_log_analytics_workspace" "this" {
  name                = "log-kb-${var.environment}-${local.suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  daily_quota_gb      = 0.1 # cost guardrail; far below the free 5 GB/month
  tags                = var.tags
}

resource "azurerm_application_insights" "this" {
  name                = "appi-kb-${var.environment}-${local.suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  workspace_id        = azurerm_log_analytics_workspace.this.id
  application_type    = "Node.JS"
  tags                = var.tags
}

resource "azurerm_service_plan" "this" {
  #checkov:skip=CKV_AZURE_212:Flex Consumption scales from zero; always-ready instances would cost money
  #checkov:skip=CKV_AZURE_225:Flex Consumption plans are not zone redundant in this region; a demo accepts it
  name                = "asp-kb-${var.environment}-${local.suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  os_type             = "Linux"
  sku_name            = "FC1"
  tags                = var.tags
}

resource "azurerm_function_app_flex_consumption" "api" {
  name                = "func-kb-api-${var.environment}-${local.suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  service_plan_id     = azurerm_service_plan.this.id

  storage_container_type      = "blobContainer"
  storage_container_endpoint  = "${azurerm_storage_account.host.primary_blob_endpoint}${azurerm_storage_container.deployments.name}"
  storage_authentication_type = "SystemAssignedIdentity"

  runtime_name           = "node"
  runtime_version        = "22"
  maximum_instance_count = 40
  instance_memory_in_mb  = 2048

  identity {
    type = "SystemAssigned"
  }

  site_config {
    application_insights_connection_string = azurerm_application_insights.this.connection_string

    cors {
      allowed_origins = var.cors_allowed_origins
    }
  }

  app_settings = merge(var.extra_app_settings, {
    AzureWebJobsStorage__accountName = azurerm_storage_account.host.name
    TENANT_ID                        = var.tenant_id
    API_CLIENT_ID                    = var.api_client_id
  })

  tags = var.tags
}

# The host reads/writes its storage and deployment package with its managed identity.
resource "azurerm_role_assignment" "host_storage" {
  scope                = azurerm_storage_account.host.id
  role_definition_name = "Storage Blob Data Owner"
  principal_id         = azurerm_function_app_flex_consumption.api.identity[0].principal_id
}
