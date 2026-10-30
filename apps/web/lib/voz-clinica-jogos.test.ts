import { describe, expect, it } from "vitest";

import {
  alvoEm,
  classificarSom,
  energiaGrave,
  estadoDesafiosInicial,
  estadoPercursoInicial,
  estadoSoproInicial,
  gerarDesafios,
  gerarPercurso,
  normalizar,
  passoDesafios,
  passoPercurso,
  passoSopro,
  pontuacaoDesafios,
  pontuacaoPercurso,
  taxaCruzamentosZero,
  type ClasseSom,
  estadoAtaqueInicial,
  gerarSinais,
  VARIACOES,
  opcoesDesafios,
  toleranciaSopro,
  limiarDeRuido,
  passoAtaque,
  pontuacaoAtaque,
} from "@/lib/voz-clinica-jogos";

const TAXA = 48000;
const N = 2048;

function ruido(amp: number, semente = 3): Float32Array {
  let s = semente;
  return Float32Array.from({ length: N }, () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return amp * ((s / 2147483648) * 2 - 1);
  });
}
/** Ruído agudo (fricativa surda tipo /s/): primeira diferença do ruído branco. */
function ruidoAgudo(amp: number, semente = 3): Float32Array {
  const r = ruido(1, semente);
  return Float32Array.from(r, (v, i) => amp * (v - (r[i - 1] ?? 0)) / 2);
}
/** Ruído médio (tipo /ʃ/ ou /f/): ruído branco levemente suavizado. */
function ruidoMedio(amp: number, semente = 5): Float32Array {
  const r = ruido(1, semente);
  return Float32Array.from(r, (v, i) => amp * (v + (r[i - 1] ?? 0)) / 2);
}
function voz(hz: number, amp: number): Float32Array {
  return Float32Array.from({ length: N }, (_, i) => {
    const t = i / TAXA;
    let s = 0;
    for (let h = 1; h <= 6; h++) s += Math.sin(2 * Math.PI * hz * h * t) / h;
    return (amp * s) / 1.5;
  });
}
const soma = (a: Float32Array, b: Float32Array) => Float32Array.from(a, (v, i) => v + (b[i] ?? 0));

describe("classificarSom", () => {
  const casos: [string, Float32Array, ClasseSom][] = [
    ["vogal", voz(180, 0.3), "sonoro"],
    ["/s/ (ruído agudo)", ruidoAgudo(0.08), "surdo"],
    ["/f/ ou /ʃ/ (ruído médio)", ruidoMedio(0.06), "surdo"],
    ["/z/ (vibração + ruído agudo forte)", soma(voz(120, 0.12), ruidoAgudo(0.12)), "sonoro"],
    ["/v/ fraco (vibração fraca + ruído)", soma(voz(110, 0.04), ruidoMedio(0.03)), "sonoro"],
    ["silêncio", new Float32Array(N), "silencio"],
    ["chiado muito baixo", ruidoAgudo(0.002), "silencio"],
  ];
  for (const [nome, sinal, esperado] of casos) {
    it(`${nome} → ${esperado}`, () => expect(classificarSom(sinal, TAXA)).toBe(esperado));
  }

  it("medidas auxiliares separam os casos", () => {
    expect(taxaCruzamentosZero(ruidoAgudo(0.1)) > 0.4).toBe(true);
    expect(taxaCruzamentosZero(voz(150, 0.3)) < 0.05).toBe(true);
    expect(energiaGrave(voz(120, 0.2), TAXA) > 0.5).toBe(true);
    expect(energiaGrave(ruidoAgudo(0.1), TAXA) < 0.05).toBe(true);
  });
});

describe("normalizar", () => {
  it("linear e em semitons (log)", () => {
    expect(normalizar(-20, { min: -40, max: 0 })).toBe(0.5);
    expect(Math.abs(normalizar(200, { min: 100, max: 400 }, "log") - 0.5) < 1e-12).toBe(true); // 1 oitava de 2
    expect(normalizar(50, { min: 100, max: 400 }, "log")).toBe(0);
    expect(normalizar(900, { min: 100, max: 400 }, "log")).toBe(1);
  });
});

