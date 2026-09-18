output "identity" {
  value = module.identity
}

output "e2e_client_id" {
  value = module.identity.e2e_client_id
}

output "knowledge_api_identifier_uri" {
  value = module.identity.knowledge_api_identifier_uri
}

output "function_app_name" {
  value = module.function_app.function_app_name
}

output "function_app_url" {
  value = module.function_app.function_app_url
}

output "openai_endpoint" {
  value = module.openai.endpoint
}

output "openai_deployment" {
  value = module.openai.deployment_name
}
