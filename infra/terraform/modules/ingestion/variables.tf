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

variable "name_suffix" {
  description = "Fixed 6-character suffix that makes global names unique (kept stable across recreations)."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]{6}$", var.name_suffix))
    error_message = "name_suffix must be 6 lowercase letters or digits."
  }
}

variable "tenant_id" {
  description = "Partner tenant: the one that owns SharePoint and the ingestion app registration."
  type        = string
}

variable "ingestion_client_id" {
  description = "Client ID of the app-only ingestion application (Sites.Selected)."
  type        = string
}

variable "cert_thumbprint" {
  description = "SHA-1 thumbprint of the certificate registered on the ingestion application."
  type        = string
}

variable "key_vault_id" {
  description = "Key Vault holding the signing certificate and the webhook client state."
  type        = string
}

variable "signing_key_id" {
  description = "Versionless key URL used to sign the client assertion."
  type        = string
}

variable "signing_key_role_scope" {
  description = "ARM scope of the signing key, for key-level RBAC."
  type        = string
}

variable "site_url" {
  description = "SharePoint site whose libraries are ingested."
  type        = string
}

variable "library_acl" {
  description = "Entra group object ids allowed to read each library, by library name (exact SharePoint spelling)."
  type        = map(list(string))

  validation {
    condition     = length(var.library_acl) > 0
    error_message = "library_acl must configure at least one library."
  }

  validation {
    condition     = alltrue([for groups in values(var.library_acl) : length(groups) > 0])
    error_message = "Every library must list at least one group: ingestion fails closed."
  }
}

variable "search_endpoint" {
  type = string
}

variable "search_service_id" {
  type = string
}

variable "search_index_name" {
  type = string
}

variable "openai_endpoint" {
  type = string
}

variable "openai_account_id" {
  type = string
}

variable "openai_embedding_deployment" {
  type = string
}

variable "application_insights_connection_string" {
  description = "Same Application Insights resource as the API, so one workspace shows both paths."
  type        = string
  sensitive   = true
}

variable "operator_object_id" {
  description = "Object ID of the human operator who inspects the queue and the ingestion state."
  type        = string
}
