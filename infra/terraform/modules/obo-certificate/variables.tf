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
