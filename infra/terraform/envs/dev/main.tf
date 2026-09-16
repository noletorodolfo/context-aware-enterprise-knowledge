terraform {
  required_version = ">= 1.9"

  # Configuração em backend.hcl (gerado pelo output do bootstrap):
  #   terraform init -backend-config=backend.hcl
  backend "azurerm" {}

  required_providers {
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

provider "azuread" {
  tenant_id = var.tenant_id
}

module "identity" {
  source = "../../modules/identity"

  environment     = "dev"
  test_user_a_upn = var.test_user_a_upn
  test_user_b_upn = var.test_user_b_upn
}
