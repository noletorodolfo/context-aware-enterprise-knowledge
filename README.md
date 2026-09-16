# Context-Aware Enterprise Knowledge Platform

Assistente de conhecimento corporativo embutido no SharePoint: responde perguntas **citando as fontes**
e **respeitando as permissões** de quem pergunta. Projeto de portfólio com arquitetura, segurança,
IA governada e infraestrutura como código, a custo zero.

> 🚧 Em construção. Fase atual: **0 — Fundação**. Veja o [plano completo](docs/PLANO.md).

## Estrutura

| Caminho             | Conteúdo                                                     |
| ------------------- | ------------------------------------------------------------ |
| `packages/core`     | Domínio do contexto Query (citações, grounding)              |
| `tools/sample-docs` | Gerador dos `.docx` da empresa fictícia                      |
| `samples/documents` | Documentos sintéticos, incluindo casos de teste de segurança |
| `infra/terraform`   | State remoto, orçamento e identidade no Entra ID             |
| `docs/`             | Plano, guias de setup e (em breve) arquitetura e ADRs        |

## Rodando localmente

Requer Node 22 (ver `.nvmrc`).

```bash
npm install
npm run check          # formatação, lint, typecheck e testes
npm run samples:build  # gera samples/dist/*.docx
```

## Licença

MIT
