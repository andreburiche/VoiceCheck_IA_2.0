"use client";

import { ClipboardPaste, Copy, Download, Play, Scissors, Square, Tag, Trash2, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lerWavPcm16 } from "@/lib/voz-clinica-espectrograma";
import { adicionarMarca, apagarTrecho, colarTrecho, colunasMinMax, copiarTrecho, normalizarSelecao, segTexto, textGrid, textoSeg, zoom, type Intervalo, type Marca } from "@/lib/voz-clinica-editor";
import type { GravacaoClinica } from "@/lib/voz-clinica-gravador";
import { codificarWav, recortar } from "@/lib/voz-clinica-wav";

const ALTURA = 120;
/** A análise aceita até 60 s: a edição não deixa passar disso. */
const MAX_S = 60;
const COR = { onda: "#20D9D2", fundo: "rgba(148,163,184,0.06)", selecao: "rgba(32,217,210,0.18)", borda: "rgba(32,217,210,0.8)", eixo: "#94A3B8", cursor: "#F8FAFC", marca: "rgba(232,184,74,0.22)", marcaBorda: "#E8B84A" };
/** Faixa das marcações, abaixo da onda (como a camada do TextGrid no Praat). */
const FAIXA = 22;

function novaGravacao(amostras: Float32Array, taxa: number, avisos: string[]): GravacaoClinica {
  return { wav: new Blob([codificarWav(amostras, taxa)], { type: "audio/wav" }), duracao: amostras.length / taxa, taxa, avisos };
}

/**
 * Editor da gravação antes da análise: arrastar sobre a onda seleciona; dá para ampliar, ouvir,
 * manter só a seleção, apagar a seleção e desfazer. Os campos de início/fim fazem o mesmo pelo teclado.
 */
