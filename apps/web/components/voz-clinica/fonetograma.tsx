"use client";

import { Mic, Pause, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { CalibracaoSpl, useCalibracao } from "@/components/voz-clinica/calibracao-spl";
import { noPisoDeDeteccao, type Calibracao } from "@/lib/voz-clinica-calibracao";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/errors";
import { hzToMidiFloat, midiToNoteName } from "@/lib/pitch-math";
import { fixoBR, salvarFonetograma } from "@/lib/voz-clinica-api";
import { medianaDe3, nivelDbfs, pitchYin } from "@/lib/voz-clinica-biofeedback";
import { pontosDoCampo, registrar, resumirCampo, type MapaCampo, type PontoCampo } from "@/lib/voz-clinica-fonetograma";
import { abrirMicrofoneAoVivo, gravadorSuportado } from "@/lib/voz-clinica-gravador";

const DB_MIN = -60;
const DB_MAX = 0;
const COR = { campo: "rgba(32,217,210,0.22)", contorno: "#20D9D2", grade: "rgba(148,163,184,0.12)", texto: "#94A3B8", atual: "#F8FAFC" };

/** `desloc`: 0 para dBFS; com calibração, os rótulos do eixo saem em dB SPL (dBFS + desloc). */
function desenharCampo(c: HTMLCanvasElement, pontos: PontoCampo[], atual: { midi: number; db: number } | null, desloc = 0) {
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const g = c.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  // eixo das notas: C2–C6, ampliado se o paciente passar disso
  const midis = pontos.map((p) => p.midi).concat(atual ? [Math.round(atual.midi)] : []);
  const mMin = Math.min(36, ...midis) - 1;
  const mMax = Math.max(84, ...midis) + 1;
  const PE = 40, PD = 10, PT = 10, PB = 24;
  const x = (m: number) => PE + ((m - mMin) / (mMax - mMin)) * (w - PE - PD);
  const y = (db: number) => PT + ((DB_MAX - Math.max(DB_MIN, Math.min(DB_MAX, db))) / (DB_MAX - DB_MIN)) * (h - PT - PB);
  const larg = (w - PE - PD) / (mMax - mMin);

  g.font = "11px ui-monospace, Consolas, monospace";
  g.lineWidth = 1;
  // linhas em valores redondos da unidade mostrada (dBFS ou dB SPL)
  for (let rotulo = Math.ceil((DB_MIN + desloc) / 10) * 10; rotulo <= DB_MAX + desloc; rotulo += 10) {
    const db = rotulo - desloc;
    g.strokeStyle = COR.grade;
    g.beginPath(); g.moveTo(PE, y(db)); g.lineTo(w - PD, y(db)); g.stroke();
    g.fillStyle = COR.texto; g.textAlign = "right"; g.textBaseline = "middle";
    g.fillText(String(rotulo), PE - 6, y(db));
  }
  g.textAlign = "center"; g.textBaseline = "alphabetic";
  for (let m = Math.ceil(mMin / 12) * 12; m <= mMax; m += 12) {
    g.strokeStyle = COR.grade;
    g.beginPath(); g.moveTo(x(m), PT); g.lineTo(x(m), h - PB); g.stroke();
    g.fillStyle = COR.texto;
    g.fillText(midiToNoteName(m), x(m), h - 6);
  }

  // campo: barra do mínimo ao máximo em cada semitom
  g.fillStyle = COR.campo;
  for (const p of pontos) g.fillRect(x(p.midi) - larg / 2, y(p.max_db), larg, Math.max(2, y(p.min_db) - y(p.max_db)));
  // contornos (interrompidos onde falta semitom)
  for (const chave of ["max_db", "min_db"] as const) {
    g.strokeStyle = COR.contorno; g.lineWidth = 2; g.beginPath();
    let anterior: number | null = null;
    for (const p of pontos) {
      if (anterior !== null && p.midi === anterior + 1) g.lineTo(x(p.midi), y(p[chave]));
      else g.moveTo(x(p.midi), y(p[chave]));
      anterior = p.midi;
    }
    g.stroke();
  }
  if (atual) {
    g.fillStyle = COR.atual;
    g.beginPath(); g.arc(x(atual.midi), y(atual.db), 6, 0, Math.PI * 2); g.fill();
  }
}

export function Fonetograma({ paciente, aoSalvar }: { paciente: string; aoSalvar: () => void }) {
  const id = useId();
  const [gravando, setGravando] = useState(false);
  const [pontos, setPontos] = useState<PontoCampo[]>([]);
  const [leitura, setLeitura] = useState<{ midi: number; db: number } | null>(null);
  const [duracao, setDuracao] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [suportado, setSuportado] = useState(true);
  const { calibracao: calibracaoAtual, setCalibracao, usarSpl, setUsarSpl } = useCalibracao();
  const [microfone, setMicrofone] = useState<string | null>(null);
  const [medindoCalibracao, setMedindoCalibracao] = useState(false);
  // a calibração que vale é a do INÍCIO do campo: os pontos já gravados foram medidos com aquele ganho
  const [calibracaoDoCampo, setCalibracaoDoCampo] = useState<Calibracao | null | undefined>(undefined);
  const calibracao = calibracaoDoCampo === undefined ? calibracaoAtual : calibracaoDoCampo;
  const calibracaoMudou = calibracaoDoCampo !== undefined && (calibracaoDoCampo?.data ?? null) !== (calibracaoAtual?.data ?? null);
  const desloc = calibracao && usarSpl ? calibracao.deslocamento_db : 0;
  const unidade = desloc ? "dB SPL" : "dBFS";
  const emUnidade = (dbfs: number) => Math.round((dbfs + desloc) * 10) / 10;

  const canvas = useRef<HTMLCanvasElement>(null);
  const mapa = useRef<MapaCampo>(new Map());
  const duracaoRef = useRef(0);
  const audio = useRef<{ ctx: AudioContext; stream: MediaStream; analisador: AnalyserNode } | null>(null);
  const abrindo = useRef(false);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  const quadro = useRef<number | null>(null);

  useEffect(() => setSuportado(gravadorSuportado()), []);
  useEffect(() => {
    if (canvas.current) desenharCampo(canvas.current, pontos, gravando ? leitura : null, desloc);
  }, [pontos, leitura, gravando, desloc]);

  const pausar = useCallback(() => {
    if (quadro.current !== null) cancelAnimationFrame(quadro.current);
    quadro.current = null;
    const a = audio.current;
    audio.current = null;
    a?.stream.getTracks().forEach((t) => t.stop());
    void a?.ctx.close().catch(() => undefined);
    setGravando(false);
    setLeitura(null);
    setPontos(pontosDoCampo(mapa.current));
  }, []);
  useEffect(() => pausar, [pausar]);

  async function gravar() {
    setErro(null);
    setSalvo(false);
    if (abrindo.current || audio.current || medindoCalibracao) return; // dois toques não abrem dois microfones
    abrindo.current = true;
    if (mapa.current.size === 0) setCalibracaoDoCampo(calibracaoAtual);
    try {
      if (!window.isSecureContext) throw new Error("O microfone só funciona em https:// ou em http://localhost.");
      const mic = await abrirMicrofoneAoVivo(() => montado.current);
      if (!mic) return; // a tela saiu enquanto o navegador pedia o microfone
      audio.current = mic;
      setMicrofone(mic.stream.getAudioTracks()[0]?.label || null);
    } catch (e) {
      setErro(e instanceof DOMException && e.name === "NotAllowedError" ? "Permita o uso do microfone no navegador." : friendlyError(e, "Não foi possível abrir o microfone."));
      return;
    } finally {
      abrindo.current = false;
    }
    setGravando(true);
    const buffer = new Float32Array(2048);
    const brutos: (number | null)[] = [];
    let anterior: number | null = null;
    let ultimaTela = 0;
    const passo = () => {
      const a = audio.current;
      if (!a) return;
      a.analisador.getFloatTimeDomainData(buffer);
      const t = a.ctx.currentTime;
      const dt = anterior === null ? 0 : Math.min(0.1, t - anterior);
      anterior = t;
      duracaoRef.current += dt;
      const r = pitchYin(buffer, a.ctx.sampleRate, 50, 1500);
      brutos.push(r?.hz ?? null);
      if (brutos.length > 3) brutos.shift();
      const hz = medianaDe3(brutos);
      const db = nivelDbfs(buffer);
      if (hz !== null) registrar(mapa.current, hz, db, dt);
      if (t - ultimaTela > 0.12) {
        ultimaTela = t;
        setPontos(pontosDoCampo(mapa.current));
        setLeitura(hz !== null ? { midi: hzToMidiFloat(hz), db } : null);
        setDuracao(duracaoRef.current);
      }
      quadro.current = requestAnimationFrame(passo);
    };
    quadro.current = requestAnimationFrame(passo);
  }

  function limpar() {
    mapa.current = new Map();
    setCalibracaoDoCampo(undefined);
    duracaoRef.current = 0;
    setPontos([]);
    setDuracao(0);
    setSalvo(false);
  }

  async function salvar() {
    if (!paciente || !pontos.length) return;
    setSalvando(true);
    setErro(null);
    try {
      await salvarFonetograma(paciente, Math.round(duracao * 10) / 10, pontos, desloc ? calibracao : null);
      setSalvo(true);
      aoSalvar();
    } catch (e) {
      setErro(friendlyError(e, "Não foi possível salvar o fonetograma."));
    } finally {
      setSalvando(false);
    }
  }

  const r = resumirCampo(pontos);
  return (
    <section className="panel-glass rounded-2xl p-4 md:p-5" aria-labelledby={`${id}-t`} data-testid="vc2-campo">
      <h2 id={`${id}-t`} className="font-display text-lg font-semibold text-ink">Fonetograma (campo vocal)</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-muted">
        Registra, para cada nota alcançada, a voz mais fraca e a mais forte. Pode pausar e retomar: as passadas se somam no mesmo campo.
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink">
        <li>Em voz <strong>fraca</strong>, deslize do mais grave ao mais agudo confortável e volte.</li>
        <li>Repita em voz <strong>forte</strong>, sem gritar.</li>
        <li>Sustente por um instante as notas extremas (as passagens rápidas não contam).</li>
      </ol>
      {desloc ? (
        <p className="mt-2 text-xs text-ink-muted" data-testid="vc2-campo-unidade">
          Intensidade em dB SPL pela calibração com decibelímetro (ponderação {calibracao!.ponderacao}, {fixoBR(calibracao!.distancia_cm, 0)} cm). Use o mesmo microfone, ganho e distância da calibração.
        </p>
      ) : (
        <p className="mt-2 text-xs text-signal-warn" data-testid="vc2-campo-unidade">
          Intensidade relativa (dBFS): compare sessões feitas com o mesmo microfone e a mesma distância. Para dB SPL, calibre com um decibelímetro abaixo.
        </p>
      )}
      {calibracao ? (
        <label className="mt-2 flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={usarSpl} onChange={(e) => setUsarSpl(e.target.checked)} disabled={gravando} data-testid="vc2-campo-usar-spl" />
          Mostrar e salvar em dB SPL (calibrado)
        </label>
      ) : null}
      <CalibracaoSpl calibracao={calibracaoAtual} microfoneAtual={microfone} ocupado={gravando} aoMudar={setCalibracao} aoMedir={setMedindoCalibracao} />
      {calibracaoMudou ? (
        <p className="mt-2 text-xs text-signal-warn" data-testid="vc2-campo-calibracao-mudou">
          A calibração mudou depois do início deste campo. Os pontos já gravados seguem com a calibração anterior; para usar a nova, toque em Recomeçar.
        </p>
      ) : null}
      {desloc && r.db_min !== null && noPisoDeDeteccao(r.db_min) ? (
        <p className="mt-2 text-xs text-signal-warn" data-testid="vc2-campo-piso">
          A voz mais fraca ficou no limite de detecção ({fixoBR(emUnidade(r.db_min), 0)} dB SPL): a real pode ser ainda mais fraca. Aumente o ganho da interface e recalibre para medir vozes mais fracas.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {gravando ? (
          <Button type="button" variant="danger" onClick={pausar} data-testid="vc2-campo-pausar"><Pause className="h-4 w-4" aria-hidden /> Pausar</Button>
        ) : (
          <Button type="button" onClick={() => void gravar()} disabled={!suportado || medindoCalibracao} data-testid="vc2-campo-gravar">
            <Mic className="h-4 w-4" aria-hidden /> {pontos.length ? "Continuar gravando" : "Começar"}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={limpar} disabled={gravando || !pontos.length}><RotateCcw className="h-4 w-4" aria-hidden /> Recomeçar</Button>
        <span className="text-data text-xs text-ink-muted">{fixoBR(duracao, 0)} s gravados</span>
      </div>

      <canvas ref={canvas} className="mt-4 block h-72 w-full rounded-xl bg-canvas-raised/60 ring-1 ring-inset ring-ink/10" role="img"
        aria-label={r.nota_grave ? `Campo vocal de ${r.nota_grave} a ${r.nota_aguda}, ${r.extensao_st} semitons` : "Campo vocal vazio"} />

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4" data-testid="vc2-campo-resumo">
        {([
          ["Nota mais grave", r.nota_grave ? `${r.nota_grave} · ${fixoBR(r.hz_grave, 0)} Hz` : "—"],
          ["Nota mais aguda", r.nota_aguda ? `${r.nota_aguda} · ${fixoBR(r.hz_agudo, 0)} Hz` : "—"],
          ["Extensão", r.semitons_alcancados ? `${r.extensao_st} semitons` : "—"],
          ["Faixa dinâmica média", r.faixa_dinamica_media_db !== null ? `${fixoBR(r.faixa_dinamica_media_db, 1)} dB` : "—"],
          [`Intensidade (${unidade})`, r.db_min !== null && r.db_max !== null ? `${fixoBR(emUnidade(r.db_min), 0)} a ${fixoBR(emUnidade(r.db_max), 0)}` : "—"],
        ] as const).map(([rotulo, valor]) => (
          <div key={rotulo}><dt className="text-xs text-ink-muted">{rotulo}</dt><dd className="text-data text-ink">{valor}</dd></div>
        ))}
      </dl>

      {pontos.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-ink-muted">Ver valores por nota ({pontos.length})</summary>
          <table className="mt-2 w-full max-w-md text-xs">
            <thead><tr className="text-left text-ink-faint"><th className="py-1">Nota</th><th className="text-right">Hz</th><th className="text-right">Mín. ({unidade})</th><th className="text-right">Máx. ({unidade})</th></tr></thead>
            <tbody>
              {pontos.map((p) => (
                <tr key={p.midi} className="border-t border-ink/[0.06] text-ink">
                  <td className="py-1">{p.nota}</td>
                  <td className="text-data text-right">{fixoBR(p.hz, 0)}</td>
                  <td className="text-data text-right">{fixoBR(emUnidade(p.min_db), 1)}</td>
                  <td className="text-data text-right">{fixoBR(emUnidade(p.max_db), 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="secondary" onClick={() => void salvar()} disabled={gravando || !paciente || !pontos.length || salvando || salvo} data-testid="vc2-campo-salvar">
          {salvo ? "Salvo no histórico" : salvando ? "Salvando…" : "Salvar no histórico"}
        </Button>
        {!paciente ? <span className="text-xs text-ink-faint">Preencha o paciente no topo para salvar.</span> : null}
      </div>
      {erro ? <p className="mt-3 text-sm text-signal-err" role="alert">{erro}</p> : null}
    </section>
  );
}
