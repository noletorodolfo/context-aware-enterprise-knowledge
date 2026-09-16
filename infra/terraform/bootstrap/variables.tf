variable "subscription_id" {
  description = "ID da subscription Azure usada no projeto."
  type        = string
}

variable "location" {
  description = "Região dos recursos."
  type        = string
  default     = "brazilsouth"
}

variable "owner" {
  description = "Valor da tag owner."
  type        = string
}

variable "budget_amount" {
  description = "Limite mensal na moeda da conta de cobrança (BRL ou USD, conforme a subscription)."
  type        = number
  default     = 10
}

variable "budget_start_date" {
  description = "Primeiro dia do mês corrente, no formato 2026-09-01T00:00:00Z."
  type        = string
}

variable "budget_contact_email" {
  description = "E-mail que recebe os alertas de orçamento."
  type        = string
}
