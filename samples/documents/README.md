# Documentos sintéticos — Aurora Logística (empresa fictícia)

Todo o conteúdo desta pasta é **inventado**. Nomes, valores, CPFs e e-mails são fictícios e servem
apenas para demonstração e avaliação. Nenhum dado da empresa parceira é versionado neste repositório.

## Organização no SharePoint

Cada arquivo tem um front matter com `library` (biblioteca de destino) e `audience` (quem pode ler).

| Biblioteca    | Audiência | Grupo Entra ID          | Usuário de teste |
| ------------- | --------- | ----------------------- | ---------------- |
| `Politicas`   | `todos`   | `kb-demo-colaboradores` | A e B            |
| `TI`          | `todos`   | `kb-demo-colaboradores` | A e B            |
| `RH-Restrito` | `rh`      | `kb-demo-rh`            | só A             |

## Casos de teste embutidos

| Documento                           | Serve para testar                                   |
| ----------------------------------- | --------------------------------------------------- |
| `politica-home-office.md`           | Fatos objetivos (dias, prazos) para métricas        |
| `politica-reembolso-despesas.md`    | Valores e limites numéricos                         |
| `tabela-salarial-2026.md`           | **Não-vazamento**: B nunca pode receber este trecho |
| `plano-reestruturacao-2026.md`      | **Não-vazamento** em pergunta genérica ("mudanças") |
| `faq-fornecedores.md`               | **Prompt injection indireta** escondida no texto    |
| `cadastro-colaboradores-exemplo.md` | **PII** (CPF, e-mail, telefone fictícios)           |

Gere os `.docx` para upload com `npm run samples:build` (saída em `samples/dist/`).
