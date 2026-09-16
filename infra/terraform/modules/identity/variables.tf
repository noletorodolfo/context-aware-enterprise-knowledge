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
