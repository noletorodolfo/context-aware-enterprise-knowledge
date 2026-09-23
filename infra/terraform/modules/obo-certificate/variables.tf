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

variable "subject_name" {
  description = "Certificate subject CN, e.g. kb-knowledge-api-dev-obo."
  type        = string
}

variable "ingestion_subject_name" {
  description = "Certificate subject CN for the ingestion application, e.g. kb-ingestion-dev."
  type        = string
}

variable "name_suffix" {
  description = "Fixed 6-character suffix that makes global names unique (kept stable across recreations)."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]{6}$", var.name_suffix))
    error_message = "name_suffix must be 6 lowercase letters or digits."
  }
}

variable "operator_object_id" {
  description = "Object ID of the human operator (Key Vault Certificates Officer)."
  type        = string
}

variable "ci_apply_principal_id" {
  description = "Principal ID of the CI apply identity; null until bootstrap creates it."
  type        = string
  default     = null
}

variable "ci_plan_principal_id" {
  description = "Principal ID of the CI plan identity; null until bootstrap creates it."
  type        = string
  default     = null
}
