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
