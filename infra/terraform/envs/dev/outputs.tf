output "identity" {
  value = module.identity
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
