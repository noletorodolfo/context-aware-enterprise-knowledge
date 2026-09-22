output "endpoint" {
  value = "https://${azurerm_search_service.this.name}.search.windows.net"
}

output "service_id" {
  value = azurerm_search_service.this.id
}

output "service_name" {
  value = azurerm_search_service.this.name
}
