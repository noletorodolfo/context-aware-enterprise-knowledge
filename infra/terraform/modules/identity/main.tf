# Identidade do projeto no Entra ID:
# - app registration da Knowledge API (expõe o scope chamado pelo SPFx);
# - grupos de segurança que definem quem lê cada biblioteca da demo.
#
# O SPFx NÃO tem app registration própria: o AadHttpClient usa o principal
# "SharePoint Online Client Extensibility Web Application Principal" do tenant,
# autorizado pela página "API access" do SharePoint Admin Center.

terraform {
  required_providers {
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.9"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }
}

data "azuread_client_config" "current" {}

data "azuread_application_published_app_ids" "well_known" {}

data "azuread_service_principal" "graph" {
  client_id = data.azuread_application_published_app_ids.well_known.result["MicrosoftGraph"]
}

locals {
  owners = [data.azuread_client_config.current.object_id]
  # Delegadas: o Graph Search só devolve o que o próprio usuário já pode abrir.
  graph_delegated_scopes = ["Files.Read.All", "Sites.Read.All"]
}

resource "random_uuid" "user_impersonation" {}

resource "azuread_application" "knowledge_api" {
  display_name     = "kb-knowledge-api-${var.environment}"
  sign_in_audience = "AzureADMyOrg"
  owners           = local.owners

  api {
    requested_access_token_version = 2

    oauth2_permission_scope {
      id                         = random_uuid.user_impersonation.result
      value                      = "user_impersonation"
      type                       = "User"
      enabled                    = true
      admin_consent_display_name = "Consultar a base de conhecimento"
      admin_consent_description  = "Permite fazer perguntas à Knowledge API em nome do usuário conectado."
      user_consent_display_name  = "Consultar a base de conhecimento"
      user_consent_description   = "Permite fazer perguntas à base de conhecimento em seu nome."
    }
  }

  required_resource_access {
    resource_app_id = data.azuread_service_principal.graph.client_id

    dynamic "resource_access" {
      for_each = local.graph_delegated_scopes
      content {
        id   = data.azuread_service_principal.graph.oauth2_permission_scope_ids[resource_access.value]
        type = "Scope"
      }
    }
  }

  lifecycle {
    ignore_changes = [identifier_uris]
  }
}

resource "azuread_application_identifier_uri" "knowledge_api" {
  application_id = azuread_application.knowledge_api.id
  identifier_uri = "api://${azuread_application.knowledge_api.client_id}"
}

resource "azuread_service_principal" "knowledge_api" {
  client_id = azuread_application.knowledge_api.client_id
  owners    = local.owners
}

# Consentimento de administrador (tenant inteiro) para as permissões delegadas do Graph.
resource "azuread_service_principal_delegated_permission_grant" "graph" {
  count = var.grant_admin_consent ? 1 : 0

  service_principal_object_id          = azuread_service_principal.knowledge_api.object_id
  resource_service_principal_object_id = data.azuread_service_principal.graph.object_id
  claim_values                         = local.graph_delegated_scopes
}

data "azuread_users" "test_users" {
  user_principal_names = [var.test_user_a_upn, var.test_user_b_upn]
}

locals {
  user_a_id = data.azuread_users.test_users.object_ids[0]
  user_b_id = data.azuread_users.test_users.object_ids[1]
}

resource "azuread_group" "colaboradores" {
  display_name     = "kb-demo-colaboradores"
  description      = "Leitura das bibliotecas Politicas e TI do site de demo."
  security_enabled = true
  owners           = local.owners
  members          = [local.user_a_id, local.user_b_id]
}

resource "azuread_group" "rh" {
  display_name     = "kb-demo-rh"
  description      = "Leitura da biblioteca RH-Restrito do site de demo."
  security_enabled = true
  owners           = local.owners
  members          = [local.user_a_id]
}
