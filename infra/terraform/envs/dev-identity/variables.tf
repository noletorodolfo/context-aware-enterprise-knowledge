variable "tenant_id" {
  description = "Entra ID tenant of the partner company (identity and SharePoint)."
  type        = string
}

variable "test_user_a_upn" {
  type = string
}

variable "test_user_b_upn" {
  type = string
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
