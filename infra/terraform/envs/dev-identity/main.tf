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
  obo_certificate       = try(data.terraform_remote_state.azure.outputs.obo_certificate, null)
  ingestion_certificate = try(data.terraform_remote_state.azure.outputs.ingestion_certificate, null)
}

# The API app registration trusts the Key Vault certificate for client assertions. After the Azure root
# is recreated (new certificate), applying this root registers the new one.
# Skipped, not failed, while the Azure root has not produced a certificate yet. A failing apply does
# not persist this root's outputs, and the Azure root reads them: erroring here would leave the first
# bring-up of a new application unable to continue. Applying this root again registers the certificate.
#
# After the Azure root is destroyed (recovery drill) this plans to remove the registration, which is
# what should happen: the certificate it points at no longer exists. The third step of the bring-up
# registers the new one.
resource "azuread_application_certificate" "knowledge_api_obo" {
  count = local.obo_certificate == null ? 0 : 1

  application_id = module.identity.knowledge_api_application_id
  type           = "AsymmetricX509Cert"
  encoding       = "base64"
  value          = local.obo_certificate.data_base64
  end_date       = local.obo_certificate.end_date
}

# The ingestion application trusts its own Key Vault certificate for the app-only client assertion.
resource "azuread_application_certificate" "ingestion" {
  count = local.ingestion_certificate == null ? 0 : 1

  application_id = module.identity.ingestion_application_id
  type           = "AsymmetricX509Cert"
  encoding       = "base64"
  value          = local.ingestion_certificate.data_base64
  end_date       = local.ingestion_certificate.end_date
}

# Applying this root with no certificate available is legitimate (first bring-up) but must not look
# like a finished job: the output says which registrations are still missing.
output "pending_certificate_registrations" {
  description = "Applications whose certificate is not registered yet; apply envs/dev, then this root again."
  value = compact([
    local.obo_certificate == null ? "knowledge-api (obo)" : "",
    local.ingestion_certificate == null ? "ingestion" : "",
  ])
}
