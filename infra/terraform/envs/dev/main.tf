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

module "function_app" {
  source = "../../modules/function-app"

  environment          = "dev"
  resource_group_name  = azurerm_resource_group.dev.name
  location             = azurerm_resource_group.dev.location
  tags                 = local.tags
  tenant_id            = var.tenant_id
  api_client_id        = module.identity.knowledge_api_client_id
  cors_allowed_origins = [var.sharepoint_origin]
}
