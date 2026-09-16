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
