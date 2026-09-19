# Azure OpenAI account without API keys (Entra ID only) and one chat model deployment.

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

resource "azurerm_cognitive_account" "this" {
  name                  = "oai-kb-${var.environment}-${var.name_suffix}"
  resource_group_name   = var.resource_group_name
  location              = var.location
  kind                  = "OpenAI"
  sku_name              = "S0"
  custom_subdomain_name = "oai-kb-${var.environment}-${var.name_suffix}"
  local_auth_enabled    = false
  tags                  = var.tags
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
