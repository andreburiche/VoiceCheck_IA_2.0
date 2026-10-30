"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/errors";
import { fixoBR } from "@/lib/voz-clinica-api";
import { nivelDbfs } from "@/lib/voz-clinica-biofeedback";
import {
  apagarCalibracao,
  avisosDaCalibracao,
  criarCalibracao,
  erroDaCalibracao,
  guardarCalibracao,
  medirReferencia,
  type Calibracao,
  type Ponderacao,
} from "@/lib/voz-clinica-calibracao";
import { abrirMicrofoneAoVivo, type MicrofoneAoVivo } from "@/lib/voz-clinica-gravador";

const DURACAO_MEDICAO_S = 4;
const CAMPO = "mt-1 w-full rounded-lg bg-canvas-raised px-3 py-2 text-sm text-ink ring-1 ring-inset ring-ink/15 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

function dataBR(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
}

/**
 * Calibração do microfone com decibelímetro: o profissional sustenta uma vogal,
 * a tela mede o dBFS por 4 s e ele digita o nível que o aparelho mostrou.
 */
export function CalibracaoSpl({ calibracao, microfoneAtual, ocupado, aoMudar }: {
  calibracao: Calibracao | null;
  microfoneAtual: string | null;
  ocupado: boolean;
  aoMudar: (c: Calibracao | null) => void;
}) {
  const id = useId();
  const [medindo, setMedindo] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [medicao, setMedicao] = useState<{ dbfs: number; variacao_db: number; microfone: string } | null>(null);
  const [referencia, setReferencia] = useState("");
  const [ponderacao, setPonderacao] = useState<Ponderacao>("C");
  const [distancia, setDistancia] = useState("30");
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const mic = useRef<MicrofoneAoVivo | null>(null);
  const quadro = useRef<number | null>(null);
  const montado = useRef(true);
  const abrindo = useRef(false);

  function fechar() {
    if (quadro.current !== null) cancelAnimationFrame(quadro.current);
    quadro.current = null;
    const m = mic.current;
    mic.current = null;
    m?.stream.getTracks().forEach((t) => t.stop());
    void m?.ctx.close().catch(() => undefined);
  }
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; fechar(); };
  }, []);

  async function medir() {
    if (abrindo.current || mic.current) return;
    abrindo.current = true;
    setErro(null); setMsg(null); setMedicao(null);
    try {
      const m = await abrirMicrofoneAoVivo(() => montado.current);
      if (!m) return;
      mic.current = m;
    } catch (e) {
      setErro(e instanceof DOMException && e.name === "NotAllowedError" ? "Permita o uso do microfone no navegador." : friendlyError(e, "Não foi possível abrir o microfone."));
      return;
    } finally {
      abrindo.current = false;
    }
    setMedindo(true);
    const m = mic.current!;
    const nome = m.stream.getAudioTracks()[0]?.label ?? "";
    const buffer = new Float32Array(m.analisador.fftSize);
    const leituras: number[] = [];
    const inicio = m.ctx.currentTime;
    const passo = () => {
      if (mic.current !== m) return;
      m.analisador.getFloatTimeDomainData(buffer);
      leituras.push(nivelDbfs(buffer));
      const t = m.ctx.currentTime - inicio;
      setProgresso(Math.min(1, t / DURACAO_MEDICAO_S));
      if (t < DURACAO_MEDICAO_S) { quadro.current = requestAnimationFrame(passo); return; }
      fechar();
      setMedindo(false);
      const r = medirReferencia(leituras, t / Math.max(1, leituras.length));
      if (!r.ok) { setErro(r.erro); return; }
      setMedicao({ dbfs: r.dbfs, variacao_db: r.variacao_db, microfone: nome });
    };
    quadro.current = requestAnimationFrame(passo);
  }

  function salvar() {
    if (!medicao) return;
    const spl = Number(referencia.replace(",", "."));
    const dist = Number(distancia.replace(",", "."));
    const c = criarCalibracao(medicao.dbfs, spl, ponderacao, dist, medicao.microfone);
    const problema = erroDaCalibracao(c);
    if (problema) { setErro(problema); return; }
    setErro(null);
    setMsg(guardarCalibracao(c) ? "Calibração guardada neste navegador." : "Calibração em uso só nesta página: o navegador bloqueou o armazenamento.");
    setMedicao(null);
    setReferencia("");
    aoMudar(c);
  }

  function remover() {
    apagarCalibracao();
    setMsg("Calibração removida: as medidas voltam a ser relativas (dBFS).");
    aoMudar(null);
  }

  const avisos = calibracao ? avisosDaCalibracao(calibracao, microfoneAtual) : [];
  return (
    <details className="mt-3 rounded-xl p-3 ring-1 ring-inset ring-ink/10" data-testid="vc2-calibracao">
      <summary className="cursor-pointer text-sm font-medium text-ink">
        Calibrar com decibelímetro (dB SPL){calibracao ? ` · calibrado em ${dataBR(calibracao.data)}` : ""}
      </summary>
      {calibracao ? (
        <div className="mt-2 text-sm text-ink" data-testid="vc2-calibracao-atual">
          <p>
            Em uso: {calibracao.microfone || "microfone sem nome"}, a {fixoBR(calibracao.distancia_cm, 0)} cm, ponderação {calibracao.ponderacao},
            referência de {fixoBR(calibracao.referencia_db_spl, 1)} dB SPL (dB SPL = dBFS + {fixoBR(calibracao.deslocamento_db, 1)}).
          </p>
          {avisos.map((a) => <p key={a} className="mt-1 text-xs text-signal-warn">{a}</p>)}
          <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={remover} disabled={ocupado || medindo}>Remover calibração</Button>
        </div>
      ) : null}
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink">
        <li>Deixe o ganho da interface e a posição do microfone como ficarão nas medições (qualquer mudança desfaz a calibração).</li>
        <li>Ponha o decibelímetro ao lado do microfone, à mesma distância da boca (ex.: 30 cm), em resposta lenta e ponderação C ou Z (linear), se houver.</li>
        <li>Toque em “Medir” e sustente um “a” confortável e constante por {DURACAO_MEDICAO_S} s, olhando o valor médio no decibelímetro.</li>
        <li>Digite o valor lido e guarde.</li>
      </ol>
      <p className="mt-2 text-xs text-ink-muted">Aplicativos de decibelímetro de celular não são instrumentos calibrados; prefira um medidor classe 2 ou melhor.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={() => void medir()} disabled={ocupado || medindo} data-testid="vc2-calibracao-medir">
          {medindo ? `Medindo… ${Math.round(progresso * 100)}%` : "Medir"}
        </Button>
        {ocupado ? <span className="text-xs text-ink-faint">Pause a gravação para calibrar.</span> : null}
      </div>
      {medicao ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-3" data-testid="vc2-calibracao-form">
          <p className="text-sm text-ink sm:col-span-3">
            Medido: {fixoBR(medicao.dbfs, 1)} dBFS (variação de {fixoBR(medicao.variacao_db, 1)} dB).
          </p>
          <label className="text-xs text-ink-muted" htmlFor={`${id}-spl`}>Valor do decibelímetro (dB SPL)
            <input id={`${id}-spl`} className={CAMPO} inputMode="decimal" value={referencia} onChange={(e) => setReferencia(e.target.value)} data-testid="vc2-calibracao-spl" />
          </label>
          <label className="text-xs text-ink-muted" htmlFor={`${id}-pond`}>Ponderação
            <select id={`${id}-pond`} className={CAMPO} value={ponderacao} onChange={(e) => setPonderacao(e.target.value as Ponderacao)}>
              <option value="C">C</option>
              <option value="Z">Z (linear)</option>
              <option value="A">A</option>
            </select>
          </label>
          <label className="text-xs text-ink-muted" htmlFor={`${id}-dist`}>Distância boca–microfone (cm)
            <input id={`${id}-dist`} className={CAMPO} inputMode="decimal" value={distancia} onChange={(e) => setDistancia(e.target.value)} />
          </label>
          <div className="sm:col-span-3">
            <Button type="button" size="sm" variant="secondary" onClick={salvar} disabled={!referencia.trim()} data-testid="vc2-calibracao-guardar">Guardar calibração</Button>
          </div>
        </div>
      ) : null}
      {msg ? <p className="mt-2 text-sm text-ink" role="status">{msg}</p> : null}
      {erro ? <p className="mt-2 text-sm text-signal-err" role="alert">{erro}</p> : null}
    </details>
  );
}
