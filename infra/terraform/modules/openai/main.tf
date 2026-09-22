# Azure OpenAI account without API keys (Entra ID only) and one chat model deployment.

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

# The suffix used to be random; it is now an input so a destroyed environment comes back with the
# same names (Phase 4 D5). Forget the old random_string without touching anything.
removed {
  from = random_string.suffix

  lifecycle {
    destroy = false
  }
}

resource "azurerm_cognitive_account" "this" {
  #checkov:skip=CKV_AZURE_134:no private endpoints or VNet in a zero-cost demo; the Function (Flex, no VNet) and CI runners reach it over the public endpoint with Entra ID auth
  #checkov:skip=CKV_AZURE_247:outbound access is restricted with an empty allow list, stricter than the listed FQDNs the check expects
  #checkov:skip=CKV2_AZURE_22:Microsoft-managed keys; a customer-managed key needs a Key Vault key and more cost
  name                  = "oai-kb-${var.environment}-${var.name_suffix}"
  resource_group_name   = var.resource_group_name
  location              = var.location
  kind                  = "OpenAI"
  sku_name              = "S0"
  custom_subdomain_name = "oai-kb-${var.environment}-${var.name_suffix}"
  local_auth_enabled    = false
  tags                  = var.tags

  # The model never calls out; block outbound traffic (data loss prevention).
  outbound_network_access_restricted = true

  identity {
    type = "SystemAssigned"
  }
}

resource "azurerm_cognitive_deployment" "chat" {
  name                 = "chat"
  cognitive_account_id = azurerm_cognitive_account.this.id

  model {
    format  = "OpenAI"
    name    = var.model_name
    version = var.model_version
  }

  sku {
    name     = "GlobalStandard"
    capacity = var.capacity
  }
}

# Embeddings for the Azure AI Search index and for query vectors (Phase 6).
resource "azurerm_cognitive_deployment" "embedding" {
  name                 = "embedding"
  cognitive_account_id = azurerm_cognitive_account.this.id

  model {
    format  = "OpenAI"
    name    = var.embedding_model_name
    version = var.embedding_model_version
  }

  sku {
    name     = "GlobalStandard"
    capacity = var.embedding_capacity
  }
}
