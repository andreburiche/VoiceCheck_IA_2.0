"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { ciclosDoExemplo, envoltoria, medidasExemplo, obterExemplo, type MedidasExemplo } from "@/lib/landing-voz";
import { svgCampos, type PontoDb } from "@/lib/voz-clinica-comparacao-campo";
import { quadrante, svgDdf, type PontoDdf } from "@/lib/voz-clinica-ddf";

/**
 * Campo vocal de exemplo antes e depois da terapia (dBFS), desenhado pela mesma função do relatório.
 * Formato típico: a voz mais fraca sobe nos agudos; a mais forte cresce com a altura e cai no extremo.
 */
function campoExemplo(depois: boolean): PontoDb[] {
  const [de, ate] = depois ? [43, 72] : [46, 66];
  const r = (v: number) => Math.round(v * 10) / 10;
  return Array.from({ length: ate - de + 1 }, (_, i) => {
    const midi = de + i;
    const u = i / (ate - de); // 0 no grave, 1 no agudo
    const ondula = 0.9 * Math.sin(midi * 1.7) + 0.5 * Math.sin(midi * 0.63); // variação de nota para nota
    return depois
      ? { midi, min_db: r(-47 + 4 * u + 13 * u * u + ondula * 0.6), max_db: r(-27 + 22 * u - 9 * u * u + ondula) }
      : { midi, min_db: r(-41 + 3 * u + 12 * u * u + ondula * 0.6), max_db: r(-30 + 16 * u - 8 * u * u + ondula) };
  });
}

/** Quatro sessões de exemplo saindo da área de irregularidade e ruído (diagrama do relatório). */
function sessoesExemplo(): PontoDdf[] {
  const s = [
    { jitter: 1.45, shimmer: 9.8, gne: 0.31 },
    { jitter: 1.02, shimmer: 8.1, gne: 0.39 },
    { jitter: 0.74, shimmer: 6.9, gne: 0.47 },
    { jitter: 0.36, shimmer: 4.1, gne: 0.67 },
  ];
  return s.map((v, i) => {
    const x = Math.max(v.jitter / 0.6, v.shimmer / 6.5);
    const y = (1 - v.gne) / 0.5;
    return { x, y, quadrante: quadrante(x, y), jitter: v.jitter, shimmer: v.shimmer, gne: v.gne, criado_em: `2026-0${6 + i}-10T10:00:00Z` };
  });
}

