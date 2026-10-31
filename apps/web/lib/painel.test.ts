import { describe, expect, it } from "vitest";

import {
  consultasDeHoje,
  contarPorSituacao,
  diasDesde,
  faixasReavaliacao,
  filtrarAgendaHoje,
  proximaConsulta,
} from "@/lib/painel";
import type { Consulta, PacienteResumo } from "@/lib/voz-clinica-api";

const AGORA = new Date(2026, 10, 3, 12, 0); // 03/11/2026 12:00 local

function consulta(h: number, situacao: Consulta["situacao"] = "agendada", dia = 3): Consulta {
  const inicio = new Date(2026, 10, dia, h, 0);
  const fim = new Date(inicio.getTime() + 50 * 60_000);
  return { id: `${dia}-${h}-${situacao}`, paciente: "Ana", inicio: inicio.toISOString(), fim: fim.toISOString(), duracao_min: 50,
    tipo: "terapia", modalidade: "presencial", situacao, observacoes: null, atualizado_em: inicio.toISOString() };
}

function paciente(diasAtras: number): PacienteResumo {
  return { paciente: `P${diasAtras}`, avaliacoes: 1, ultima: new Date(AGORA.getTime() - diasAtras * 86_400_000).toISOString() };
}

describe("diasDesde", () => {
  it("conta dias inteiros e nunca fica negativo", () => {
    expect(diasDesde(new Date(AGORA.getTime() - 3.5 * 86_400_000).toISOString(), AGORA)).toBe(3);
    expect(diasDesde(new Date(AGORA.getTime() + 86_400_000).toISOString(), AGORA)).toBe(0);
    expect(diasDesde("data ruim", AGORA)).toBeNull();
  });
});

describe("faixasReavaliacao", () => {
  it("separa nas faixas 0–30, 31–60, 61–90 e 90+, com os limites certos", () => {
    const f = faixasReavaliacao([paciente(0), paciente(30), paciente(31), paciente(60), paciente(90), paciente(91), paciente(400)], AGORA);
    expect(f.map((x) => x.pacientes)).toEqual([2, 2, 1, 2]);
    expect(f.map((x) => x.alerta)).toEqual([false, false, false, true]);
  });
  it("ignora data inválida", () => {
    expect(faixasReavaliacao([{ paciente: "X", avaliacoes: 0, ultima: "" }], AGORA).every((x) => x.pacientes === 0)).toBe(true);
  });
});

describe("agenda de hoje", () => {
  const lista = [consulta(15), consulta(9, "confirmada"), consulta(10, "cancelada"), consulta(11, "realizada"), consulta(9, "agendada", 4)];
  it("só hoje, sem canceladas, em ordem de horário", () => {
    expect(consultasDeHoje(lista, AGORA).map((c) => c.id)).toEqual(["3-9-confirmada", "3-11-realizada", "3-15-agendada"]);
  });
  it("filtra pela situação", () => {
    const hoje = consultasDeHoje(lista, AGORA);
    expect(filtrarAgendaHoje(hoje, "todas")).toHaveLength(3);
    expect(filtrarAgendaHoje(hoje, "confirmada").map((c) => c.id)).toEqual(["3-9-confirmada"]);
  });
  it("conta por situação", () => {
    expect(contarPorSituacao(consultasDeHoje(lista, AGORA))).toEqual({ agendada: 1, confirmada: 1, realizada: 1, faltou: 0, cancelada: 0 });
  });
  it("próxima consulta é a primeira agendada/confirmada que ainda não terminou", () => {
    expect(proximaConsulta(lista, AGORA)?.id).toBe("3-15-agendada");
    expect(proximaConsulta([consulta(9, "confirmada")], AGORA)).toBeNull();
  });
});
