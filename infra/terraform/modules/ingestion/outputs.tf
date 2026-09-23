output "function_app_name" {
  value = azurerm_function_app_flex_consumption.this.name
}

output "webhook_url" {
  description = "Notification URL the Graph subscriptions point at."
  value       = local.webhook_url
}

output "queue_name" {
  value = azurerm_storage_queue.changes.name
}

output "poison_queue_name" {
  value = azurerm_storage_queue.poison.name
}

output "storage_account_name" {
  value = azurerm_storage_account.this.name
}

output "principal_id" {
  description = "Managed identity of the ingestion app (index writer)."
  value       = local.principal_id
}
