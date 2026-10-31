import { describe, expect, it } from "vitest";

import {
  assiduidade,
  camposLocais,
  chaveDia,
  filtrarPacientes,
  historicoPorAtendimento,
  iniciaisPaciente,
  inicioDaSemana,
  isoLocal,
  porDia,
  proximas,
  rotuloSemana,
} from "@/lib/voz-clinica-agenda";
import type { Avaliacao, Consulta, PacienteResumo } from "@/lib/voz-clinica-api";

function consulta(inicio: string, situacao: Consulta["situacao"] = "agendada", dur = 50): Consulta {
  const fim = new Date(new Date(inicio).getTime() + dur * 60_000).toISOString();
  return { id: inicio, paciente: "Ana", inicio, fim, duracao_min: dur, tipo: "terapia", modalidade: "presencial",
           situacao, observacoes: null, atualizado_em: inicio };
}
const aval = (criado_em: string, tipo: Avaliacao["tipo"] = "acustica") =>
  ({ id: criado_em, paciente: "Ana", tipo, motor: null, resultado: {} as never, criado_em }) as Avaliacao;

describe("agenda", () => {
  it("semana começa na segunda", () => {
    const qua = new Date(2026, 10, 5, 15, 30); // qua 05/11/2026
    expect(chaveDia(inicioDaSemana(qua))).toBe("2026-11-02");
    const dom = new Date(2026, 10, 8, 9);
    expect(chaveDia(inicioDaSemana(dom))).toBe("2026-11-02");
    expect(rotuloSemana(new Date(2026, 10, 2))).toBe("2 a 8 de nov de 2026");
    expect(rotuloSemana(new Date(2026, 9, 26))).toBe("26 out a 1 nov de 2026");
  });

  it("data e hora locais viram ISO com fuso e voltam iguais", () => {
    const iso = isoLocal("2026-11-03", "14:05");
    expect(iso).toMatch(/^2026-11-03T14:05:00[+-]\d{2}:\d{2}$/);
    expect(camposLocais(new Date(iso!).toISOString())).toEqual({ data: "2026-11-03", hora: "14:05" });
    expect(isoLocal("2026-02-30", "10:00")).toBeNull();
    expect(isoLocal("03/11/2026", "10:00")).toBeNull();
    expect(isoLocal("2026-11-03", "9:00")).toBeNull();
  });

  it("agrupa por dia em ordem de horário", () => {
    const a = consulta(new Date(2026, 10, 3, 16).toISOString());
    const b = consulta(new Date(2026, 10, 3, 9).toISOString());
    const c = consulta(new Date(2026, 10, 4, 9).toISOString());
    const m = porDia([a, c, b]);
    expect([...m.keys()]).toEqual(["2026-11-03", "2026-11-04"]);
    expect(m.get("2026-11-03")!.map((x) => x.id)).toEqual([b.id, a.id]);
  });

  it("histórico junta consultas e registros do mesmo dia, sem as futuras", () => {
    const agora = new Date(2026, 10, 10, 12);
    const passada = consulta(new Date(2026, 10, 3, 9).toISOString(), "realizada");
    const futura = consulta(new Date(2026, 10, 17, 9).toISOString());
    const h = historicoPorAtendimento(
      [aval(new Date(2026, 10, 3, 9, 20).toISOString()), aval(new Date(2026, 10, 3, 9, 40).toISOString(), "idv10"),
       aval(new Date(2026, 9, 20, 10).toISOString(), "documento")],
      [passada, futura], agora,
    );
    expect(h.map((x) => x.dia)).toEqual(["2026-11-03", "2026-10-20"]);
    expect(h[0]!.consultas).toHaveLength(1);
    expect(h[0]!.avaliacoes.map((a) => a.tipo)).toEqual(["acustica", "idv10"]);
    expect(proximas([passada, futura, consulta(new Date(2026, 10, 18).toISOString(), "cancelada")], agora)
      .map((c) => c.id)).toEqual([futura.id]);
  });

  it("assiduidade conta realizadas sobre realizadas + faltas", () => {
    expect(assiduidade([])).toBeNull();
    expect(assiduidade([consulta("2026-01-01T10:00:00Z", "realizada"), consulta("2026-01-08T10:00:00Z", "realizada"),
                        consulta("2026-01-15T10:00:00Z", "faltou"), consulta("2026-01-22T10:00:00Z", "cancelada")])).toBe(67);
  });

  it("busca sem acento, filtros e ordem", () => {
    const agora = new Date("2026-11-10T12:00:00Z");
    const lista: PacienteResumo[] = [
      { paciente: "Ana Lúcia", avaliacoes: 3, ultima: "2026-11-09T10:00:00Z", proxima_consulta: "2026-11-20T13:00:00Z" },
      { paciente: "bruno", avaliacoes: 1, ultima: "2026-08-01T10:00:00Z" },
      { paciente: "Carla", avaliacoes: 0, ultima: "2026-11-01T10:00:00Z", proxima_consulta: "2026-11-12T13:00:00Z" },
    ];
    expect(filtrarPacientes(lista, "lucia").map((p) => p.paciente)).toEqual(["Ana Lúcia"]);
    expect(filtrarPacientes(lista, "", "sem_retorno", "recentes", agora).map((p) => p.paciente)).toEqual(["bruno"]);
    expect(filtrarPacientes(lista, "", "com_consulta", "proxima").map((p) => p.paciente)).toEqual(["Carla", "Ana Lúcia"]);
    expect(filtrarPacientes(lista, "", "todos", "nome").map((p) => p.paciente)).toEqual(["Ana Lúcia", "bruno", "Carla"]);
    expect(filtrarPacientes(lista, "").map((p) => p.paciente)).toEqual(["Ana Lúcia", "Carla", "bruno"]);
  });

  it("iniciais", () => {
    expect(iniciaisPaciente("ana lúcia souza")).toBe("AS");
    expect(iniciaisPaciente("P01")).toBe("P");
    expect(iniciaisPaciente("  ")).toBe("?");
  });
});
