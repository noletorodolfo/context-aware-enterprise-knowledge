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

output "knowledge_api_application_id" {
  description = "Resource ID of the API application (for credentials such as certificates)."
  value       = azuread_application.knowledge_api.id
}

output "e2e_client_id" {
  value = azuread_application.e2e_client.client_id
}

output "evaluator_role_id" {
  value = random_uuid.evaluator_role.result
}

output "ingestion_client_id" {
  value = azuread_application.ingestion.client_id
}

output "ingestion_application_id" {
  description = "Resource ID of the ingestion application (for its certificate credential)."
  value       = azuread_application.ingestion.id
}

output "ingestion_service_principal_object_id" {
  description = "Object ID used when granting this identity access to a specific site."
  value       = azuread_service_principal.ingestion.object_id
}
