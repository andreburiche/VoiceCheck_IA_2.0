import { describe, expect, it } from "vitest";

import { limparAnamnese, linhasAnamnese, resumoAnamnese } from "@/lib/voz-clinica-anamnese";

describe("limparAnamnese", () => {
  it("tira vazios e espaços, mas mantém false e zero", () => {
    expect(limparAnamnese({ queixa: "  rouca  ", profissao: " ", sintomas: [], refluxo: false, agua_copos_dia: 0, inicio: null, horas_voz_dia: NaN }))
      .toEqual({ queixa: "rouca", refluxo: false, agua_copos_dia: 0 });
  });
});

describe("linhasAnamnese", () => {
  it("traduz códigos em texto, na ordem do formulário", () => {
    const l = linhasAnamnese({ refluxo: true, queixa: "Rouquidão", inicio: "mais_1_ano", sintomas: ["rouquidao", "pigarro"], horas_voz_dia: 6.5, agua_copos_dia: 1 });
    expect(l).toEqual([
      ["Queixa principal", "Rouquidão"],
      ["Há quanto tempo", "Mais de 1 ano"],
      ["Sintomas", "Rouquidão, Pigarro"],
      ["Uso da voz por dia", "6,5 h"],
      ["Água por dia", "1 copo"],
      ["Refluxo ou azia frequente", "Sim"],
    ]);
  });
  it("não mostra o que não foi respondido", () => {
    expect(linhasAnamnese({ fono_anterior: false })).toEqual([["Já fez terapia fonoaudiológica para a voz", "Não"]]);
  });
});

describe("resumoAnamnese", () => {
  it("queixa, tempo, sintomas e uso profissional", () => {
    expect(resumoAnamnese({ queixa: "Rouquidão", inicio: "1_a_6_meses", sintomas: ["rouquidao"], uso_profissional: "fala_e_canto" }))
      .toBe("Rouquidão · 1 a 6 meses · 1 sintoma · uso profissional (fala e canto)");
  });
  it("corta queixa longa e cai para a contagem quando não há o principal", () => {
    expect(resumoAnamnese({ queixa: "a".repeat(120) }).length).toBe(80);
    expect(resumoAnamnese({ tabagismo: "nunca", refluxo: false })).toBe("2 campos preenchidos");
  });
});
