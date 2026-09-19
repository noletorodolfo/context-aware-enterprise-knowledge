variable "environment" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "tags" {
  type = map(string)
}

variable "application_insights_id" {
  type = string
}

variable "alert_email" {
  description = "Receives the error-rate alert."
  type        = string
}
