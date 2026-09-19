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

# Read by envs/dev-identity to register the OBO certificate on the API app (partner tenant).
output "obo_certificate" {
  value = {
    data_base64 = module.obo_certificate.certificate_data_base64
    end_date    = module.obo_certificate.expires
  }
}

output "application_insights_id" {
  value = module.function_app.application_insights_id
}

output "log_analytics_workspace_id" {
  value = module.function_app.log_analytics_workspace_id
}
