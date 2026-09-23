# Project identity in Entra ID:
# - Knowledge API app registration (exposes the scope called by the SPFx);
# - security groups that define who can read each demo library.
#
# The SPFx does NOT have its own app registration: AadHttpClient uses the tenant's
# "SharePoint Online Client Extensibility Web Application Principal",
# authorized on the "API access" page of the SharePoint Admin Center.

terraform {
  required_version = ">= 1.9"

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
  # Delegated: Graph Search only returns what the user themselves can already open.
  # User.Read also allows /me/memberOf, which gives the AI Search retriever the caller's group ids.
  graph_delegated_scopes = ["Files.Read.All", "Sites.Read.All", "User.Read"]
}

resource "random_uuid" "user_impersonation" {}

resource "random_uuid" "evaluator_role" {}

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

  # Holders receive pipeline diagnostics from /api/ask (evaluation runs only).
  app_role {
    id                   = random_uuid.evaluator_role.result
    value                = "Evaluator"
    display_name         = "Evaluator"
    description          = "Receives retrieval and pipeline diagnostics for quality evaluation."
    allowed_member_types = ["User"]
    enabled              = true
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

# Admin consent (whole tenant) for the Graph delegated permissions.
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

# Only the two test users may receive evaluation diagnostics.
resource "azuread_app_role_assignment" "evaluator" {
  for_each = { a = local.user_a_id, b = local.user_b_id }

  app_role_id         = random_uuid.evaluator_role.result
  principal_object_id = each.value
  resource_object_id  = azuread_service_principal.knowledge_api.object_id
}

resource "azuread_group" "rh" {
  display_name     = "kb-demo-rh"
  description      = "Leitura da biblioteca RH-Restrito do site de demo."
  security_enabled = true
  owners           = local.owners
  members          = [local.user_a_id]
}

# Public client used only by the end-to-end no-leak test (interactive sign-in, no secret).
resource "azuread_application" "e2e_client" {
  display_name                   = "kb-e2e-client-${var.environment}"
  sign_in_audience               = "AzureADMyOrg"
  owners                         = local.owners
  fallback_public_client_enabled = false

  public_client {
    redirect_uris = ["http://localhost"]
  }

  required_resource_access {
    resource_app_id = azuread_application.knowledge_api.client_id

    resource_access {
      id   = random_uuid.user_impersonation.result
      type = "Scope"
    }
  }

  # The indexing CLI reads the demo libraries as the signed-in operator (Phase 6).
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
}

resource "azuread_service_principal" "e2e_client" {
  client_id = azuread_application.e2e_client.client_id
  owners    = local.owners
}

resource "azuread_service_principal_delegated_permission_grant" "e2e_client" {
  service_principal_object_id          = azuread_service_principal.e2e_client.object_id
  resource_service_principal_object_id = azuread_service_principal.knowledge_api.object_id
  claim_values                         = ["user_impersonation"]
}

resource "azuread_service_principal_delegated_permission_grant" "e2e_client_graph" {
  count = var.grant_admin_consent ? 1 : 0

  service_principal_object_id          = azuread_service_principal.e2e_client.object_id
  resource_service_principal_object_id = data.azuread_service_principal.graph.object_id
  claim_values                         = local.graph_delegated_scopes
}

# Application (app-only) permission for ingestion. Sites.Selected grants nothing by itself: access is
# granted per site, so this identity can read the demo site and no other content in the tenant. The
# per-site grant is an operator step (see the Phase 7 runbook), because it is a Graph data-plane call.
locals {
  graph_app_roles = ["Sites.Selected"]
}

resource "azuread_application" "ingestion" {
  display_name     = "kb-ingestion-${var.environment}"
  sign_in_audience = "AzureADMyOrg"
  owners           = local.owners

  required_resource_access {
    resource_app_id = data.azuread_service_principal.graph.client_id

    dynamic "resource_access" {
      for_each = local.graph_app_roles
      content {
        id   = data.azuread_service_principal.graph.app_role_ids[resource_access.value]
        type = "Role"
      }
    }
  }
}

resource "azuread_service_principal" "ingestion" {
  client_id = azuread_application.ingestion.client_id
  owners    = local.owners
}

# Admin consent for the application permission. Tenant-wide consent to Sites.Selected still exposes
# no content until a site grant exists.
resource "azuread_app_role_assignment" "ingestion_graph" {
  for_each = var.grant_admin_consent ? toset(local.graph_app_roles) : toset([])

  app_role_id         = data.azuread_service_principal.graph.app_role_ids[each.value]
  principal_object_id = azuread_service_principal.ingestion.object_id
  resource_object_id  = data.azuread_service_principal.graph.object_id
}
