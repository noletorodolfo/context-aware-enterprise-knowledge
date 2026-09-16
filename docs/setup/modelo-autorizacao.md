# Modelo de autorização — empresa parceira

> Modelo simples, não é aconselhamento jurídico. A versão preenchida e assinada fica **fora** do repositório.

---

**Autorização para projeto de demonstração técnica**

A empresa **[RAZÃO SOCIAL]**, CNPJ **[CNPJ]**, representada por **[NOME, CARGO]**, autoriza
**[SEU NOME]** a desenvolver, no tenant Microsoft 365 / Azure da empresa, um projeto de demonstração
técnica chamado _Context-Aware Enterprise Knowledge Platform_, nas seguintes condições:

1. **Escopo.** Criação de um site SharePoint de demonstração (`/sites/kb-demo`), uma app registration,
   dois grupos de segurança, dois usuários de teste e recursos Azure nos tiers gratuitos.
2. **Dados.** O projeto usa apenas documentos fictícios. Nenhum documento, dado pessoal ou informação
   interna da empresa será lido pela solução, copiado ou publicado.
3. **Permissões.** As permissões do Microsoft Graph são delegadas e só retornam conteúdo que o próprio
   usuário conectado já pode acessar. Os usuários de teste só acessam o site de demonstração.
4. **Publicação.** O código-fonte é publicado em repositório público no GitHub sem identificadores do
   tenant, domínio, nomes ou marcas da empresa. Imagens e vídeos são anonimizados.
   [Opcional: a empresa autoriza / não autoriza ser citada nominalmente no portfólio.]
5. **Custos.** Nenhum custo para a empresa além de licenças já existentes para os usuários de teste.
6. **Encerramento.** Ao fim do projeto, ou a pedido da empresa a qualquer momento, todos os recursos
   criados serão removidos (`terraform destroy` e exclusão do site).
7. **Vigência.** De **[DATA INÍCIO]** a **[DATA FIM]**.

[Local], [data]

---

[Assinatura do representante da empresa]

[Assinatura de SEU NOME]
