# Phase 0 — Foundation: execution guide

Definition of done: `npm run check` passes locally **and** the demo site exists with distinct
permissions for test users A and B.

## Checklist

| #   | Item                                                        | Where                  | Status |
| --- | ----------------------------------------------------------- | ---------------------- | ------ |
| 1   | Monorepo, lint, formatter, tests (`npm run check`)          | Local                  | ✅     |
| 2   | Synthetic documents and `.docx` generator                   | `samples/`             | ✅     |
| 3   | Terraform for remote state, budget and identity (validated) | `infra/terraform/`     | ✅     |
| 4   | Written authorization from the partner company              | Outside the repository | ✅     |
| 5   | Azure CLI installed and logged in to the tenant             | Local                  | ✅     |
| 6   | Bootstrap `terraform apply`                                 | Subscription           | ✅     |
| 7   | Test users A and B with SharePoint access                   | Entra ID / M365 admin  | ✅     |
| 8   | `terraform apply` for `envs/dev` (API + groups)             | Entra ID               | ✅     |
| 9   | Demo site, libraries and permissions                        | SharePoint             | ✅     |
| 10  | Document upload and search test with A and B                | SharePoint             | ✅     |

## Required administrative roles

| Action                                          | Minimum role                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Bootstrap (storage + role assignment + budget)  | Subscription Owner (or Contributor + User Access Administrator)                                       |
| API app registration                            | Cloud Application Administrator                                                                       |
| Admin consent for delegated permissions         | Cloud Application Administrator (validated)                                                           |
| Admin consent for Graph application permissions | Privileged Role Administrator or Global Administrator (Cloud Application Administrator is not enough) |
| Security groups                                 | Groups Administrator                                                                                  |
| Demo site and API access approval (Phase 1)     | SharePoint Administrator                                                                              |

## 5. Azure CLI and login

The project uses **two tenants** (ADR-011):

| Tenant            | What lives in it                                            | Terraform provider |
| ----------------- | ----------------------------------------------------------- | ------------------ |
| Partner company   | SharePoint, users, groups, API app registration             | `azuread`          |
| Personal (AZ-104) | Subscription: remote state, Functions, App Insights, Search | `azurerm`          |

```bash
sudo pacman -S azure-cli                                    # Arch; other distros: Microsoft docs
az login --tenant <PERSONAL_TENANT_ID>                       # has the subscription
az login --tenant <COMPANY_TENANT_ID> --allow-no-subscriptions
az account list -o table                                    # both accounts should show up
az account set --subscription <PERSONAL_SUBSCRIPTION_ID>
```

**A single identity operates both tenants.** The CLI requests a token for `--tenant` using the
**active** account, so `envs/dev` (state in personal storage + objects in the company's Entra)
needs an account that exists in both. The model adopted is that of an external consultant:

- the personal account is **invited (B2B)** into the company's tenant;
- it receives only **Cloud Application Administrator** and **Groups Administrator** (no Global Admin);
- log in once to that tenant with the personal account:
  `az login --tenant <COMPANY_TENANT_ID> --allow-no-subscriptions`.

This way `azurerm` uses the personal subscription and `azuread` uses the company's tenant, with the same account.

Pitfalls:

- `az account list` shows the state **as of login time**. After reactivating a subscription in
  the portal, use `az account list --all --refresh`.
- The last `az login` becomes the default. Run `az account set` last, otherwise stray `az`
  commands fall back to the company's subscription.
- To test against the company's tenant, pass `--subscription` (or `--tenant` with the right account active):
  `az account get-access-token --tenant <COMPANY_TENANT_ID>` with the personal account active fails with
  `AADSTS50020`, because the personal account does not exist in that tenant.
- The `account` extension is not required. If an interrupted install corrupts
  `~/.azure/cliextensions/account`, every `az` command breaks: remove the folder.

## 6. Bootstrap (remote state + budget)

```bash
cd infra/terraform/bootstrap
cp terraform.tfvars.example terraform.tfvars   # fill in
terraform init
terraform apply
terraform output -raw backend_config > ../envs/dev/backend.hcl
```

The bootstrap state stays local (`terraform.tfstate`, git-ignored). Keep a copy outside the repository.

Pitfalls:

- **A new subscription** doesn't have its resource providers registered, and the apply fails with
  `MissingSubscriptionRegistration`. Register them beforehand (the following phases use the rest):
  `az provider register --namespace Microsoft.Storage --wait` (then `Microsoft.Web`,
  `Microsoft.Insights`, `Microsoft.OperationalInsights`, `Microsoft.Search`, `Microsoft.KeyVault`).
- **`budget_amount` uses the billing account's currency.** An account created as free-tier bills in USD.
- **The budget alert doesn't block spend**, it only sends an email.
- **PowerShell 5.1** splits `-out=file.tfplan` into two arguments: use quotes (`"-out=bootstrap.tfplan"`).

## 8. Identity (Knowledge API + groups)

```bash
cd infra/terraform/envs/dev
cp terraform.tfvars.example terraform.tfvars   # fill in tenant and UPNs for A and B
terraform init -backend-config=backend.hcl
terraform apply
```

Expected result: app `kb-knowledge-api-dev` with the `user_impersonation` scope, consent for
`Files.Read.All`, `Sites.Read.All` and `User.Read` (delegated), and the groups `kb-demo-colaboradores` (A, B) and `kb-demo-rh` (A).

> If you already created an app registration manually before, it can be removed: this one becomes the official one.

## 9. Demo site in SharePoint

1. SharePoint Admin Center → **Active sites → Create → Communication site**.
   Name `KB Demo`, address `/sites/kb-demo`.
2. On the site, create three **document libraries**: `Politicas`, `TI`, `RH-Restrito`.
3. **Site permissions** → add `kb-demo-colaboradores` as **Visitors** (read).
4. On `RH-Restrito` → Library settings → **Permissions for this document library**:
   - **Stop inheriting permissions**;
   - remove the site's Visitors and Members groups;
   - grant **Read** to `kb-demo-rh`.

Newly created groups can take a few minutes to show up in the people picker.

## 10. Documents and verification

```bash
npm run samples:build
```

Upload each folder from `samples/dist/<Library>/` to the library of the same name.

Search indexing can take anywhere from 15 minutes to a few hours. Afterwards, verify in a private window:

| Test                                          | User A   | User B              |
| --------------------------------------------- | -------- | ------------------- |
| Search "home office" on the site              | finds it | finds it            |
| Search "tabela salarial" on the site          | finds it | **doesn't find it** |
| Open the direct URL of `tabela-salarial-2026` | opens    | **access denied**   |

If neither user finds anything, check whether the tenant uses **Restricted SharePoint Search** or
whether the site is excluded from search (Site settings → Search and offline availability).

Capture screenshots of this table (anonymized): this is the first piece of evidence for the no-leak test.
