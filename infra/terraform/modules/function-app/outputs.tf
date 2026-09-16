output "function_app_name" {
  value = azurerm_function_app_flex_consumption.api.name
}

output "function_app_url" {
  value = "https://${azurerm_function_app_flex_consumption.api.default_hostname}"
}
