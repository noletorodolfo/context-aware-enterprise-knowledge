variable "environment" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "location" {
  description = "Region of the Azure OpenAI account (Global Standard processes globally)."
  type        = string
}

variable "tags" {
  type = map(string)
}

variable "model_name" {
  type = string
}

variable "model_version" {
  type = string
}

variable "capacity" {
  description = "Deployment capacity in thousands of tokens per minute; kept low as a cost guardrail."
  type        = number
}
