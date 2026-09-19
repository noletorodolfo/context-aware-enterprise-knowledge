variable "subscription_id" {
  description = "Azure subscription ID used by the project."
  type        = string
}

variable "location" {
  description = "Region for the resources."
  type        = string
  default     = "brazilsouth"
}

variable "owner" {
  description = "Value of the owner tag."
  type        = string
}

variable "budget_amount" {
  description = "Monthly limit in the billing account's currency (BRL or USD, depending on the subscription)."
  type        = number
  default     = 10
}

variable "budget_start_date" {
  description = "First day of the current month, in the format 2026-09-01T00:00:00Z."
  type        = string
}

variable "budget_contact_email" {
  description = "Email that receives the budget alerts."
  type        = string
}

variable "github_repository" {
  description = "GitHub repository (owner/name) whose workflows may sign in to Azure."
  type        = string
  default     = "noletorodolfo/context-aware-enterprise-knowledge"
}
