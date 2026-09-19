variable "environment" {
  description = "Environment suffix (dev, prod)."
  type        = string
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

variable "tenant_id" {
  description = "Entra ID tenant whose tokens the API accepts."
  type        = string
}

variable "api_client_id" {
  description = "Application (client) ID of the Knowledge API app registration."
  type        = string
}

variable "cors_allowed_origins" {
  description = "Browser origins allowed to call the API (the SharePoint tenant origin)."
  type        = list(string)
}

variable "extra_app_settings" {
  description = "Additional app settings (non-secret configuration)."
  type        = map(string)
  default     = {}
}

variable "name_suffix" {
  description = "Fixed 6-character suffix that makes global names unique (kept stable across recreations)."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]{6}$", var.name_suffix))
    error_message = "name_suffix must be 6 lowercase letters or digits."
  }
}
