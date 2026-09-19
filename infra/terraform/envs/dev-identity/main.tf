# Partner tenant (ADR-011): app registrations, groups, app roles and the OBO certificate registration.
# Applied locally by the operator; CI never holds a credential in this tenant (Phase 4 D1).

terraform {
  required_version = ">= 1.9"

  # Configured in backend.hcl (key = "dev-identity.tfstate"):
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

# The Azure root (personal subscription) owns the Key Vault certificate; read its public part.
data "terraform_remote_state" "azure" {
  backend = "azurerm"

  config = {
    resource_group_name  = var.state_resource_group_name
    storage_account_name = var.state_storage_account_name
    container_name       = var.state_container_name
    key                  = "dev.tfstate"
    use_azuread_auth     = true
  }
}

locals {
  obo_certificate = try(data.terraform_remote_state.azure.outputs.obo_certificate, null)
}

# The API app registration trusts the Key Vault certificate for client assertions. After the Azure root
# is recreated (new certificate), applying this root registers the new one.
resource "azuread_application_certificate" "knowledge_api_obo" {
  application_id = module.identity.knowledge_api_application_id
  type           = "AsymmetricX509Cert"
  encoding       = "base64"
  value          = local.obo_certificate.data_base64
  end_date       = local.obo_certificate.end_date

  lifecycle {
    precondition {
      condition     = local.obo_certificate != null
      error_message = "Apply envs/dev first: its obo_certificate output is missing."
    }
  }
}