function VisualGravar({ ativo }: { ativo: boolean }) {
  const { voz, leituras } = obterExemplo();
  const env = useMemo(() => envoltoria(voz, 160), [voz]);
  const c = useMemo(() => ciclosDoExemplo(voz, leituras), [voz, leituras]);
  const jitter = useMemo(() => {
    const p = c.periodos_ms;
    const media = p.reduce((s, x) => s + x, 0) / p.length;
    let dif = 0;
    for (let i = 1; i < p.length; i++) dif += Math.abs(p[i]! - p[i - 1]!);
    return (100 * dif) / (p.length - 1) / media;
  }, [c]);
  const w = 540;
  // faixa de cima: a frase inteira, com o trecho ampliado marcado
  const hE = 44, mE = hE / 2;
  const contorno = env.map((v, i) => `${(i / (env.length - 1)) * w},${mE - v * (mE - 3)}`).join(" ") + " " +
    [...env].reverse().map((v, i) => `${((env.length - 1 - i) / (env.length - 1)) * w},${mE + v * (mE - 3)}`).join(" ");
  const xZoom = (c.inicio_s / voz.duracao) * w;
  // ampliação: ~24 ms da nota sustentada, amostra por amostra, com o pico de cada ciclo
  const hZ = 170, mZ = hZ / 2;
  const pico = Math.max(...c.amostras.map(Math.abs), 1e-9);
  const xs = (i: number) => (i / (c.amostras.length - 1)) * w;
  const onda = c.amostras.map((v, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${(mZ - (v / pico) * (mZ - 14)).toFixed(1)}`).join("");
  const fmt = (v: number, casas: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${w} ${hE}`} className="w-full" role="img" aria-label="Forma de onda da frase de exemplo, com o trecho ampliado marcado">
        <polygon points={contorno} fill="#94A3B8" fillOpacity={0.35} />
        <rect x={xZoom} y={0} width={Math.max(3, (0.024 / voz.duracao) * w)} height={hE} fill="#20D9D2" />
      </svg>
      <svg viewBox={`0 0 ${w} ${hZ + 22}`} className="mt-3 w-full" role="img"
        aria-label={`24 milissegundos ampliados da nota sustentada: ${c.picos.length} ciclos da voz, cada um com cerca de ${fmt(c.periodos_ms[0] ?? 0, 2)} milissegundos`}>
        {c.picos.map((p, i) => (
          <line key={i} x1={xs(p)} x2={xs(p)} y1={4} y2={hZ - 4} stroke="rgba(148,163,184,0.28)" strokeDasharray="3 4" />
        ))}
        <path d={onda} fill="none" stroke="#20D9D2" strokeWidth={2} strokeLinejoin="round" pathLength={1}
          strokeDasharray={1} strokeDashoffset={ativo ? 0 : 1} className="transition-[stroke-dashoffset] duration-[1600ms] ease-out motion-reduce:transition-none" />
        {c.periodos_ms.map((ms, i) => (
          <text key={i} x={(xs(c.picos[i]!) + xs(c.picos[i + 1]!)) / 2} y={hZ + 16} textAnchor="middle" fontSize={12} fill="#94A3B8"
            fontFamily="ui-monospace, Consolas, monospace">{fmt(ms, 2)}</text>
        ))}
      </svg>
      <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-sm text-ink-muted">
        <span>24 ms ampliados: cada linha marca um ciclo das pregas vocais (duração em ms).</span>
        <span>
          jitter do trecho <span className="text-data text-base font-semibold text-accent">{fmt(jitter, 2)}</span>
          <span className="text-data ml-0.5 text-xs">%</span>
        </span>
      </figcaption>
    </figure>
  );
}

