"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { friendlyError } from "@/lib/errors";
import { midiToNoteName } from "@/lib/pitch-math";
import { cn } from "@/lib/utils";
import { listarAvaliacoes, type Avaliacao, type ResultadoFonetograma } from "@/lib/voz-clinica-api";
import {
  caminhoCampo,
  compararCampos,
  fonetogramasEmOrdem,
  pontosNaUnidade,
  unidadeDaComparacao,
  type PontoDb,
} from "@/lib/voz-clinica-comparacao-campo";

const PAINEL = "panel-glass rounded-2xl p-4 md:p-5";
const SELECT =
  "h-10 w-full rounded-lg border border-line bg-canvas-raised px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

function data(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function rotulo(a: Avaliacao, n: number): string {
  const r = (a.resultado as ResultadoFonetograma).resumo;
  const cal = (a.resultado as ResultadoFonetograma).calibracao ? " · dB SPL" : "";
  return `Fonetograma ${n} · ${data(a.criado_em)} · ${r?.nota_grave ?? "?"}–${r?.nota_aguda ?? "?"}${cal}`;
}

function Sobreposicao({ antes, depois, unidade }: { antes: PontoDb[]; depois: PontoDb[]; unidade: string }) {
  const todos = [...antes, ...depois];
  const w = 640;
  const h = 260;
  const pe = 44, pd = 10, pt = 10, pb = 26;
  const mMin = Math.min(...todos.map((p) => p.midi)) - 1;
  const mMax = Math.max(...todos.map((p) => p.midi)) + 1;
  const dMin = Math.floor((Math.min(...todos.map((p) => p.min_db)) - 3) / 10) * 10;
  const dMax = Math.ceil((Math.max(...todos.map((p) => p.max_db)) + 3) / 10) * 10;
  const x = (m: number) => pe + ((m - mMin) / (mMax - mMin)) * (w - pe - pd);
  const y = (db: number) => pt + ((dMax - db) / (dMax - dMin || 1)) * (h - pt - pb);
  const linhasDb = Array.from({ length: Math.round((dMax - dMin) / 10) + 1 }, (_, i) => dMin + i * 10);
  const oitavas = Array.from({ length: 12 }, (_, i) => Math.ceil(mMin / 12) * 12 + i * 12).filter((m) => m <= mMax);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full" role="img" data-testid="vc2-campo-sobreposicao"
      aria-label={`Campos vocais sobrepostos em ${unidade}: antes em linha tracejada, depois preenchido`}>
      {linhasDb.map((db) => (
        <g key={db}>
          <line x1={pe} x2={w - pd} y1={y(db)} y2={y(db)} stroke="currentColor" className="text-ink/10" />
          <text x={pe - 6} y={y(db) + 4} textAnchor="end" fontSize={11} fill="currentColor" className="text-ink-faint">{db}</text>
        </g>
      ))}
      {oitavas.map((m) => (
        <g key={m}>
          <line x1={x(m)} x2={x(m)} y1={pt} y2={h - pb} stroke="currentColor" className="text-ink/10" />
          <text x={x(m)} y={h - 8} textAnchor="middle" fontSize={11} fill="currentColor" className="text-ink-faint">{midiToNoteName(m)}</text>
        </g>
      ))}
      <path d={caminhoCampo(depois, x, y)} fill="var(--accent)" fillOpacity={0.25} stroke="var(--accent)" strokeWidth={2} data-testid="vc2-campo-depois" />
      <path d={caminhoCampo(antes, x, y)} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="6 4" className="text-ink-muted" data-testid="vc2-campo-antes" />
      <text x={pe + 4} y={pt + 12} fontSize={11} fill="currentColor" className="text-ink-faint">{unidade}</text>
    </svg>
  );
}

