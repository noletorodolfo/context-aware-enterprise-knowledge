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
