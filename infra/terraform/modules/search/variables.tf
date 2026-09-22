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
  description = "Fixed 6-character suffix that makes the service name unique (stable across recreations)."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]{6}$", var.name_suffix))
    error_message = "name_suffix must be 6 lowercase letters or digits."
  }
}

variable "function_principal_id" {
  description = "Object ID of the Function App managed identity (query access only)."
  type        = string
}

variable "operator_object_id" {
  description = "Object ID of the human operator who creates the index and uploads chunks."
  type        = string
}

variable "ci_plan_principal_id" {
  description = "Principal ID of the CI plan identity; null until bootstrap creates it."
  type        = string
  default     = null
}
