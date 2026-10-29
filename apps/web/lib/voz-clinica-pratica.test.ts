import { describe, expect, it } from "vitest";

import {
  aplicarEnvio,
  aplicarEnvioAnterior,
  descartarAnterior,
  tokenDoTexto,
  totalPendente,
  diasSeguidos,
  exercicioDoRascunho,
  rascunhoDe,
  estadoParaToken,
  estadoRepeticaoInicial,
  exercicioPadrao,
  feitasHoje,
  lerEstado,
  linkPratica,
  mensagemWhatsApp,
  passoRepeticao,
  registrarSessao,
  resultadoRepeticao,
  resumoPratica,
  salvarEstado,
  tokenDoEndereco,
  type EstadoCelular,
  type ExercicioPratica,
} from "@/lib/voz-clinica-pratica";

/** Roda leituras a 60/s: [segundos, hz|null, dB] por trecho. */
function rodar(ex: ExercicioPratica, trechos: [number, number | null, number][]) {
  let e = estadoRepeticaoInicial();
  let t = 0;
  for (const [dur, hz, db] of trechos) {
    for (let i = 0; i < Math.round(dur * 60); i++) {
      t += 1 / 60;
      e = passoRepeticao(e, ex, t, hz, db);
      if (e.fim) return e;
    }
  }
  return e;
}

const SUST = exercicioPadrao("sustentar");
const PITCH: ExercicioPratica = { tipo: "pitch", titulo: "Faixa", repeticoes: 2, duracao_s: 10, faixa_hz: { min: 180, max: 260 } };
const VOL: ExercicioPratica = { tipo: "volume", titulo: "Volume", repeticoes: 2, duracao_s: 5, faixa_db: { min: -35, max: -18 } };

describe("vogal sustentada", () => {
  it("mede o trecho com voz e termina no silêncio", () => {
    const e = rodar(SUST, [[2, null, -70], [8, 200, -20], [2, null, -70]]);
    expect(e.fim).toBe(true);
    const r = resultadoRepeticao(e, SUST);
    expect(Math.abs(r.fonacao_s - 8) <= 0.1).toBe(true);
    expect(r.duracao_s < 9).toBe(true); // a espera antes da voz não conta
    expect(r.f0_mediana_hz).toBe(200);
  });
  it("uma falha curta não quebra a vogal; uma pausa longa sim", () => {
    const curta = resultadoRepeticao(rodar(SUST, [[4, 200, -20], [0.1, null, -70], [4, 200, -20], [1, null, -70]]), SUST);
    expect(curta.fonacao_s >= 8).toBe(true);
    const longa = resultadoRepeticao(rodar(SUST, [[4, 200, -20], [0.4, null, -70], [3, 200, -20], [1, null, -70]]), SUST);
    expect(Math.abs(longa.fonacao_s - 4) <= 0.1).toBe(true); // melhor trecho contínuo
  });
  it("desiste se a voz não começar em 10 s", () => {
    const e = rodar(SUST, [[12, null, -70]]);
    expect(e.fim).toBe(true);
    expect(resultadoRepeticao(e, SUST).fonacao_s).toBe(0);
  });
  it("respeita o limite de 60 s", () => {
    const r = resultadoRepeticao(rodar(SUST, [[70, 200, -20]]), SUST);
    expect(r.duracao_s <= 60.1).toBe(true);
  });
});

describe("faixa de pitch e de volume", () => {
  it("% do tempo com voz dentro da faixa", () => {
    const e = rodar(PITCH, [[3, 200, -20], [1, 150, -20], [2, null, -70], [6, 220, -20]]);
    expect(e.fim).toBe(true);
    const r = resultadoRepeticao(e, PITCH);
    expect(Math.abs(r.duracao_s - 10) <= 0.1).toBe(true);
    expect(Math.abs(r.fonacao_s - 8) <= 0.1).toBe(true); // parou aos 10 s
    expect(Math.abs((r.dentro_pct ?? 0) - 87.5) <= 1).toBe(true); // 7 de 8 s
  });
  it("sem voz nenhuma: sem % (não é 0 % de acerto)", () => {
    expect(resultadoRepeticao(rodar(PITCH, [[11, null, -70]]), PITCH).dentro_pct).toBe(null);
  });
  it("volume conta som mesmo sem pitch", () => {
    const r = resultadoRepeticao(rodar(VOL, [[2, null, -25], [3, 200, -10]]), VOL);
    expect(Math.abs((r.dentro_pct ?? 0) - 40) <= 1.5).toBe(true);
  });
  it("uma aba travada não vira tempo com voz", () => {
    let e = passoRepeticao(estadoRepeticaoInicial(), PITCH, 0, 200, -20);
    e = passoRepeticao(e, PITCH, 30, 200, -20); // 30 s sem leituras
    expect(e.fonacao_s <= 0.25).toBe(true);
  });
});

