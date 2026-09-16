output "knowledge_api_client_id" {
  value = azuread_application.knowledge_api.client_id
}

output "knowledge_api_identifier_uri" {
  value = azuread_application_identifier_uri.knowledge_api.identifier_uri
}

output "knowledge_api_display_name" {
  description = "Name used in the SPFx webApiPermissionRequests."
  value       = azuread_application.knowledge_api.display_name
}

output "group_colaboradores_id" {
  value = azuread_group.colaboradores.object_id
}

output "group_rh_id" {
  value = azuread_group.rh.object_id
}
