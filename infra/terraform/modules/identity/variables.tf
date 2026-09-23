variable "environment" {
  description = "Environment suffix (dev, prod)."
  type        = string
}

variable "test_user_a_upn" {
  description = "UPN of test user A (accesses everything, including RH-Restrito)."
  type        = string
}

variable "test_user_b_upn" {
  description = "UPN of test user B (no access to RH-Restrito)."
  type        = string
}

variable "grant_admin_consent" {
  description = "Grants admin consent for the Graph delegated permissions."
  type        = bool
  default     = true
}

variable "grant_graph_app_roles" {
  description = <<-EOT
    Grants admin consent for the Graph application permissions of the ingestion app.
    Cloud Application Administrator cannot do this: Microsoft excludes Graph app roles from the
    consent that role may give, so it needs Privileged Role Administrator or Global Administrator.
    Set to false when a tenant administrator grants the consent outside Terraform, so the two do
    not fight over the same assignment.
  EOT
  type        = bool
  default     = true
}
