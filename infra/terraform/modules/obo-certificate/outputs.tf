output "key_vault_id" {
  value = azurerm_key_vault.this.id
}

output "key_id" {
  description = "Versionless key URL used for signing (the certificate's backing key)."
  value       = "${azurerm_key_vault.this.vault_uri}keys/${azurerm_key_vault_certificate.obo.name}"
}

output "key_role_scope" {
  description = "ARM scope of the certificate's key, for key-level RBAC."
  value       = "${azurerm_key_vault.this.id}/keys/${azurerm_key_vault_certificate.obo.name}"
}

output "thumbprint" {
  description = "SHA-1 thumbprint (hex) of the current certificate version."
  value       = azurerm_key_vault_certificate.obo.thumbprint
}

output "certificate_data_base64" {
  value = azurerm_key_vault_certificate.obo.certificate_data_base64
}

output "expires" {
  value = azurerm_key_vault_certificate.obo.certificate_attribute[0].expires
}