describe("link", () => {
  it("o segredo vai depois do #, e volta", () => {
    const token = "Ab_-".repeat(11);
    const link = linkPratica("https://app.exemplo.com/", token);
    expect(link).toBe(`https://app.exemplo.com/pratica#t=${token}`);
    expect(tokenDoEndereco(new URL(link).hash)).toBe(token);
    expect(tokenDoEndereco("#t=curto")).toBe(null);
    expect(tokenDoEndereco("")).toBe(null);
  });
  it("acha o link colado no meio da mensagem do WhatsApp", () => {
    const token = "Zx9_".repeat(11);
    expect(tokenDoTexto(`Olá! Seus exercícios: https://app.ex.com/pratica#t=${token}\nNão compartilhe.`)).toBe(token);
    expect(tokenDoTexto("https://app.ex.com/pratica")).toBe(null);
  });
  it("mensagem pede para não compartilhar", () => {
    expect(mensagemWhatsApp("L", "Ana")).toContain("Olá, Ana!");
    expect(mensagemWhatsApp("L", " ")).toContain("Não compartilhe");
  });
});

describe("estado no celular", () => {
  const memoria = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  const s = (id: string, dia = "2026-10-29T12:00:00Z") => ({ id, exercicio: 0, feito_em: dia, repeticoes: [{ duracao_s: 5, fonacao_s: 4, dentro_pct: null, f0_mediana_hz: 200 }] });

  it("guarda e lê; lixo vira null", () => {
    const a = memoria();
    const e: EstadoCelular = registrarSessao(estadoParaToken(null, "tok"), s("1"));
    expect(salvarEstado(a, e)).toBe(true);
    expect(lerEstado(a)).toEqual(e);
    a.setItem("vc-pratica-v1", "{quebrado");
    expect(lerEstado(a)).toBe(null);
  });
  it("armazenamento cheio não derruba a tela", () => {
    expect(salvarEstado({ getItem: () => null, setItem: () => { throw new Error("cheio"); }, removeItem: () => undefined }, estadoParaToken(null, "t"))).toBe(false);
  });
  it("envio tira da fila o recebido e o recusado; o resto espera", () => {
    let e = estadoParaToken(null, "tok");
    for (const id of ["a", "b", "c"]) e = registrarSessao(e, s(id));
    e = aplicarEnvio(e, ["a"], ["b"]);
    expect(e.fila.map((x) => x.id)).toEqual(["c"]);
    expect(e.feitas.map((f) => [f.id, f.enviada])).toEqual([["a", true], ["c", false]]);
  });
  it("outro link no mesmo celular: fila nova, e a antiga guardada com o token antigo", () => {
    const e = registrarSessao(estadoParaToken(null, "tok"), s("1"));
    expect(estadoParaToken(e, "tok").fila.length).toBe(1);
    const novo = registrarSessao(estadoParaToken(e, "outro"), s("2"));
    expect(novo.fila.map((x) => x.id)).toEqual(["2"]);
    expect(novo.anteriores).toEqual([{ token: "tok", fila: e.fila }]);
    expect(totalPendente(novo)).toBe(2);
    // voltar ao link antigo recupera a fila dele
    const volta = estadoParaToken(novo, "tok");
    expect(volta.fila.map((x) => x.id)).toEqual(["1"]);
    expect(volta.anteriores.map((g) => g.token)).toEqual(["outro"]);
  });
  it("fila antiga enviada ou descartada sai da lista", () => {
    let e = estadoParaToken(registrarSessao(registrarSessao(estadoParaToken(null, "tok"), s("1")), s("2")), "outro");
    e = aplicarEnvioAnterior(e, "tok", ["1"], []);
    expect(e.anteriores[0]!.fila.map((x) => x.id)).toEqual(["2"]);
    expect(aplicarEnvioAnterior(e, "tok", [], ["2"]).anteriores).toEqual([]);
    expect(descartarAnterior(e, "tok").anteriores).toEqual([]);
  });
  it("estado antigo guardado sem 'anteriores' ainda abre", () => {
    const a = memoria();
    a.setItem("vc-pratica-v1", JSON.stringify({ token: "tok", plano: null, fila: [], feitas: [] }));
    expect(lerEstado(a)?.anteriores).toEqual([]);
  });
  it("progresso de hoje e dias seguidos", () => {
    const agora = new Date(2026, 9, 29, 20);
    const dia = (d: number) => new Date(2026, 9, d, 10).toISOString();
    const feitas = [27, 28, 29, 29].map((d, i) => ({ id: String(i), exercicio: i % 2, feito_em: dia(d), enviada: true }));
    expect(feitasHoje(feitas, agora).get(0)).toBe(1);
    expect(feitasHoje(feitas, agora).get(1)).toBe(1);
    expect(diasSeguidos(feitas, agora)).toBe(3);
    expect(diasSeguidos(feitas.slice(0, 2), agora)).toBe(2); // até ontem ainda vale
    expect(diasSeguidos([], agora)).toBe(0);
  });
});

