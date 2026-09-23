# Event-driven ingestion: the webhook that receives SharePoint change notifications, the queue that
# absorbs them and the consumer that runs the delta query. Separate from the API on purpose: this
# identity may write to the index and read every library app-only, which the API must never do.

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

locals {
  app_name = "func-kb-ingest-${var.environment}-${var.name_suffix}"
  queue    = "document-changed"
  # Built from the name, not from the resource: an app setting cannot reference the app it configures.
  webhook_url = "https://${local.app_name}.azurewebsites.net/api/ingestion/notifications"
}

# tflint-ignore: azurerm_resources_missing_prevent_destroy # recreated on purpose in the recovery drill (Phase 4 D6)
resource "azurerm_storage_account" "this" {
  #checkov:skip=CKV_AZURE_59:no private endpoints or VNet in a zero-cost demo; the Function (Flex, no VNet) reaches it over the public endpoint with Entra ID auth
  #checkov:skip=CKV2_AZURE_33:no private endpoints or VNet in a zero-cost demo; the Function (Flex, no VNet) reaches it over the public endpoint with Entra ID auth
  #checkov:skip=CKV_AZURE_206:LRS is enough for a deployment package and a resumable delta token
  #checkov:skip=CKV_AZURE_33:queue diagnostic logs would add cost; the consumer logs every message it applies
  #checkov:skip=CKV2_AZURE_1:Microsoft-managed keys; a customer-managed key needs a Key Vault key and more cost
  name                            = "stkbingest${var.environment}${var.name_suffix}"
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

# tflint-ignore: azurerm_resources_missing_prevent_destroy # recreated on purpose in the recovery drill (Phase 4 D6)
resource "azurerm_storage_container" "deployments" {
  #checkov:skip=CKV2_AZURE_21:blob read logging needs diagnostic settings and adds cost; CI republishes the package
  name                  = "app-package"
  storage_account_id    = azurerm_storage_account.this.id
  container_access_type = "private"
}

# tflint-ignore: azurerm_resources_missing_prevent_destroy # the delta token is a resumable cursor, not a system of record
resource "azurerm_storage_queue" "changes" {
  name               = local.queue
  storage_account_id = azurerm_storage_account.this.id
}

# Created explicitly so a message the consumer could never apply has a visible, inspectable home
# instead of appearing only when the runtime first needs it.
# tflint-ignore: azurerm_resources_missing_prevent_destroy # recreated with the environment
resource "azurerm_storage_queue" "poison" {
  name               = "${local.queue}-poison"
  storage_account_id = azurerm_storage_account.this.id
}

# The only secret in the ingestion path: Graph echoes it in every notification and the webhook, which
# cannot require an Entra token, uses it to tell a real notification from an anonymous POST.
resource "random_password" "client_state" {
  length  = 64
  special = false
}

# tflint-ignore: azurerm_resources_missing_prevent_destroy # recreated with the environment; the renewal run recreates the subscriptions that carry it
resource "azurerm_key_vault_secret" "client_state" {
  #checkov:skip=CKV_AZURE_41:rotated by recreating the subscription, which the renewal function does on demand
  name         = "ingestion-client-state-${var.environment}"
  value        = random_password.client_state.result
  key_vault_id = var.key_vault_id
  content_type = "text/plain"
}

resource "azurerm_service_plan" "this" {
  #checkov:skip=CKV_AZURE_212:Flex Consumption scales from zero; always-ready instances would cost money
  #checkov:skip=CKV_AZURE_225:Flex Consumption plans are not zone redundant in this region; a demo accepts it
  name                = "asp-kb-ingest-${var.environment}-${var.name_suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  os_type             = "Linux"
  sku_name            = "FC1"
  tags                = var.tags
}

resource "azurerm_function_app_flex_consumption" "this" {
  name                = local.app_name
  resource_group_name = var.resource_group_name
  location            = var.location
  service_plan_id     = azurerm_service_plan.this.id

  storage_container_type      = "blobContainer"
  storage_container_endpoint  = "${azurerm_storage_account.this.primary_blob_endpoint}${azurerm_storage_container.deployments.name}"
  storage_authentication_type = "SystemAssignedIdentity"

  runtime_name    = "node"
  runtime_version = "22"
  # Ingestion is not latency-critical and every instance competes for the same embedding quota.
  maximum_instance_count = 10
  instance_memory_in_mb  = 2048

  identity {
    type = "SystemAssigned"
  }

  site_config {
    application_insights_connection_string = var.application_insights_connection_string
  }

  app_settings = {
    AzureWebJobsStorage__accountName = azurerm_storage_account.this.name
    # Queue trigger connection, resolved with the managed identity rather than a connection string.
    INGESTION_STORAGE__accountName     = azurerm_storage_account.this.name
    INGESTION_STORAGE__queueServiceUri = azurerm_storage_account.this.primary_queue_endpoint
    INGESTION_STATE_ACCOUNT_URL        = azurerm_storage_account.this.primary_blob_endpoint
    INGESTION_QUEUE_NAME               = azurerm_storage_queue.changes.name
    INGESTION_NOTIFICATION_URL         = local.webhook_url
    INGESTION_CLIENT_STATE             = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.client_state.versionless_id})"
    INGESTION_CLIENT_ID                = var.ingestion_client_id
    INGESTION_CERT_THUMBPRINT          = var.cert_thumbprint
    INGESTION_SITE_URL                 = var.site_url
    INGESTION_LIBRARY_ACL              = jsonencode(var.library_acl)
    TENANT_ID                          = var.tenant_id
    KEY_VAULT_KEY_ID                   = var.signing_key_id
    SEARCH_ENDPOINT                    = var.search_endpoint
    SEARCH_INDEX_NAME                  = var.search_index_name
    AZURE_OPENAI_ENDPOINT              = var.openai_endpoint
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT  = var.openai_embedding_deployment
  }

  tags = var.tags
}