/** Dois fonetogramas do paciente sobrepostos (como no lingWAVES): o que o campo vocal ganhou ou perdeu. */
export function ComparacaoFonetogramas({ paciente, versao }: { paciente: string; versao: number }) {
  const [itens, setItens] = useState<Avaliacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [idAntes, setIdAntes] = useState<string | null>(null);
  const [idDepois, setIdDepois] = useState<string | null>(null);
  const idA = useId();
  const idD = useId();
  const pedido = useRef(0);

  useEffect(() => {
    setItens(null);
    setIdAntes(null);
    setIdDepois(null);
  }, [paciente]);
  useEffect(() => {
    if (!paciente) return;
    const meu = ++pedido.current;
    setErro(null);
    listarAvaliacoes(paciente)
      .then((r) => {
        if (meu !== pedido.current) return;
        const lista = fonetogramasEmOrdem(r.items);
        setItens(lista);
        setIdAntes((atual) => (atual && lista.some((a) => a.id === atual) ? atual : lista[0]?.id ?? null));
        setIdDepois((atual) => (atual && lista.some((a) => a.id === atual) ? atual : lista.at(-1)?.id ?? null));
      })
      .catch((e) => meu === pedido.current && setErro(friendlyError(e, "Não foi possível carregar os fonetogramas.")));
  }, [paciente, versao]);

  const antes = itens?.find((a) => a.id === idAntes) ?? null;
  const depois = itens?.find((a) => a.id === idDepois) ?? null;
  const dados = useMemo(() => {
    if (!antes || !depois || antes.id === depois.id) return null;
    const ra = antes.resultado as ResultadoFonetograma;
    const rd = depois.resultado as ResultadoFonetograma;
    const { unidade } = unidadeDaComparacao(ra, rd);
    return { comp: compararCampos(ra, rd), pa: pontosNaUnidade(ra, unidade), pd: pontosNaUnidade(rd, unidade) };
  }, [antes, depois]);

  if (!paciente || (itens !== null && itens.length < 2 && !erro)) {
    // sem dois fonetogramas não há o que mostrar; a aba já explica a comparação acústica acima
    return itens && itens.length === 1 ? (
      <p className="text-sm text-ink-muted" data-testid="vc2-comparar-campo-vazio">Só há um fonetograma salvo: a partir do segundo, os campos vocais podem ser sobrepostos aqui.</p>
    ) : null;
  }

  return (
    <section className={PAINEL} aria-labelledby="vc2-comparar-campo" data-testid="vc2-comparar-campo">
      <h2 id="vc2-comparar-campo" className="font-display text-lg font-semibold text-ink">Comparar fonetogramas</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-muted">Os dois campos vocais sobrepostos: o de antes em linha tracejada, o de depois preenchido.</p>
      {erro ? (
        <p className="mt-4 text-sm text-signal-err" role="alert">{erro}</p>
      ) : itens === null ? (
        <p className="mt-4 text-sm text-ink-muted">Carregando…</p>
      ) : (
        <>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[
              { id: idA, rotulo: "Antes", valor: idAntes, mudar: setIdAntes, teste: "vc2-comparar-campo-antes" },
              { id: idD, rotulo: "Depois", valor: idDepois, mudar: setIdDepois, teste: "vc2-comparar-campo-depois" },
            ].map((lado) => (
              <div key={lado.rotulo}>
                <label htmlFor={lado.id} className="text-sm font-medium text-ink">{lado.rotulo}</label>
                <select id={lado.id} className={cn(SELECT, "mt-1")} value={lado.valor ?? ""} onChange={(e) => lado.mudar(e.target.value)} data-testid={lado.teste}>
                  {itens.map((a, i) => <option key={a.id} value={a.id}>{rotulo(a, i + 1)}</option>)}
                </select>
              </div>
            ))}
          </div>
          {!dados ? (
            <p className="mt-4 text-sm text-ink-muted">Escolha dois fonetogramas diferentes.</p>
          ) : (
            <>
              <Sobreposicao antes={dados.pa} depois={dados.pd} unidade={dados.comp.unidade} />
              {dados.comp.aviso ? <p className="mt-1 text-xs text-signal-warn" data-testid="vc2-comparar-campo-aviso">{dados.comp.aviso}</p> : null}
              <p className="mt-3 text-sm text-ink" role="status" data-testid="vc2-comparar-campo-resumo">
                {dados.comp.nGanhas ? `Notas novas: ${dados.comp.ganhas}.` : "Nenhuma nota nova."}{" "}
                {dados.comp.nPerdidas ? `Não alcançadas desta vez: ${dados.comp.perdidas}.` : "Nenhuma nota perdida."}
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm" data-testid="vc2-comparar-campo-tabela">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-faint">
                      <th className="py-2 font-medium">Medida</th>
                      <th className="py-2 text-right font-medium">Antes</th>
                      <th className="py-2 text-right font-medium">Depois</th>
                      <th className="py-2 text-right font-medium">Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.comp.linhas.map((l) => (
                      <tr key={l.medida} className="border-b border-ink/[0.06]">
                        <td className="py-2 text-ink-muted">{l.medida}</td>
                        <td className="text-data py-2 text-right text-ink">{l.antes}</td>
                        <td className="text-data py-2 text-right text-ink">{l.depois}</td>
                        <td className="text-data py-2 text-right text-ink">{l.diferenca}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-ink-faint">
                Notas que faltam podem ser só passagens rápidas não sustentadas na gravação; confira com o paciente antes de concluir. Não é diagnóstico médico.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