describe("resumoPratica", () => {
  const base = { plano_id: "p", exercicio: 0, repeticoes: [], feito_em: "", fonte: "celular" as const };
  it("vogal sustentada", () => {
    expect(resumoPratica({ ...base, tipo: "sustentar", titulo: "Vogal /a/", resumo: { repeticoes_feitas: 2, repeticoes_pedidas: 3, melhor_s: 13.2, media_s: 12, meta_s: 15, atingiu_meta: false } }))
      .toBe("Vogal /a/: melhor 13,2 s · média 12,0 s · 2 de 3 repetições · meta 15 s não atingida");
  });
  it("faixa de pitch", () => {
    expect(resumoPratica({ ...base, tipo: "pitch", titulo: "Grave", faixa_hz: { min: 100, max: 150 }, resumo: { repeticoes_feitas: 1, repeticoes_pedidas: 1, dentro_pct: 70 } }))
      .toBe("Grave: 70,0% na faixa 100–150 Hz · 1 de 1 repetição");
  });
});

describe("editor do profissional", () => {
  it("o padrão de cada tipo passa na validação", () => {
    for (const t of ["sustentar", "pitch", "volume"] as const) {
      const ex = exercicioDoRascunho(rascunhoDe(exercicioPadrao(t)), 1);
      expect(typeof ex).toBe("object");
      expect(ex).toEqual(exercicioPadrao(t));
    }
  });
  it("aceita vírgula e aponta o problema com o número do exercício", () => {
    const r = { ...rascunhoDe(exercicioPadrao("pitch")), duracao_s: "7,5" };
    expect((exercicioDoRascunho(r, 2) as { duracao_s: number }).duracao_s).toBe(7.5);
    expect(exercicioDoRascunho({ ...r, min: "300", max: "200" }, 2)).toBe("Exercício 2: faixa em Hz entre 30 e 2000, com o mínimo menor que o máximo.");
    expect(exercicioDoRascunho({ ...r, repeticoes: "11" }, 3)).toBe("Exercício 3: repetições de 1 a 10.");
    expect(exercicioDoRascunho({ ...r, titulo: "  " }, 1)).toBe("Exercício 1: dê um título.");
    const s = { ...rascunhoDe(exercicioPadrao("sustentar")), meta_s: "" };
    expect("meta_s" in (exercicioDoRascunho(s, 1) as object)).toBe(false); // meta vazia = sem meta
  });
});

describe("meta com decimal", () => {
  it("4,5 s não vira 5 s", () => {
    const base = { plano_id: "p", exercicio: 0, repeticoes: [], feito_em: "", fonte: "celular" as const };
    expect(resumoPratica({ ...base, tipo: "sustentar", titulo: "V", resumo: { repeticoes_feitas: 1, repeticoes_pedidas: 1, melhor_s: 5, media_s: 5, meta_s: 4.5, atingiu_meta: true } }))
      .toContain("meta 4,5 s atingida");
  });
});