locals {
  principal_id = azurerm_function_app_flex_consumption.this.identity[0].principal_id

  # The host needs blobs, queues and tables of its own storage account; the ingestion state and the
  # change queue live there too. Without the queue and table roles the Functions host reports
  # AzureWebJobsStorage as unhealthy even while triggers work.
  storage_roles = {
    blob  = "Storage Blob Data Owner"
    queue = "Storage Queue Data Contributor"
    table = "Storage Table Data Contributor"
  }
}

resource "azurerm_role_assignment" "storage" {
  for_each = local.storage_roles

  scope                = azurerm_storage_account.this.id
  role_definition_name = each.value
  principal_id         = local.principal_id
  principal_type       = "ServicePrincipal"
}

# Signing the client assertion: the private key never leaves Key Vault.
resource "azurerm_role_assignment" "signing_key" {
  scope                = var.signing_key_role_scope
  role_definition_name = "Key Vault Crypto User"
  principal_id         = local.principal_id
  principal_type       = "ServicePrincipal"
}

# Reading the webhook secret through the Key Vault reference in its app settings.
resource "azurerm_role_assignment" "client_state_secret" {
  scope                = var.key_vault_id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = local.principal_id
  principal_type       = "ServicePrincipal"
}

# Writing chunks: the only identity in the system allowed to change the index at runtime.
resource "azurerm_role_assignment" "search_write" {
  scope                = var.search_service_id
  role_definition_name = "Search Index Data Contributor"
  principal_id         = local.principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "openai" {
  scope                = var.openai_account_id
  role_definition_name = "Cognitive Services OpenAI User"
  principal_id         = local.principal_id
  principal_type       = "ServicePrincipal"
}

# The operator inspects the queue, the poison queue and the stored delta token while verifying.
resource "azurerm_role_assignment" "operator_queue" {
  scope                = azurerm_storage_account.this.id
  role_definition_name = "Storage Queue Data Contributor"
  principal_id         = var.operator_object_id
  principal_type       = "User"
}

resource "azurerm_role_assignment" "operator_state" {
  scope                = azurerm_storage_account.this.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = var.operator_object_id
  principal_type       = "User"
}
