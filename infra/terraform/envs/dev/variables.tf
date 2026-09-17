variable "tenant_id" {
  description = "Entra ID tenant of the partner company (identity and SharePoint)."
  type        = string
}

variable "subscription_id" {
  description = "Personal Azure subscription that hosts the paid resources."
  type        = string
}

variable "location" {
  description = "Region for dev resources."
  type        = string
  default     = "brazilsouth"
}

variable "owner" {
  description = "Value of the owner tag."
  type        = string
}

variable "sharepoint_origin" {
  description = "SharePoint origin allowed by CORS, e.g. https://contoso.sharepoint.com (no trailing slash)."
  type        = string

  validation {
    condition     = can(regex("^https://[a-z0-9-]+\\.sharepoint\\.com$", var.sharepoint_origin))
    error_message = "sharepoint_origin must look like https://<tenant>.sharepoint.com with no trailing slash."
  }
}

variable "test_user_a_upn" {
  type = string
}

variable "test_user_b_upn" {
  type = string
}

variable "search_site_urls" {
  description = "SharePoint site URLs the assistant may search, e.g. [\"https://contoso.sharepoint.com/sites/kb-demo\"]."
  type        = list(string)

  validation {
    condition     = length(var.search_site_urls) > 0 && alltrue([for u in var.search_site_urls : can(regex("^https://[a-z0-9-]+\\.sharepoint\\.com/sites/[A-Za-z0-9_-]+$", u))])
    error_message = "Each entry must look like https://<tenant>.sharepoint.com/sites/<name> with no trailing slash."
  }
}

variable "openai_location" {
  type    = string
  default = "eastus2"
}

variable "openai_model_name" {
  type    = string
  default = "gpt-4.1-mini"
}

variable "openai_model_version" {
  type    = string
  default = "2025-04-14"
}

variable "openai_capacity" {
  type    = number
  default = 10
}
