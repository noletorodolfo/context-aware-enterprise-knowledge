output "workbook_id" {
  value = azurerm_application_insights_workbook.knowledge_api.id
}

output "alert_id" {
  value = azurerm_monitor_scheduled_query_rules_alert_v2.error_rate.id
}
