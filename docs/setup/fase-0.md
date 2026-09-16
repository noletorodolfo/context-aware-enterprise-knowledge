# Fase 0 — Fundação: guia de execução

Critério de pronto: `npm run check` passa localmente **e** o site de demo existe com permissões
distintas para os usuários de teste A e B.

## Checklist

| #   | Item                                                         | Onde                  | Status |
| --- | ------------------------------------------------------------ | --------------------- | ------ |
| 1   | Monorepo, lint, formatter, testes (`npm run check`)          | Local                 | ✅     |
| 2   | Documentos sintéticos e gerador de `.docx`                   | `samples/`            | ✅     |
| 3   | Terraform de state remoto, orçamento e identidade (validado) | `infra/terraform/`    | ✅     |
| 4   | Autorização escrita da empresa parceira                      | Fora do repositório   | ✅     |
| 5   | Azure CLI instalada e login no tenant                        | Local                 | ✅     |
| 6   | `terraform apply` do bootstrap                               | Subscription          | ✅     |
| 7   | Usuários de teste A e B com acesso ao SharePoint             | Entra ID / M365 admin | ✅     |
| 8   | `terraform apply` de `envs/dev` (API + grupos)               | Entra ID              | ✅     |
| 9   | Site de demo, bibliotecas e permissões                       | SharePoint            | ✅     |
| 10  | Upload dos documentos e teste de busca com A e B             | SharePoint            | ✅     |

## Funções administrativas necessárias

| Ação                                              | Função mínima                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| Bootstrap (storage + role assignment + orçamento) | Owner da subscription (ou Contributor + User Access Administrator) |
| App registration da API                           | Cloud Application Administrator                                    |
| Consentimento de admin às permissões delegadas    | Cloud Application Administrator (validado)                         |
| Grupos de segurança                               | Groups Administrator                                               |
| Site de demo e aprovação de API access (Fase 1)   | SharePoint Administrator                                           |

## 5. Azure CLI e login

O projeto usa **dois tenants** (ADR-011):

| Tenant           | O que fica nele                                             | Provider Terraform |
| ---------------- | ----------------------------------------------------------- | ------------------ |
| Empresa parceira | SharePoint, usuários, grupos, app registration da API       | `azuread`          |
| Pessoal (AZ-104) | Subscription: state remoto, Functions, App Insights, Search | `azurerm`          |

```bash
sudo pacman -S azure-cli                                    # Arch; outras distros: docs da Microsoft
az login --tenant <TENANT_ID_PESSOAL>                       # tem subscription
az login --tenant <TENANT_ID_EMPRESA> --allow-no-subscriptions
az account list -o table                                    # as duas contas devem aparecer
az account set --subscription <SUBSCRIPTION_ID_PESSOAL>
```

**Uma identidade só opera os dois tenants.** A CLI pede token para `--tenant` usando a conta
**ativa**, então o `envs/dev` (state no storage pessoal + objetos no Entra da empresa) precisa de uma
conta que exista nos dois. O modelo adotado é o de consultor externo:

- a conta pessoal é **convidada (B2B)** no tenant da empresa;
- recebe só **Cloud Application Administrator** e **Groups Administrator** (sem Global Admin);
- login uma vez nesse tenant com a conta pessoal:
  `az login --tenant <TENANT_ID_EMPRESA> --allow-no-subscriptions`.

Assim o `azurerm` usa a subscription pessoal e o `azuread` usa o tenant da empresa, com a mesma conta.

Armadilhas:

- `az account list` mostra o estado **do momento do login**. Depois de reativar uma subscription no
  portal, use `az account list --all --refresh`.
- O último `az login` vira o default. Rode o `az account set` por último, senão comandos `az` soltos
  caem na subscription da empresa.
- Para testar o tenant da empresa, passe `--subscription` (ou `--tenant` com a conta certa ativa):
  `az account get-access-token --tenant <TENANT_ID_EMPRESA>` com a conta pessoal ativa falha com
  `AADSTS50020`, porque a conta pessoal não existe naquele tenant.
- A extensão `account` não é necessária. Se uma instalação interrompida corromper
  `~/.azure/cliextensions/account`, todo comando `az` quebra: remova a pasta.

## 6. Bootstrap (state remoto + orçamento)

```bash
cd infra/terraform/bootstrap
cp terraform.tfvars.example terraform.tfvars   # preencher
terraform init
terraform apply
terraform output -raw backend_config > ../envs/dev/backend.hcl
```

O state do bootstrap fica local (`terraform.tfstate`, ignorado pelo git). Guarde uma cópia fora do repositório.

Armadilhas:

- **Subscription nova** não tem os resource providers registrados, e o apply falha com
  `MissingSubscriptionRegistration`. Registre antes (as fases seguintes usam os demais):
  `az provider register --namespace Microsoft.Storage --wait` (depois `Microsoft.Web`,
  `Microsoft.Insights`, `Microsoft.OperationalInsights`, `Microsoft.Search`, `Microsoft.KeyVault`).
- **`budget_amount` usa a moeda da conta de cobrança.** Conta criada como gratuita cobra em USD.
- **O alerta de orçamento não bloqueia gasto**, só envia e-mail.
- **PowerShell 5.1** quebra `-out=arquivo.tfplan` em dois argumentos: use aspas (`"-out=bootstrap.tfplan"`).

## 8. Identidade (Knowledge API + grupos)

```bash
cd infra/terraform/envs/dev
cp terraform.tfvars.example terraform.tfvars   # preencher tenant e UPNs de A e B
terraform init -backend-config=backend.hcl
terraform apply
```

Resultado esperado: app `kb-knowledge-api-dev` com scope `user_impersonation`, consentimento para
`Files.Read.All` e `Sites.Read.All` (delegadas) e os grupos `kb-demo-colaboradores` (A, B) e `kb-demo-rh` (A).

> Se você já criou uma app registration manualmente antes, ela pode ser removida: esta passa a ser a oficial.

## 9. Site de demo no SharePoint

1. SharePoint Admin Center → **Sites ativos → Criar → Site de comunicação**.
   Nome `KB Demo`, endereço `/sites/kb-demo`.
2. No site, crie três **bibliotecas de documentos**: `Politicas`, `TI`, `RH-Restrito`.
3. **Permissões do site** → adicionar `kb-demo-colaboradores` como **Visitantes** (leitura).
4. Em `RH-Restrito` → Configurações da biblioteca → **Permissões desta biblioteca**:
   - **Parar de herdar permissões**;
   - remover os grupos Visitantes e Membros do site;
   - conceder **Leitura** a `kb-demo-rh`.

Grupos recém-criados podem levar alguns minutos para aparecer no seletor de pessoas.

## 10. Documentos e verificação

```bash
npm run samples:build
```

Suba cada pasta de `samples/dist/<Biblioteca>/` para a biblioteca de mesmo nome.

A indexação da busca pode levar de 15 minutos a algumas horas. Depois, verifique numa janela anônima:

| Teste                                        | Usuário A | Usuário B         |
| -------------------------------------------- | --------- | ----------------- |
| Buscar "home office" no site                 | encontra  | encontra          |
| Buscar "tabela salarial" no site             | encontra  | **não encontra**  |
| Abrir a URL direta de `tabela-salarial-2026` | abre      | **acesso negado** |

Se nenhum usuário encontra nada, verifique se o tenant usa **Restricted SharePoint Search** ou se
o site está excluído da busca (Configurações do site → Pesquisa e disponibilidade offline).

Capture prints dessa tabela (anonimizados): é a primeira evidência do teste de não-vazamento.
