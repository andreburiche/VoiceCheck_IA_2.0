"use client";

import { Mic, Square } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { fixoBR, salvarCarga } from "@/lib/voz-clinica-api";
import { medianaDe3, nivelDbfs, pitchYin, posicaoNaFaixa, type AmostraSessao, type Faixa } from "@/lib/voz-clinica-biofeedback";
import { alvoDaHabitual, resumirCarga, type ResumoCarga } from "@/lib/voz-clinica-carga";
import { caminhoSvg, dominioArredondado } from "@/lib/voz-clinica-graficos";
import { abrirMicrofoneAoVivo, gravadorSuportado, type MicrofoneAoVivo } from "@/lib/voz-clinica-gravador";
import { TEXTO_LEITURA } from "@/lib/voz-clinica-protocolo";

const PAINEL = "panel-glass rounded-2xl p-4 md:p-5";
const SELECT =
  "h-10 w-full rounded-lg border border-line bg-canvas-raised px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";
const DURACOES = [1, 3, 5, 10, 15] as const;
const CALIBRACAO_S = 6;
const PASSO_MS = 100;

type Fase = "pronto" | "calibrando" | "teste" | "fim";

function mmss(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/** Curvas por minuto: F0 (Hz) e intensidade (dBFS). */
function GraficoMinutos({ r }: { r: ResumoCarga }) {
  const w = 560;
  const h = 110;
  const pe = 44;
  const ih = h - 30;
  const iw = w - pe - 10;
  const f0 = r.minutos.map((m) => m.f0_mediana_hz);
  const db = r.minutos.map((m) => m.db_mediano);
  if (r.minutos.length < 2) return null;
  const x = (i: number) => (i / (r.minutos.length - 1)) * iw;
  const linhas = [
    { rotulo: "F0 (Hz)", v: f0, dom: dominioArredondado(f0, 10, 30), cor: "var(--accent)" },
    { rotulo: "Intensidade (dBFS)", v: db, dom: dominioArredondado(db, 5, 15), cor: "rgb(232 184 74)" },
  ];
  return (
    <div className="mt-3 space-y-2">
      {linhas.map((l) => (
        <svg key={l.rotulo} viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={`${l.rotulo} por minuto do teste`}>
          <g transform={`translate(${pe} 8)`}>
            <line x1={0} x2={iw} y1={ih} y2={ih} stroke="currentColor" className="text-ink/10" />
            <path d={caminhoSvg(l.v, iw, ih, l.dom, x)} fill="none" stroke={l.cor} strokeWidth={2} />
            {l.v.map((v, i) => (v === null ? null : <circle key={i} cx={x(i)} cy={ih - ((v - l.dom[0]) / (l.dom[1] - l.dom[0] || 1)) * ih} r={3} fill={l.cor} />))}
          </g>
          <text x={pe - 6} y={16} textAnchor="end" fontSize={11} fill="currentColor" className="text-ink-faint">{l.dom[1]}</text>
          <text x={pe - 6} y={8 + ih} textAnchor="end" fontSize={11} fill="currentColor" className="text-ink-faint">{l.dom[0]}</text>
          <text x={pe + 4} y={18} fontSize={11} fill="currentColor" className="text-ink-faint">{l.rotulo}</text>
          {r.minutos.map((m, i) => (
            <text key={m.minuto} x={pe + x(i)} y={h - 4} textAnchor={i === 0 ? "start" : i === r.minutos.length - 1 ? "end" : "middle"} fontSize={11} fill="currentColor" className="text-ink-faint">{`${m.minuto} min`}</text>
          ))}
        </svg>
      ))}
    </div>
  );
}

/** Teste de carga vocal: leitura em voz forte por alguns minutos, com F0 e intensidade monitoradas. */
export function CargaVocal({ paciente, aoSalvar }: { paciente: string; aoSalvar: () => void }) {
  const [minutos, setMinutos] = useState<(typeof DURACOES)[number]>(5);
  const [fase, setFase] = useState<Fase>("pronto");
  const [alvo, setAlvo] = useState<Faixa | null>(null);
  const [leitura, setLeitura] = useState<{ t: number; db: number; hz: number | null; dentro: number | null }>({ t: 0, db: -120, hz: null, dentro: null });
  const [resumo, setResumo] = useState<ResumoCarga | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);
  const audio = useRef<MicrofoneAoVivo | null>(null);
  const timer = useRef<number | null>(null);
  const amostras = useRef<AmostraSessao[]>([]);
  const montado = useRef(true);
  const idDur = useId();
  const [suportado, setSuportado] = useState(true);
  useEffect(() => setSuportado(gravadorSuportado()), []);

  const encerrar = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    const a = audio.current;
    audio.current = null;
    a?.stream.getTracks().forEach((t) => t.stop());
    void a?.ctx.close().catch(() => undefined);
  }, []);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      encerrar();
    };
  }, [encerrar]);

  /** Mede a cada 100 ms; `fim(amostras)` é chamado ao atingir `limite_s` (ou ao parar). */
  async function medir(limite_s: number, faixa: Faixa | null, fim: (a: AmostraSessao[]) => void) {
    setErro(null);
    try {
      if (!window.isSecureContext) throw new Error("O microfone só funciona em https:// ou em http://localhost.");
      const mic = await abrirMicrofoneAoVivo(() => montado.current);
      if (!mic) return false;
      audio.current = mic;
    } catch (e) {
      encerrar();
      setErro(e instanceof DOMException && e.name === "NotAllowedError" ? "Permita o uso do microfone no navegador." : friendlyError(e, "Não foi possível abrir o microfone."));
      return false;
    }
    amostras.current = [];
    const buffer = new Float32Array(2048);
    const brutos: (number | null)[] = [];
    let dentro = 0;
    let voz = 0;
    const t0 = audio.current.ctx.currentTime;
    timer.current = window.setInterval(() => {
      const a = audio.current;
      if (!a) return;
      a.analisador.getFloatTimeDomainData(buffer);
      const t = a.ctx.currentTime - t0;
      const db = nivelDbfs(buffer);
      brutos.push(pitchYin(buffer, a.ctx.sampleRate, 60, 800)?.hz ?? null);
      if (brutos.length > 3) brutos.shift();
      const hz = medianaDe3(brutos);
      amostras.current.push({ t, hz, db });
      if (hz !== null) {
        voz++;
        if (faixa && posicaoNaFaixa(db, faixa) === "dentro") dentro++;
      }
      setLeitura({ t, db, hz, dentro: faixa && voz ? (100 * dentro) / voz : null });
      if (t >= limite_s) {
        encerrar();
        fim(amostras.current);
      }
    }, PASSO_MS);
    return true;
  }

  async function calibrar() {
    setResumo(null);
    setSalvo(null);
    setAlvo(null);
    setFase("calibrando");
    const ok = await medir(CALIBRACAO_S, null, (a) => {
      const vozes = a.filter((x) => x.hz !== null).map((x) => x.db).sort((p, q) => p - q);
      if (vozes.length < 10) {
        setErro("Quase não houve voz na calibração. Leia o texto em voz habitual e tente de novo.");
        setFase("pronto");
        return;
      }
      setAlvo(alvoDaHabitual(vozes[Math.floor(vozes.length / 2)]!));
      setFase("pronto");
    });
    if (!ok) setFase("pronto");
  }

  async function iniciarTeste() {
    if (!alvo) return;
    setResumo(null);
    setSalvo(null);
    setFase("teste");
    const ok = await medir(minutos * 60, alvo, (a) => {
      setResumo(resumirCarga(a, alvo, minutos * 60));
      setFase("fim");
    });
    if (!ok) setFase("pronto");
  }

  function pararAntes() {
    encerrar();
    if (fase === "teste" && alvo) {
      setResumo(resumirCarga(amostras.current, alvo, minutos * 60));
      setFase("fim");
    } else {
      setFase("pronto");
    }
  }

  async function salvar() {
    if (!resumo || !paciente) return;
    setErro(null);
    try {
      const r = await salvarCarga(paciente, resumo);
      setSalvo(r.avaliacao_id ? "Teste salvo no histórico." : null);
      aoSalvar();
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível salvar o teste."));
    }
  }

  const ocupado = fase === "calibrando" || fase === "teste";
  const posicao = alvo ? posicaoNaFaixa(leitura.db, alvo) : null;
  const pctBarra = (db: number) => Math.max(0, Math.min(100, ((db + 60) / 60) * 100));

  return (
    <section className={PAINEL} aria-labelledby="vc2-carga" data-testid="vc2-carga">
      <h2 id="vc2-carga" className="font-display text-lg font-semibold text-ink">Teste de carga vocal</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-muted">
        O paciente lê em voz forte por alguns minutos enquanto a intensidade e a F0 são acompanhadas. Antes e depois, grave a vogal na aba Avaliação e compare na aba Comparar.
      </p>
      {!suportado ? <p className="mt-3 text-sm text-signal-err">Este navegador não acessa o microfone.</p> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={idDur}>Duração do teste</Label>
          <select id={idDur} className={cn(SELECT, "mt-1")} value={minutos} disabled={ocupado}
            onChange={(e) => setMinutos(Number(e.target.value) as (typeof DURACOES)[number])} data-testid="vc2-carga-duracao">
            {DURACOES.map((d) => <option key={d} value={d}>{d === 1 ? "1 minuto (triagem)" : `${d} minutos`}</option>)}
          </select>
        </div>
        <div className="text-sm">
          <p className="text-ink-muted">Intensidade pedida</p>
          <p className="text-data mt-2 text-ink" data-testid="vc2-carga-alvo">
            {alvo ? `${alvo.min} a ${alvo.max} dBFS (habitual + 6 a 14 dB)` : "Calibre com a voz habitual"}
          </p>
        </div>
      </div>

      <blockquote className="mt-4 max-w-[70ch] rounded-xl bg-canvas-raised/60 px-4 py-3 text-base leading-relaxed text-ink ring-1 ring-inset ring-ink/10">
        {TEXTO_LEITURA}
      </blockquote>
      <p className="mt-1 text-xs text-ink-faint">Leia em voz alta e repita o texto até o fim do tempo. Mesmo microfone e distância da calibração.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {ocupado ? (
          <Button type="button" variant="danger" onClick={pararAntes} data-testid="vc2-carga-parar">
            <Square className="h-4 w-4" aria-hidden /> Parar
          </Button>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={() => void calibrar()} data-testid="vc2-carga-calibrar">
              <Mic className="h-4 w-4" aria-hidden /> {alvo ? "Calibrar de novo" : `1. Calibrar (${CALIBRACAO_S} s em voz habitual)`}
            </Button>
            <Button type="button" onClick={() => void iniciarTeste()} disabled={!alvo} data-testid="vc2-carga-iniciar">
              <Mic className="h-4 w-4" aria-hidden /> 2. Iniciar teste em voz forte
            </Button>
          </>
        )}
      </div>

      {ocupado ? (
        <div className="mt-4" aria-live="off">
          <p className="text-data text-2xl text-ink">
            {fase === "calibrando" ? `Calibrando… ${mmss(Math.max(0, CALIBRACAO_S - leitura.t))}` : `${mmss(leitura.t)} de ${mmss(minutos * 60)}`}
          </p>
          <div className="relative mt-3 h-4 overflow-hidden rounded-full bg-canvas-overlay ring-1 ring-inset ring-line" role="meter"
            aria-label="Intensidade da voz" aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.round(leitura.db)}>
            {alvo ? <div className="absolute inset-y-0 bg-signal-ok/25" style={{ left: `${pctBarra(alvo.min)}%`, width: `${pctBarra(alvo.max) - pctBarra(alvo.min)}%` }} /> : null}
            <div className={cn("absolute inset-y-0 left-0 transition-[width] duration-100", posicao === "dentro" ? "bg-signal-ok" : "bg-accent")} style={{ width: `${pctBarra(leitura.db)}%` }} />
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            {posicao === "abaixo" ? "Mais forte" : posicao === "acima" ? "Um pouco mais fraco" : posicao === "dentro" ? "Na intensidade pedida" : ""}
            {leitura.hz ? ` · F0 ${fixoBR(leitura.hz, 0)} Hz` : ""}
            {leitura.dentro !== null ? ` · ${fixoBR(leitura.dentro, 0)}% do tempo na faixa` : ""}
          </p>
        </div>
      ) : null}

      {erro ? <p className="mt-3 text-sm text-signal-err" role="alert">{erro}</p> : null}

      {resumo ? (
        <div className="mt-5" aria-live="polite" data-testid="vc2-carga-resumo">
          <table className="w-full text-sm">
            <tbody>
              {([
                ["Duração", `${mmss(resumo.duracao_s)} de ${mmss(resumo.duracao_planejada_s)} planejados`],
                ["Tempo com voz", `${fixoBR(resumo.fonacao_s, 0)} s`],
                ["Na intensidade pedida", resumo.dentro_alvo_pct === null ? "—" : `${fixoBR(resumo.dentro_alvo_pct, 0)}% do tempo com voz`],
                ["F0 no início → no fim", `${fixoBR(resumo.f0_inicio_hz, 0)} → ${fixoBR(resumo.f0_fim_hz, 0)} Hz` + (resumo.variacao_f0_st === null ? "" : ` (${resumo.variacao_f0_st > 0 ? "+" : ""}${fixoBR(resumo.variacao_f0_st, 1)} st)`)],
                ["Intensidade no início → no fim", `${fixoBR(resumo.db_inicio, 1)} → ${fixoBR(resumo.db_fim, 1)} dBFS` + (resumo.variacao_db === null ? "" : ` (${resumo.variacao_db > 0 ? "+" : ""}${fixoBR(resumo.variacao_db, 1)} dB)`)],
              ] as const).map(([m, v]) => (
                <tr key={m} className="border-b border-ink/[0.06]">
                  <td className="py-2 text-ink-muted">{m}</td>
                  <td className="text-data py-2 text-right text-ink">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <GraficoMinutos r={resumo} />
          <p className="mt-2 text-xs text-ink-faint">
            Subida da F0 e queda da intensidade ao longo do teste podem indicar esforço ou fadiga; compare com a percepção do paciente e com a vogal antes/depois. Não é diagnóstico médico.
          </p>
          <div className="mt-3">
            {paciente ? (
              <Button type="button" onClick={() => void salvar()} disabled={!!salvo} data-testid="vc2-carga-salvar">Salvar no histórico</Button>
            ) : (
              <p className="text-xs text-ink-faint">Preencha o nome do paciente para salvar.</p>
            )}
            {salvo ? <p className="mt-2 text-xs text-ink-muted" role="status">{salvo}</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
