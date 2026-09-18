import { describe, expect, it } from "vitest";
import { maskPii } from "./pii.js";

describe("maskPii", () => {
  it.each(["529.982.247-25", "52998224725"])("masks a valid CPF (%s)", (cpf) => {
    expect(maskPii(`Reembolso do CPF ${cpf}, por favor`)).toEqual({
      masked: "Reembolso do CPF [CPF], por favor",
      findings: [{ type: "cpf", count: 1 }],
    });
  });

  it.each(["529.982.247-26", "111.111.111-11"])("keeps an invalid CPF (%s)", (cpf) => {
    expect(maskPii(`Número ${cpf}`)).toEqual({ masked: `Número ${cpf}`, findings: [] });
  });

  it.each(["11.222.333/0001-81", "11222333000181"])("masks a valid CNPJ (%s)", (cnpj) => {
    expect(maskPii(`Fornecedor ${cnpj} aprovado?`)).toEqual({
      masked: "Fornecedor [CNPJ] aprovado?",
      findings: [{ type: "cnpj", count: 1 }],
    });
  });

  it("keeps an invalid CNPJ", () => {
    expect(maskPii("CNPJ 11.222.333/0001-82").findings).toEqual([]);
  });

  it("masks email addresses", () => {
    expect(maskPii("Meu e-mail é fulano.silva@empresa.com.br.")).toEqual({
      masked: "Meu e-mail é [EMAIL].",
      findings: [{ type: "email", count: 1 }],
    });
  });

  it.each([
    "(11) 98765-4321",
    "11 3456-7890",
    "+55 11 98765-4321",
    "11987654321",
    "(21) 2345-6789",
  ])("masks the phone number %s", (phone) => {
    expect(maskPii(`Ligue ${phone} hoje`)).toEqual({
      masked: "Ligue [TELEFONE] hoje",
      findings: [{ type: "phone", count: 1 }],
    });
  });

  it.each([
    "Viagem em 12/05/2026",
    "Limite de R$ 1.234,56",
    "Pedido 98765432101",
    "Plano de 2026",
    "Até 3 dias por semana",
  ])("does not mask non-personal numbers: %s", (text) => {
    expect(maskPii(text)).toEqual({ masked: text, findings: [] });
  });

  it("counts multiple occurrences and never keeps the original values", () => {
    const text = "a@x.com e b@y.org, CPF 529.982.247-25";
    const result = maskPii(text);
    expect(result.findings).toEqual([
      { type: "cpf", count: 1 },
      { type: "email", count: 2 },
    ]);
    expect(result.masked).toBe("[EMAIL] e [EMAIL], CPF [CPF]");
    for (const original of ["a@x.com", "b@y.org", "529.982.247-25"]) {
      expect(result.masked).not.toContain(original);
    }
  });

  it("returns the text unchanged when there is no personal data", () => {
    expect(maskPii("Qual o valor do auxílio home office?")).toEqual({
      masked: "Qual o valor do auxílio home office?",
      findings: [],
    });
  });
});
