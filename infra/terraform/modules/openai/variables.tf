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

variable "name_suffix" {
  description = "Fixed 6-character suffix that makes global names unique (kept stable across recreations)."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]{6}$", var.name_suffix))
    error_message = "name_suffix must be 6 lowercase letters or digits."
  }
}

variable "embedding_model_name" {
  type    = string
  default = "text-embedding-3-small"
}

variable "embedding_model_version" {
  type    = string
  default = "1"
}

variable "embedding_capacity" {
  description = "Thousands of tokens per minute for the embeddings deployment."
  type        = number
  default     = 10
}
