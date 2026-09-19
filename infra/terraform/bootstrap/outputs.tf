output "backend_config" {
  description = "Content for infra/terraform/envs/dev/backend.hcl."
  value       = <<-EOT
    resource_group_name  = "${azurerm_resource_group.tfstate.name}"
    storage_account_name = "${azurerm_storage_account.tfstate.name}"
    container_name       = "${azurerm_storage_container.tfstate.name}"
    key                  = "dev.tfstate"
    use_azuread_auth     = true
  EOT
}

output "ci_plan_client_id" {
  description = "GitHub secret AZURE_CLIENT_ID_PLAN."
  value       = azurerm_user_assigned_identity.ci_plan.client_id
}

output "ci_apply_client_id" {
  description = "GitHub secret AZURE_CLIENT_ID_APPLY."
  value       = azurerm_user_assigned_identity.ci_apply.client_id
}

output "ci_plan_principal_id" {
  description = "envs/dev variable ci_plan_principal_id."
  value       = azurerm_user_assigned_identity.ci_plan.principal_id
}

output "ci_apply_principal_id" {
  description = "envs/dev variable ci_apply_principal_id."
  value       = azurerm_user_assigned_identity.ci_apply.principal_id
}
