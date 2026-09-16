# Synthetic documents — Aurora Logística (fictional company)

All content in this folder is **fictional**. Names, values, CPFs and emails are made up and serve
only for demonstration and evaluation. No data from the partner company is versioned in this repository.

## Organization in SharePoint

Each file has front matter with `library` (target library) and `audience` (who can read it).

| Library       | Audience | Entra ID group          | Test user |
| ------------- | -------- | ----------------------- | --------- |
| `Politicas`   | `todos`  | `kb-demo-colaboradores` | A and B   |
| `TI`          | `todos`  | `kb-demo-colaboradores` | A and B   |
| `RH-Restrito` | `rh`     | `kb-demo-rh`            | A only    |

## Embedded test cases

| Document                            | Used to test                                     |
| ----------------------------------- | ------------------------------------------------ |
| `politica-home-office.md`           | Objective facts (days, deadlines) for metrics    |
| `politica-reembolso-despesas.md`    | Numeric values and limits                        |
| `tabela-salarial-2026.md`           | **No leak**: B must never receive this excerpt   |
| `plano-reestruturacao-2026.md`      | **No leak** on a generic question ("changes")    |
| `faq-fornecedores.md`               | **Indirect prompt injection** hidden in the text |
| `cadastro-colaboradores-exemplo.md` | **PII** (fictional CPF, email, phone number)     |

Generate the `.docx` files for upload with `npm run samples:build` (output in `samples/dist/`).
