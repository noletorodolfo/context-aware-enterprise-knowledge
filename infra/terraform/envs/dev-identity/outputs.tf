output "identity" {
  value = module.identity
}

output "knowledge_api_client_id" {
  value = module.identity.knowledge_api_client_id
}

output "knowledge_api_identifier_uri" {
  value = module.identity.knowledge_api_identifier_uri
}

output "e2e_client_id" {
  value = module.identity.e2e_client_id
}
