variable "environment" {
  description = "Sufixo de ambiente (dev, prod)."
  type        = string
}

variable "test_user_a_upn" {
  description = "UPN do usuário de teste A (acessa tudo, inclusive RH-Restrito)."
  type        = string
}

variable "test_user_b_upn" {
  description = "UPN do usuário de teste B (sem acesso a RH-Restrito)."
  type        = string
}

variable "grant_admin_consent" {
  description = "Concede consentimento de administrador às permissões delegadas do Graph."
  type        = bool
  default     = true
}