describe("percurso", () => {
  it("altitude: patamares com pausas; mesma semente, mesmo percurso", () => {
    const p = gerarPercurso("altitude", 30, 42);
    expect(p).toEqual(gerarPercurso("altitude", 30, 42));
    expect(p.every((s) => s.de === s.ate)).toBe(true);
    for (let i = 1; i < p.length; i++) expect(p[i]!.inicio >= p[i - 1]!.fim).toBe(true);
    expect(alvoEm(p, 0)).toBe(null); // preparação
    expect(alvoEm(p, p[0]!.inicio + 0.1)).toBe(p[0]!.de);
  });

  it("trilha: tem deslizes contínuos entre patamares", () => {
    const p = gerarPercurso("trilha", 30, 7);
    const deslize = p.find((s) => s.de !== s.ate)!;
    const meio = alvoEm(p, (deslize.inicio + deslize.fim) / 2)!;
    expect(Math.abs(meio - (deslize.de + deslize.ate) / 2) < 1e-9).toBe(true);
  });

  it("pontua só o tempo com alvo e dentro da tolerância", () => {
    const p = [{ inicio: 0, fim: 2, de: 0.5, ate: 0.5 }];
    let e = estadoPercursoInicial();
    for (let i = 0; i <= 40; i++) {
      const t = i * 0.05;
      // cada intervalo vale pela leitura no fim dele: de 0 a 1 s no alvo, de 1 a 2 s fora
      e = passoPercurso(e, t, t <= 1 + 1e-9 ? 0.55 : 0.9, p);
    }
    for (let i = 41; i <= 60; i++) e = passoPercurso(e, i * 0.05, 0.5, p); // depois do fim: não conta
    expect(pontuacaoPercurso(e)).toBe(50);
  });
});

describe("sopro longo", () => {
  const rodar = (trechos: [number, boolean][]) => {
    let e = estadoSoproInicial();
    let t = 0;
    for (const [dur, comVoz] of trechos) {
      for (let k = 0; k < Math.round(dur / 0.02); k++) { t += 0.02; e = passoSopro(e, t, comVoz); }
    }
    return e;
  };
  it("conta a emissão contínua e guarda o melhor tempo", () => {
    const e = rodar([[3, true], [1, false], [5, true]]);
    expect(Math.abs(e.melhor_s - 5) < 0.05).toBe(true);
  });
  it("uma falha curta da leitura (≤ 0,15 s) não zera", () => {
    const e = rodar([[2, true], [0.1, false], [2, true]]);
    expect(Math.abs(e.melhor_s - 4.1) < 0.05).toBe(true);
  });
});

describe("surdo ou sonoro", () => {
  it("desafios reproduzíveis e com os dois tipos", () => {
    const d = gerarDesafios(12, 9);
    expect(d).toEqual(gerarDesafios(12, 9));
    expect(new Set(d.map((x) => x.esperado))).toEqual(new Set(["surdo", "sonoro"]));
  });

  it("acerta ao segurar o som certo; erra por tempo esgotado", () => {
    const d = [
      { som: "s", exemplo: "", esperado: "surdo" as const },
      { som: "z", exemplo: "", esperado: "sonoro" as const },
    ];
    let e = estadoDesafiosInicial();
    let t = 0;
    const tocar = (dur: number, c: ClasseSom) => {
      for (let k = 0; k < Math.round(dur / 0.02); k++) { t += 0.02; e = passoDesafios(e, t, c, d); }
    };
    tocar(0.8, "surdo"); // 1º: acerto
    expect(e.acertos).toBe(1);
    tocar(1.0, "silencio"); // intervalo
    tocar(5.2, "surdo"); // 2º: pediu sonoro, produziu surdo até esgotar
    expect(e.erros).toBe(1);
    expect(e.historico).toEqual([true, false]);
    expect(pontuacaoDesafios(e)).toBe(50);
  });
});


describe("som e silêncio (ataque vocal)", () => {
  // janela de 1,2 s após cada sinal; amostras a cada 50 ms
  function jogar(sinais: number[], sons: [number, number][], fim: number) {
    let e = estadoAtaqueInicial();
    for (let t = 0; t <= fim + 1e-9; t = Math.round((t + 0.05) * 100) / 100) {
      const comSom = sons.some(([a, b]) => t >= a && t < b);
      e = passoAtaque(e, t, comSom ? -20 : -60, sinais, -40);
    }
    return e;
  }

  it("acerto com tempo de reação, antecipação e sinal perdido", () => {
    const e = jogar([3, 6, 9], [[3.3, 3.5], [5, 5.2], [6.5, 6.6]], 11);
    expect(e.acertos).toBe(2);
    expect(e.reacoes_ms).toEqual([300, 500]);
    expect(e.antecipados).toBe(1);
    expect(e.perdidos).toBe(1);
    expect(e.historico).toEqual([true, true, false]);
    expect(pontuacaoAtaque(e, 3)).toBe(50);
  });

  it("um som longo conta uma vez (histerese)", () => {
    let e = estadoAtaqueInicial();
    const dbs = [-60, -30, -44, -38, -45, -60];
    dbs.forEach((db, i) => { e = passoAtaque(e, 3 + i * 0.05, db, [3], -40); });
    expect(e.acertos).toBe(1);
    expect(e.antecipados).toBe(0);
  });

  it("sinais imprevisíveis e limiar pelo ruído", () => {
    const s = gerarSinais(5, 7);
    expect(s[0]).toBe(3);
    for (let i = 1; i < s.length; i++) expect(s[i]! - s[i - 1]! >= 1.8 && s[i]! - s[i - 1]! <= 3.5).toBe(true);
    expect(limiarDeRuido([-62, -60, -58])).toBe(-45);
    expect(limiarDeRuido([-90, -90])).toBe(-50);
    expect(limiarDeRuido([])).toBe(-40);
  });
});

