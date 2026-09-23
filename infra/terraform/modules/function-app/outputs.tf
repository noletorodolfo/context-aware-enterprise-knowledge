output "function_app_name" {
  value = azurerm_function_app_flex_consumption.api.name
}

output "function_app_url" {
  value = "https://${azurerm_function_app_flex_consumption.api.default_hostname}"
}

output "principal_id" {
  description = "Object ID of the Function App's system-assigned managed identity."
  value       = azurerm_function_app_flex_consumption.api.identity[0].principal_id
}

output "application_insights_id" {
  value = azurerm_application_insights.this.id
}

output "log_analytics_workspace_id" {
  value = azurerm_log_analytics_workspace.this.id
}

output "application_insights_connection_string" {
  description = "Shared with the ingestion app so one workspace shows both services."
  value       = azurerm_application_insights.this.connection_string
  sensitive   = true
}
