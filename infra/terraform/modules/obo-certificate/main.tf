# Key Vault holding the certificate the Knowledge API uses to prove its identity in the
# On-Behalf-Of exchange. The private key is non-exportable: callers can only ask Key Vault to sign.

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

data "azurerm_client_config" "current" {}

# The suffix used to be random; it is now an input so a destroyed environment comes back with the
# same names (Phase 4 D5). Forget the old random_string without touching anything.
removed {
  from = random_string.suffix

  lifecycle {
    destroy = false
  }
}

# tflint-ignore: azurerm_resources_missing_prevent_destroy # recreated on purpose in the recovery drill (Phase 4 D6)
resource "azurerm_key_vault" "this" {
  #checkov:skip=CKV_AZURE_189:no private endpoints or VNet in a zero-cost demo; the Function (Flex, no VNet) and CI runners reach it over the public endpoint with Entra ID auth
  #checkov:skip=CKV_AZURE_109:no private endpoints or VNet in a zero-cost demo; the Function (Flex, no VNet) and CI runners reach it over the public endpoint with Entra ID auth
  #checkov:skip=CKV2_AZURE_32:no private endpoints or VNet in a zero-cost demo; the Function (Flex, no VNet) and CI runners reach it over the public endpoint with Entra ID auth
  #checkov:skip=CKV_AZURE_110:purge protection would block recreating the vault under the same name (Phase 4 D5)
  #checkov:skip=CKV_AZURE_42:soft delete is on (7 days); full recoverability also needs purge protection, see above
  name                       = "kv-kb-${var.environment}-${var.name_suffix}"
  resource_group_name        = var.resource_group_name
  location                   = var.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  rbac_authorization_enabled = true
  purge_protection_enabled   = false
  soft_delete_retention_days = 7
  tags                       = var.tags
}

# Whoever applies Terraform needs data-plane rights to create the certificate: the operator locally
# and the CI apply identity in the pipeline. Fixed principals, not "whoever runs this" (Phase 4).
resource "azurerm_role_assignment" "operator_certificates" {
  scope                = azurerm_key_vault.this.id
  role_definition_name = "Key Vault Certificates Officer"
  principal_id         = var.operator_object_id
}

resource "azurerm_role_assignment" "ci_apply_certificates" {
  count = var.ci_apply_principal_id == null ? 0 : 1

  scope                = azurerm_key_vault.this.id
  role_definition_name = "Key Vault Certificates Officer"
  principal_id         = var.ci_apply_principal_id
  principal_type       = "ServicePrincipal"
}

# Pull request plans refresh the certificate, which is a data-plane read.
resource "azurerm_role_assignment" "ci_plan_certificates" {
  count = var.ci_plan_principal_id == null ? 0 : 1

  scope                = azurerm_key_vault.this.id
  role_definition_name = "Key Vault Certificate User"
  principal_id         = var.ci_plan_principal_id
  principal_type       = "ServicePrincipal"
}

# tflint-ignore: azurerm_resources_missing_prevent_destroy # recreated on purpose in the recovery drill (Phase 4 D6)
resource "azurerm_key_vault_certificate" "obo" {
  name         = "obo-${var.environment}"
  key_vault_id = azurerm_key_vault.this.id

  certificate_policy {
    issuer_parameters {
      name = "Self"
    }

    key_properties {
      exportable = false
      key_size   = 2048
      key_type   = "RSA"
      reuse_key  = false
    }

    lifetime_action {
      action {
        action_type = "AutoRenew"
      }

      trigger {
        days_before_expiry = 30
      }
    }

    secret_properties {
      content_type = "application/x-pkcs12"
    }

    x509_certificate_properties {
      subject            = "CN=${var.subject_name}"
      validity_in_months = 12
      key_usage          = ["digitalSignature"]
      extended_key_usage = ["1.3.6.1.5.5.7.3.2"]
    }
  }

  depends_on = [azurerm_role_assignment.operator_certificates]
}