describe("variações (vários jogos por módulo)", () => {
  it("cada jogo tem pelo menos 2 variações e a primeira é a padrão", () => {
    for (const lista of Object.values(VARIACOES)) expect(lista.length >= 2).toBe(true);
    expect(gerarPercurso("altitude", 30, 42, "patamares")).toEqual(gerarPercurso("altitude", 30, 42));
  });

  it("forte e fraco alterna os extremos; escada sobe de degrau em degrau", () => {
    const ff = gerarPercurso("altitude", 30, 3, "forte-fraco");
    for (let i = 1; i < ff.length; i++) expect(ff[i]!.de !== ff[i - 1]!.de).toBe(true);
    expect(ff.every((s) => s.de === 0.15 || s.de === 0.85)).toBe(true);
    const esc = gerarPercurso("trilha", 30, 1, "escada");
    expect(esc.slice(0, 5).map((s) => s.de)).toEqual([0.15, 0.32, 0.5, 0.68, 0.85]);
    expect(esc.every((s) => s.de === s.ate)).toBe(true);
  });

  it("sirene é contínua, sem pausas, indo e voltando", () => {
    const s = gerarPercurso("trilha", 20, 1, "sirene");
    for (let i = 1; i < s.length; i++) {
      expect(s[i]!.inicio).toBe(s[i - 1]!.fim);
      expect(s[i]!.de).toBe(s[i - 1]!.ate);
    }
  });

  it("surdo/sonoro com um par só; sinais ritmados a cada 2 s", () => {
    expect(gerarDesafios(12, 5, "f").every((d) => d.som === "f" || d.som === "v")).toBe(true);
    expect(gerarSinais(4, 1, 3, "ritmado")).toEqual([3, 5, 7, 9]);
  });
});

describe("cinco variações por módulo (como o VoxGames)", () => {
  it("todo módulo tem 5 variações, com ids únicos", () => {
    for (const lista of Object.values(VARIACOES)) {
      expect(lista.length).toBe(5);
      expect(new Set(lista.map((v) => v.id)).size).toBe(5);
    }
  });

  it("pulsos: emissões de 0,8 s, fortes, com pausa", () => {
    const p = gerarPercurso("altitude", 30, 3, "pulsos");
    expect(p.length >= 10).toBe(true);
    for (const s of p) {
      expect(s.fim - s.inicio <= 0.8 + 1e-9).toBe(true);
      expect(s.de >= 0.65 && s.de <= 0.85).toBe(true);
    }
    expect(p[1]!.inicio - p[0]!.fim).toBeCloseTo(1);
  });

  it("saltos: alterna grave e agudo sem deslize", () => {
    const p = gerarPercurso("trilha", 20, 1, "saltos");
    expect(p.slice(0, 4).map((s) => s.de)).toEqual([0.2, 0.8, 0.2, 0.8]);
    for (const s of p) expect(s.de).toBe(s.ate);
  });

  it("entonação: só curvas de pergunta (sobe) e afirmação (desce)", () => {
    const p = gerarPercurso("trilha", 40, 7, "entonacao");
    const sobe = p.filter((s) => s.ate > s.de).length;
    const desce = p.filter((s) => s.ate < s.de).length;
    expect(sobe > 0 && desce > 0 && sobe + desce === p.length).toBe(true);
  });

  it("som e silêncio lento (3 s) e acelerando (3 s até 1 s)", () => {
    const lento = gerarSinais(4, 1, 3, "lento");
    expect(lento).toEqual([3, 6, 9, 12]);
    const ac = gerarSinais(6, 1, 3, "acelerando");
    const passos = ac.slice(1).map((v, i) => Math.round((v - ac[i]!) * 100) / 100);
    expect(passos[0]).toBe(3);
    expect(passos[passos.length - 1]).toBe(1);
    for (let i = 1; i < passos.length; i++) expect(passos[i]! < passos[i - 1]!).toBe(true);
  });

  it("contagem tolera pausas entre números; rápido segura menos", () => {
    expect(toleranciaSopro("contagem")).toBe(0.5);
    expect(toleranciaSopro("livre")).toBe(0.15);
    expect(opcoesDesafios("rapido")).toEqual({ segurar_s: 0.4, limite_s: 3 });
    expect(opcoesDesafios("todos")).toEqual({ segurar_s: 0.6, limite_s: 5 });
  });
});
