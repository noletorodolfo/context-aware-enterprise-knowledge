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

variable "name_suffixes" {
  description = "Fixed suffixes of the global resource names, one per module (stable across recreations)."
  type = object({
    function_app = string
    openai       = string
    key_vault    = string
    search       = string
  })
}

variable "search_backend" {
  description = "Default retriever of the deployed API: graph or aisearch."
  type        = string
  default     = "graph"

  validation {
    condition     = contains(["graph", "aisearch"], var.search_backend)
    error_message = "search_backend must be graph or aisearch."
  }
}

variable "search_index_name" {
  type    = string
  default = "kb-chunks-dev"
}

variable "operator_object_id" {
  description = "Object ID of the human operator (OpenAI user for the evaluation judge, Key Vault certificates)."
  type        = string
}

variable "ci_plan_principal_id" {
  description = "Principal ID of the CI plan identity (bootstrap output ci_plan_principal_id)."
  type        = string
  default     = null
}

variable "ci_apply_principal_id" {
  description = "Principal ID of the CI apply identity (bootstrap output ci_apply_principal_id)."
  type        = string
  default     = null
}

variable "state_resource_group_name" {
  description = "Resource group of the Terraform state storage (bootstrap output)."
  type        = string
}

variable "state_storage_account_name" {
  description = "Storage account of the Terraform state (bootstrap output)."
  type        = string
}

variable "state_container_name" {
  type    = string
  default = "tfstate"
}

variable "alert_email" {
  description = "Receives the error-rate alert."
  type        = string
}
