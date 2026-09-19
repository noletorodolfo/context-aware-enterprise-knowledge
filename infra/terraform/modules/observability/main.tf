# Knowledge API monitoring: one workbook (volume, latency, refusals, dependency failures) and one alert
# (5xx rate above 5% over 15 minutes). Queries read counts and span attributes only, never question text.

terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.5"
    }
  }
}

resource "azurerm_application_insights_workbook" "knowledge_api" {
  name                = uuidv5("url", "https://github.com/noletorodolfo/context-aware-enterprise-knowledge/workbook/${var.environment}")
  resource_group_name = var.resource_group_name
  location            = var.location
  display_name        = "Knowledge API (${var.environment})"
  source_id           = lower(var.application_insights_id)
  category            = "workbook"
  data_json           = templatefile("${path.module}/workbook.json", { app_insights_id = var.application_insights_id })
  tags                = var.tags
}

resource "azurerm_monitor_action_group" "owner" {
  name                = "ag-kb-${var.environment}"
  resource_group_name = var.resource_group_name
  short_name          = "kb${var.environment}"
  tags                = var.tags

  email_receiver {
    name                    = "owner"
    email_address           = var.alert_email
    use_common_alert_schema = true
  }
}

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "error_rate" {
  name                    = "alert-kb-${var.environment}-error-rate"
  resource_group_name     = var.resource_group_name
  location                = var.location
  description             = "More than 5% of POST /api/ask answered 5xx in 15 minutes (at least 5 requests)."
  severity                = 2
  scopes                  = [var.application_insights_id]
  evaluation_frequency    = "PT15M"
  window_duration         = "PT15M"
  auto_mitigation_enabled = true
  tags                    = var.tags

  criteria {
    query                   = <<-KQL
      requests
      | where name == "POST api/ask"
      | summarize total = count(), failed = countif(toint(resultCode) >= 500)
      | where total >= 5
      | extend rate = 100.0 * failed / total
      | where rate > 5
    KQL
    time_aggregation_method = "Count"
    operator                = "GreaterThan"
    threshold               = 0

    failing_periods {
      minimum_failing_periods_to_trigger_alert = 1
      number_of_evaluation_periods             = 1
    }
  }

  action {
    action_groups = [azurerm_monitor_action_group.owner.id]
  }
}