function VisualMedir({ ativo, m }: { ativo: boolean; m: MedidasExemplo }) {
  const linhas: [string, string, string][] = [
    ["F0 média", Math.round(m.f0_media_hz).toString(), "Hz"],
    ["Extensão da frase", m.extensao_st.toFixed(1).replace(".", ","), "st"],
    ["Vibrato", m.vibrato_hz ? m.vibrato_hz.toFixed(1).replace(".", ",") : "—", "Hz"],
    ["Amplitude do vibrato", m.vibrato_cents ? `±${Math.round(m.vibrato_cents)}` : "—", "cents"],
    ["Tempo com voz", m.voz_s.toFixed(1).replace(".", ","), "s"],
  ];
  return (
    <div className="w-full">
      <table className="w-full text-left">
        <caption className="sr-only">Medidas calculadas da frase de exemplo</caption>
        <tbody>
          {linhas.map(([rot, v, u], i) => (
            <tr key={rot} className="border-b border-line/70">
              <th scope="row" className="py-3 text-base font-normal text-ink-muted">{rot}</th>
              <td className="py-3 text-right">
                <span
                  className={cn("text-data text-2xl font-semibold text-accent transition-opacity duration-500", ativo ? "opacity-100" : "opacity-0")}
                  style={{ transitionDelay: ativo ? `${150 + i * 120}ms` : "0ms" }}
                >
                  {v}
                </span>
                <span className="text-data ml-1.5 text-sm text-ink-muted">{u}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-sm text-ink-muted">Calculadas agora, da voz de exemplo do topo da página.</p>
    </div>
  );
}

function Papel({ children, legenda }: { children: React.ReactNode; legenda: string }) {
  return (
    <figure className="w-full">
      <div className="rounded-xl bg-white p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]">{children}</div>
      <figcaption className="mt-3 text-sm text-ink-muted">{legenda}</figcaption>
    </figure>
  );
}

function VisualCampo({ ativo }: { ativo: boolean }) {
  const svg = useMemo(() => svgCampos(campoExemplo(true), campoExemplo(false), "dBFS", 520), []);
  return (
    <Papel legenda="Exemplo: o campo vocal de depois (preenchido) sobre o de antes (tracejado), como sai no relatório.">
      <div className={cn("transition-[clip-path] duration-[1600ms] ease-out [&_svg]:h-auto [&_svg]:w-full", ativo ? "[clip-path:inset(0_0_0_0)]" : "[clip-path:inset(0_100%_0_0)]")}
        role="img" aria-label="Fonetograma de exemplo: o campo de depois é mais largo no grave e no agudo e mais forte" dangerouslySetInnerHTML={{ __html: svg }} />
    </Papel>
  );
}

function VisualComparar({ ativo }: { ativo: boolean }) {
  const svg = useMemo(() => svgDdf(sessoesExemplo(), "escuro", 340), []);
  return (
    <figure className="mx-auto w-full max-w-sm">
      <div className={cn("transition-opacity duration-700 [&_svg]:h-auto [&_svg]:w-full", ativo ? "opacity-100" : "opacity-0")}
        role="img" aria-label="Diagrama de irregularidade por ruído com quatro sessões de exemplo, a última dentro da área normal" dangerouslySetInnerHTML={{ __html: svg }} />
      <figcaption className="mt-3 text-sm text-ink-muted">Exemplo: quatro sessões, da área alterada até a normal.</figcaption>
    </figure>
  );
}

function VisualRelatorio({ ativo, m }: { ativo: boolean; m: MedidasExemplo | null }) {
  const campo = useMemo(() => svgCampos(campoExemplo(true), campoExemplo(false), "dBFS", 420), []);
  const fmt = (v: number | null | undefined, casas: number) =>
    v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const secoes = ["Análise acústica", "Protocolos (IDV-10, QVV, GRBASI)", "Campo vocal", "Evolução e sessões"];
  return (
    <Papel legenda="Exemplo de relatório: PDF para imprimir ou Word (.docx) para editar.">
      <div className="text-[#0E1A24]">
        <div className="flex items-baseline justify-between gap-3 border-b-2 border-[#0E8F8A] pb-2">
          <p className="font-display text-base font-bold">Relatório de avaliação vocal</p>
          <p className="text-xs text-[#4E6170]">Paciente de exemplo · 4 sessões</p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[["F0 média", fmt(m?.f0_media_hz, 0), "Hz"], ["Vibrato", fmt(m?.vibrato_hz, 1), "Hz"], ["Extensão", fmt(m?.extensao_st, 1), "st"]].map(([r, v, u], i) => (
            <div key={r} className={cn("rounded-md bg-[#EEF4F6] px-2 py-1.5 transition-opacity duration-500", ativo ? "opacity-100" : "opacity-0")} style={{ transitionDelay: `${i * 100}ms` }}>
              <p className="text-[0.75rem] text-[#4E6170]">{r}</p>
              <p className="font-mono text-sm font-semibold">{v} <span className="text-[0.75rem] font-normal text-[#4E6170]">{u}</span></p>
            </div>
          ))}
        </div>
        <div className={cn("mt-3 transition-opacity duration-700 [&_svg]:h-auto [&_svg]:w-full", ativo ? "opacity-100" : "opacity-0")} style={{ transitionDelay: "300ms" }}
          aria-hidden dangerouslySetInnerHTML={{ __html: campo }} />
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          {secoes.map((l, i) => (
            <li key={l} className={cn("flex items-center gap-2 text-[0.75rem] font-medium transition-opacity duration-500", ativo ? "opacity-100" : "opacity-0")}
              style={{ transitionDelay: `${450 + i * 90}ms` }}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0E8F8A]" aria-hidden />{l}
            </li>
          ))}
        </ul>
      </div>
    </Papel>
  );
}

const PASSOS = [
  { id: "gravar", titulo: "Grave ou importe", texto: "Pelo microfone do computador, do celular ou de uma interface; ou importe o WAV. Dá para recortar, marcar trechos e exportar para o Praat (TextGrid)." },
  { id: "medir", titulo: "Medidas em segundos", texto: "F0, jitter, shimmer, HNR, CPPS, GNE, formantes, tempo de fonação, AVQI e DSI — com o Praat no servidor e um motor próprio calibrado contra ele." },
  { id: "campo", titulo: "O campo vocal inteiro", texto: "Fonetograma nota a nota, em dBFS ou em dB SPL com o microfone calibrado por decibelímetro. Antes e depois sobrepostos, com as notas ganhas." },
  { id: "comparar", titulo: "Compare e acompanhe", texto: "Antes e depois com as gravações e os espectrogramas lado a lado, diagrama de irregularidade × ruído e gráficos de evolução sessão a sessão." },
  { id: "relatorio", titulo: "Relatório pronto para o prontuário", texto: "PDF para imprimir ou Word para editar, com protocolos validados no Brasil, campo vocal, evolução e sessões. Exportação e exclusão conforme a LGPD." },
] as const;

/**
 * A avaliação clínica contada em cinco passos: o texto rola e a imagem do passo fica presa ao
 * lado (como numa apresentação de produto). No celular, cada passo traz a sua imagem.
 */
export function JornadaClinica() {
  const [ativo, setAtivo] = useState(0);
  const [visto, setVisto] = useState<Set<number>>(new Set([0]));
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  // medidas da voz de exemplo: calculadas no navegador, depois de montar
  const [m, setM] = useState<MedidasExemplo | null>(null);

  useEffect(() => {
    const { voz, leituras } = obterExemplo();
    setM(medidasExemplo(voz, leituras));
    const io = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        const i = refs.current.indexOf(e.target as HTMLLIElement);
        if (i >= 0) { setAtivo(i); setVisto((v) => (v.has(i) ? v : new Set(v).add(i))); }
      }
    }, { rootMargin: "-45% 0px -45% 0px" });
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const visual = (i: number, on: boolean) => {
    switch (PASSOS[i]!.id) {
      case "gravar": return <VisualGravar ativo={on} />;
      case "medir": return m ? <VisualMedir ativo={on} m={m} /> : null;
      case "campo": return <VisualCampo ativo={on} />;
      case "comparar": return <VisualComparar ativo={on} />;
      default: return <VisualRelatorio ativo={on} m={m} />;
    }
  };

  return (
    <section id="avaliacao-clinica" aria-labelledby="jornada-title" className="scroll-mt-20 px-5 py-24 sm:px-8 lg:py-32">
      <div className="mx-auto max-w-content">
        <div className="max-w-3xl">
          <h2 id="jornada-title" className="text-balance font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl lg:text-6xl">
            Do microfone ao prontuário
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-ink/90">
            A avaliação clínica da voz junta o que antes pedia vários programas: gravar, medir, desenhar
            o campo vocal, comparar sessões e entregar o relatório — sem trocar de tela.
          </p>
        </div>

        <div className="mt-16 lg:grid lg:grid-cols-12 lg:gap-16">
          {/* imagem presa ao lado (desktop) */}
          <div className="hidden lg:col-span-7 lg:block">
            <div className="sticky top-28 flex h-[min(34rem,calc(100vh-9rem))] items-center">
              <div className="panel-glass relative h-full w-full overflow-hidden rounded-2xl p-8">
                {PASSOS.map((p, i) => (
                  <div key={p.id} aria-hidden={i !== ativo}
                    className={cn("absolute inset-0 flex items-center p-8 transition-[opacity,transform] duration-700 ease-out",
                      i === ativo ? "translate-y-0 opacity-100" : i < ativo ? "-translate-y-4 opacity-0" : "translate-y-4 opacity-0")}>
                    {visto.has(i) ? visual(i, true) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <ol className="lg:col-span-5">
            {PASSOS.map((p, i) => (
              <li key={p.id} ref={(el) => { refs.current[i] = el; }} className="flex min-h-0 flex-col justify-center py-10 lg:min-h-[70vh] lg:py-0">
                <div className="mb-6 lg:hidden">
                  <div className="panel-glass rounded-2xl p-5">{visual(i, visto.has(i))}</div>
                </div>
                <p className={cn("text-data text-sm transition-colors duration-500", i === ativo ? "text-accent" : "text-ink-faint")}>
                  {String(i + 1).padStart(2, "0")} / {String(PASSOS.length).padStart(2, "0")}
                </p>
                <h3 className={cn("mt-2 font-display text-3xl font-semibold tracking-[-0.02em] transition-colors duration-500 sm:text-4xl", i === ativo ? "text-ink" : "text-ink-muted")}>
                  {p.titulo}
                </h3>
                <p className="mt-4 max-w-md text-lg leading-relaxed text-ink-muted">{p.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