export function EditorAudio({ gravacao, aoMudar }: { gravacao: GravacaoClinica; aoMudar: (g: GravacaoClinica) => void }) {
  const id = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [audio, setAudio] = useState<{ amostras: Float32Array; taxa: number } | null>(null);
  const [janela, setJanela] = useState<Intervalo>({ ini: 0, fim: gravacao.duracao });
  const [sel, setSel] = useState<Intervalo | null>(null);
  const [campos, setCampos] = useState({ ini: "0,00", fim: segTexto(gravacao.duracao) });
  const [historico, setHistorico] = useState<GravacaoClinica[]>([]);
  const [tocando, setTocando] = useState<{ t0: number; ini: number; fim: number } | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /** Trecho copiado (amostras) e ponto onde colar quando não há seleção (clique na onda). */
  const [copiado, setCopiado] = useState<{ amostras: Float32Array; taxa: number } | null>(null);
  const [ponto, setPonto] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  /** Marcações da gravação atual (somem se a gravação mudar: os tempos deixariam de valer). */
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [etiqueta, setEtiqueta] = useState("");
  const arrasto = useRef<number | null>(null);
  const som = useRef<{ ctx: AudioContext; fonte: AudioBufferSourceNode } | null>(null);

  // nova gravação (de fora ou de uma edição): lê as amostras e mostra tudo
  useEffect(() => {
    let vivo = true;
    void gravacao.wav.arrayBuffer().then((buf) => {
      if (!vivo) return;
      try {
        const a = lerWavPcm16(buf);
        setAudio(a);
        const d = a.amostras.length / a.taxa;
        setJanela({ ini: 0, fim: d });
        setSel(null);
        setPonto(null);
        setMarcas([]);
        setCampos({ ini: "0,00", fim: segTexto(d) });
        setErro(null);
      } catch {
        setErro("Não foi possível ler a gravação para editar.");
      }
    });
    return () => { vivo = false; };
  }, [gravacao]);

  const parar = useCallback(() => {
    try { som.current?.fonte.stop(); } catch { /* já parou */ }
    void som.current?.ctx.close().catch(() => undefined);
    som.current = null;
    setTocando(null);
    setCursor(null);
  }, []);
  useEffect(() => parar, [parar]);

  const duracao = audio ? audio.amostras.length / audio.taxa : gravacao.duracao;

  // desenho
  useEffect(() => {
    const c = canvas.current;
    if (!c || !audio) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    c.width = Math.round(w * dpr);
    const altura = ALTURA + (marcas.length ? FAIXA : 0);
    c.height = Math.round(altura * dpr);
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, altura);
    const ih = ALTURA - 18;
    const x = (t: number) => ((t - janela.ini) / (janela.fim - janela.ini)) * w;
    g.fillStyle = COR.fundo;
    g.fillRect(0, 0, w, ih);
    if (sel) {
      g.fillStyle = COR.selecao;
      g.fillRect(x(sel.ini), 0, x(sel.fim) - x(sel.ini), ih);
      g.fillStyle = COR.borda;
      g.fillRect(x(sel.ini), 0, 1, ih);
      g.fillRect(x(sel.fim) - 1, 0, 1, ih);
    }
    const n = Math.max(1, Math.floor(w));
    const { min, max } = colunasMinMax(audio.amostras, audio.taxa, janela, n);
    let pico = 1e-6;
    for (let i = 0; i < n; i++) pico = Math.max(pico, -min[i]!, max[i]!);
    g.fillStyle = COR.onda;
    for (let i = 0; i < n; i++) {
      const y0 = ih / 2 - (max[i]! / pico) * (ih / 2 - 2);
      const y1 = ih / 2 - (min[i]! / pico) * (ih / 2 - 2);
      g.fillRect(i, y0, 1, Math.max(1, y1 - y0));
    }
    if (cursor !== null) {
      g.fillStyle = COR.cursor;
      g.fillRect(x(cursor), 0, 1.5, ih);
    }
    if (ponto !== null && !sel) {
      // ponto de colagem: linha tracejada
      g.fillStyle = COR.eixo;
      for (let y = 0; y < ih; y += 6) g.fillRect(x(ponto), y, 1, 3);
    }
    if (marcas.length) {
      // faixa das marcações: retângulo por trecho e a etiqueta, cortada se não couber
      const y0 = ALTURA;
      g.font = "12px ui-sans-serif, system-ui, sans-serif";
      g.textBaseline = "middle";
      g.textAlign = "center";
      for (const m of marcas) {
        const a = Math.max(0, x(m.ini));
        const b = Math.min(w, x(m.fim));
        if (b <= 0 || a >= w) continue;
        g.fillStyle = COR.marca;
        g.fillRect(a, y0, b - a, FAIXA - 2);
        g.fillStyle = COR.marcaBorda;
        g.fillRect(a, y0, 1, FAIXA - 2);
        g.fillRect(b - 1, y0, 1, FAIXA - 2);
        g.save();
        g.beginPath();
        g.rect(a + 2, y0, Math.max(0, b - a - 4), FAIXA);
        g.clip();
        g.fillStyle = COR.cursor;
        g.fillText(m.texto, (a + b) / 2, y0 + (FAIXA - 2) / 2);
        g.restore();
      }
    }
    g.font = "11px ui-monospace, Consolas, monospace";
    g.fillStyle = COR.eixo;
    g.textBaseline = "alphabetic";
    g.textAlign = "left";
    g.fillText(`${segTexto(janela.ini)} s`, 2, ALTURA - 4);
    g.textAlign = "right";
    g.fillText(`${segTexto(janela.fim)} s`, w - 2, ALTURA - 4);
  }, [audio, janela, sel, cursor, ponto, marcas]);

  // cursor de reprodução
  useEffect(() => {
    if (!tocando) return;
    let quadro = 0;
    const passo = () => {
      const s = som.current;
      if (!s) return;
      const t = tocando.ini + (s.ctx.currentTime - tocando.t0);
      if (t >= tocando.fim) { parar(); return; }
      setCursor(t);
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [tocando, parar]);

  function tempoDoEvento(e: React.PointerEvent) {
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const k = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    return janela.ini + k * (janela.fim - janela.ini);
  }
  function aplicarSel(s: Intervalo | null) {
    setSel(s);
    setCampos(s ? { ini: segTexto(s.ini), fim: segTexto(s.fim) } : { ini: "0,00", fim: segTexto(duracao) });
  }

  function ouvir() {
    if (!audio) return;
    parar();
    const trecho = sel ?? janela;
    const ctx = new AudioContext();
    const pedaco = recortar(audio.amostras, audio.taxa, trecho.ini, trecho.fim);
    const buf = ctx.createBuffer(1, Math.max(1, pedaco.length), audio.taxa);
    buf.getChannelData(0).set(pedaco);
    const fonte = ctx.createBufferSource();
    fonte.buffer = buf;
    fonte.connect(ctx.destination);
    fonte.onended = () => parar();
    fonte.start();
    som.current = { ctx, fonte };
    setTocando({ t0: ctx.currentTime, ini: trecho.ini, fim: trecho.fim });
  }

  function editar(novas: Float32Array) {
    if (!audio) return;
    if (novas.length < 0.5 * audio.taxa) {
      setErro("O resultado precisa ter pelo menos 0,5 s.");
      return;
    }
    if (novas.length > MAX_S * audio.taxa) {
      setErro(`O resultado passaria de ${MAX_S} s, o limite da análise. Apague um trecho antes de colar.`);
      return;
    }
    setErro(null);
    parar();
    setHistorico((h) => [...h.slice(-19), gravacao]); // guarda até 20 passos para desfazer
    aoMudar(novaGravacao(novas, audio.taxa, gravacao.avisos));
  }

  function selecaoDosCampos(): Intervalo | null {
    const a = textoSeg(campos.ini);
    const b = textoSeg(campos.fim);
    if (a === null || b === null) return null;
    return normalizarSelecao(a, b, duracao);
  }

  function manterSelecao() {
    const s = selecaoDosCampos();
    if (!audio || !s) { setErro("Informe o início e o fim do trecho, em segundos (fim maior que início)."); return; }
    editar(recortar(audio.amostras, audio.taxa, s.ini, s.fim));
  }
  function apagarSelecao() {
    const s = selecaoDosCampos();
    if (!audio || !s) { setErro("Selecione o trecho que quer apagar."); return; }
    editar(apagarTrecho(audio.amostras, audio.taxa, s));
  }
  function copiar() {
    const s = selecaoDosCampos();
    if (!audio || !s) { setErro("Selecione o trecho que quer copiar."); return; }
    setCopiado({ amostras: copiarTrecho(audio.amostras, audio.taxa, s), taxa: audio.taxa });
    setErro(null);
    setAviso(`Trecho de ${segTexto(s.fim - s.ini)} s copiado. Clique na onda onde quer colar (ou selecione o trecho a substituir).`);
  }
  function colar() {
    if (!audio || !copiado) return;
    if (copiado.taxa !== audio.taxa) { setErro("O trecho copiado é de outra gravação, com outra taxa de amostragem."); return; }
    const alvo = sel ?? ponto ?? duracao;
    editar(colarTrecho(audio.amostras, audio.taxa, copiado.amostras, alvo));
    setAviso(sel ? "Seleção substituída pelo trecho copiado." : `Trecho colado em ${segTexto(typeof alvo === "number" ? alvo : alvo.ini)} s.`);
  }
  function marcar() {
    const s = selecaoDosCampos();
    if (!s) { setErro("Selecione o trecho que quer marcar."); return; }
    const r = adicionarMarca(marcas, { ...s, texto: etiqueta });
    if ("erro" in r) { setErro(r.erro); return; }
    setMarcas(r.marcas);
    setEtiqueta("");
    setErro(null);
    setAviso(`Trecho de ${segTexto(s.ini)} a ${segTexto(s.fim)} s marcado como “${etiqueta.trim()}”.`);
  }
  function ouvirMarca(m: Marca) {
    aplicarSel({ ini: m.ini, fim: m.fim });
    if (!audio) return;
    parar();
    const ctx = new AudioContext();
    const pedaco = recortar(audio.amostras, audio.taxa, m.ini, m.fim);
    const buf = ctx.createBuffer(1, Math.max(1, pedaco.length), audio.taxa);
    buf.getChannelData(0).set(pedaco);
    const fonte = ctx.createBufferSource();
    fonte.buffer = buf;
    fonte.connect(ctx.destination);
    fonte.onended = () => parar();
    fonte.start();
    som.current = { ctx, fonte };
    setTocando({ t0: ctx.currentTime, ini: m.ini, fim: m.fim });
  }
  function baixar(blob: Blob, nome: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function baixarPraat() {
    // o par WAV + TextGrid com o mesmo nome abre junto no Praat (Open › Read from file, os dois)
    const base = `gravacao-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
    baixar(new Blob([textGrid(duracao, marcas)], { type: "text/plain;charset=utf-8" }), `${base}.TextGrid`);
    window.setTimeout(() => baixar(gravacao.wav, `${base}.wav`), 300);
    setAviso("Baixados o WAV e o TextGrid com o mesmo nome: no Praat, abra os dois e selecione-os juntos (View & Edit).");
  }
  function desfazer() {
    const anterior = historico[historico.length - 1];
    if (!anterior) return;
    parar();
    setHistorico((h) => h.slice(0, -1));
    aoMudar(anterior);
  }

  return (
    <div className="mt-3" data-testid="vc2-editor">
      <canvas
        ref={canvas}
        className="block w-full cursor-crosshair touch-none rounded-lg ring-1 ring-inset ring-ink/10"
        style={{ height: ALTURA + (marcas.length ? FAIXA : 0) }}
        role="img"
        aria-label={`Forma de onda de ${segTexto(janela.ini)} a ${segTexto(janela.fim)} s${sel ? `; seleção de ${segTexto(sel.ini)} a ${segTexto(sel.fim)} s` : ""}. Arraste para selecionar ou use os campos de início e fim.`}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); arrasto.current = tempoDoEvento(e); setPonto(arrasto.current); aplicarSel(null); }}
        onPointerMove={(e) => { if (arrasto.current !== null) aplicarSel(normalizarSelecao(arrasto.current, tempoDoEvento(e), duracao)); }}
        onPointerUp={() => { arrasto.current = null; }}
        data-testid="vc2-editor-onda"
      />
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor={`${id}-ini`} className="text-xs">Seleção: início (s)</Label>
          <Input id={`${id}-ini`} className="mt-1 h-9 w-24" inputMode="decimal" value={campos.ini}
            onChange={(e) => setCampos((c) => ({ ...c, ini: e.target.value }))}
            onBlur={() => setSel(selecaoDosCampos())} data-testid="vc2-recorte-ini" />
        </div>
        <div>
          <Label htmlFor={`${id}-fim`} className="text-xs">fim (s)</Label>
          <Input id={`${id}-fim`} className="mt-1 h-9 w-24" inputMode="decimal" value={campos.fim}
            onChange={(e) => setCampos((c) => ({ ...c, fim: e.target.value }))}
            onBlur={() => setSel(selecaoDosCampos())} data-testid="vc2-recorte-fim" />
        </div>
        {tocando ? (
          <Button type="button" size="sm" variant="secondary" onClick={parar}><Square className="h-4 w-4" aria-hidden /> Parar</Button>
        ) : (
          <Button type="button" size="sm" variant="secondary" onClick={ouvir} disabled={!audio} data-testid="vc2-editor-ouvir">
            <Play className="h-4 w-4" aria-hidden /> {sel ? "Ouvir seleção" : "Ouvir"}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" aria-label="Ampliar" title="Ampliar (na seleção, se houver)"
          onClick={() => setJanela(sel ?? zoom(janela, 0.5, (janela.ini + janela.fim) / 2, duracao))} disabled={!audio} data-testid="vc2-editor-zoom">
          <ZoomIn className="h-4 w-4" aria-hidden />
        </Button>
        <Button type="button" size="sm" variant="ghost" aria-label="Reduzir" title="Reduzir"
          onClick={() => setJanela(zoom(janela, 2, (janela.ini + janela.fim) / 2, duracao))} disabled={!audio}>
          <ZoomOut className="h-4 w-4" aria-hidden />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setJanela({ ini: 0, fim: duracao })} disabled={!audio}>Ver tudo</Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={manterSelecao} disabled={!audio} data-testid="vc2-recortar">
          <Scissors className="h-4 w-4" aria-hidden /> Manter só a seleção
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={apagarSelecao} disabled={!audio} data-testid="vc2-editor-apagar">
          <Trash2 className="h-4 w-4" aria-hidden /> Apagar a seleção
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={copiar} disabled={!audio} data-testid="vc2-editor-copiar">
          <Copy className="h-4 w-4" aria-hidden /> Copiar
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={colar} disabled={!audio || !copiado} data-testid="vc2-editor-colar"
          title={sel ? "Substitui a seleção pelo trecho copiado" : "Cola no ponto clicado (ou no fim)"}>
          <ClipboardPaste className="h-4 w-4" aria-hidden /> {sel ? "Colar no lugar" : "Colar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={desfazer} disabled={!historico.length} data-testid="vc2-editor-desfazer">
          <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2" data-testid="vc2-marcas">
        <div>
          <Label htmlFor={`${id}-etq`} className="text-xs">Etiqueta do trecho</Label>
          <Input id={`${id}-etq`} className="mt-1 h-9 w-40" maxLength={40} value={etiqueta} placeholder="ex.: pa, frase 1"
            onChange={(e) => setEtiqueta(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); marcar(); } }}
            data-testid="vc2-marca-texto" />
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={marcar} disabled={!audio} data-testid="vc2-marcar">
          <Tag className="h-4 w-4" aria-hidden /> Marcar seleção
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={baixarPraat} disabled={!audio} data-testid="vc2-baixar-praat"
          title="Baixa a gravação (WAV) e as marcações (TextGrid) para abrir no Praat">
          <Download className="h-4 w-4" aria-hidden /> WAV + TextGrid (Praat)
        </Button>
      </div>
      {marcas.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Trechos marcados">
          {marcas.map((m) => (
            <li key={`${m.ini}-${m.fim}`} className="inline-flex items-center rounded-lg text-sm ring-1 ring-inset ring-[#E8B84A]/50">
              <button type="button" onClick={() => ouvirMarca(m)} className="min-h-[36px] rounded-l-lg px-2.5 text-ink hover:bg-canvas-overlay/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={`Ouvir ${m.texto}, de ${segTexto(m.ini)} a ${segTexto(m.fim)} s`}>
                {m.texto} <span className="text-data text-xs text-ink-muted">{segTexto(m.ini)}–{segTexto(m.fim)} s</span>
              </button>
              <button type="button" onClick={() => setMarcas((ms) => ms.filter((x) => x !== m))}
                className="flex min-h-[36px] min-w-[32px] items-center justify-center rounded-r-lg text-ink-muted hover:text-signal-err focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={`Remover a marca ${m.texto}`}>
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1 text-xs text-ink-faint">
        Arraste sobre a onda para selecionar; um clique marca onde colar. As marcações valem para a gravação atual (editar a gravação as apaga). Para a análise, deixe só o trecho estável da vogal (sem o início e o fim).
      </p>
      {aviso && !erro ? <p className="mt-1 text-xs text-ink-muted" role="status" data-testid="vc2-editor-aviso">{aviso}</p> : null}
      {erro ? <p className="mt-2 text-sm text-signal-err" role="alert">{erro}</p> : null}
    </div>
  );
}
