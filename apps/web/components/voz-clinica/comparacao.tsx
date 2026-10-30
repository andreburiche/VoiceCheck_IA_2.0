"use client";

import { Download } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { baixarAudioAvaliacao, fixoBR, listarAvaliacoes, type AnaliseAcustica, type Avaliacao } from "@/lib/voz-clinica-api";
import { acusticasEmOrdem, compararAcusticas, resumoComparacao, type Mudanca } from "@/lib/voz-clinica-comparacao";

const PAINEL = "panel-glass rounded-2xl p-4 md:p-5";
const SELECT =
  "h-10 w-full rounded-lg border border-line bg-canvas-raised px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

const COR: Record<Mudanca, string> = {
  melhorou: "text-signal-ok",
  piorou: "text-signal-err",
  "sem mudança": "text-ink-muted",
  mudou: "text-ink",
  "sem dado": "text-ink-faint",
};

function dataHora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function rotuloSessao(a: Avaliacao, n: number): string {
  const r = a.resultado as AnaliseAcustica;
  return `Sessão ${n} · ${dataHora(a.criado_em)} · F0 ${fixoBR(r.f0?.media_hz, 0)} Hz${a.audio ? "" : " · sem gravação"}`;
}

/** Player de uma sessão: busca o WAV guardado só quando a sessão é escolhida. */
function Gravacao({ avaliacao, rotulo }: { avaliacao: Avaliacao; rotulo: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    setErro(null);
    if (!avaliacao.audio) return;
    let ativo = true;
    let criada: string | null = null;
    baixarAudioAvaliacao(avaliacao.id)
      .then((blob) => {
        if (!ativo) return;
        criada = URL.createObjectURL(blob);
        setUrl(criada);
      })
      .catch((e) => ativo && setErro(friendlyError(e, "Não foi possível carregar a gravação.")));
    return () => {
      ativo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [avaliacao.id, avaliacao.audio]);

  if (!avaliacao.audio) {
    return <p className="mt-2 text-xs text-ink-faint">Sessão salva sem gravação guardada.</p>;
  }
  if (erro) return <p className="mt-2 text-xs text-signal-err" role="alert">{erro}</p>;
  if (!url) return <p className="mt-2 text-xs text-ink-faint">Carregando a gravação…</p>;
  const arquivo = `voicecheck-${avaliacao.criado_em.slice(0, 16).replace(/[-:T]/g, "")}.wav`;
  return (
    <div className="mt-2 space-y-1">
      <audio className="w-full" src={url} controls aria-label={`Ouvir a gravação de ${rotulo}`} data-testid="vc2-comparar-audio" />
      <a href={url} download={arquivo} className="inline-flex items-center gap-1 text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline">
        <Download className="h-3.5 w-3.5" aria-hidden /> Baixar WAV
      </a>
    </div>
  );
}

/** Antes/depois: duas análises acústicas do paciente lado a lado, para ouvir e comparar as medidas. */
export function ComparacaoAntesDepois({ paciente, versao }: { paciente: string; versao: number }) {
  const [itens, setItens] = useState<Avaliacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [idAntes, setIdAntes] = useState<string | null>(null);
  const [idDepois, setIdDepois] = useState<string | null>(null);
  const idA = useId();
  const idD = useId();
  const pedido = useRef(0);

  useEffect(() => {
    if (!paciente) return;
    const meu = ++pedido.current;
    setErro(null);
    listarAvaliacoes(paciente)
      .then((r) => {
        if (meu !== pedido.current) return;
        const lista = acusticasEmOrdem(r.items);
        setItens(lista);
        // padrão: a primeira sessão contra a mais recente; mantém a escolha se ela ainda existe
        setIdAntes((atual) => (atual && lista.some((a) => a.id === atual) ? atual : lista[0]?.id ?? null));
        setIdDepois((atual) => (atual && lista.some((a) => a.id === atual) ? atual : lista.at(-1)?.id ?? null));
      })
      .catch((e) => meu === pedido.current && setErro(friendlyError(e, "Não foi possível carregar as sessões.")));
  }, [paciente, versao]);
  useEffect(() => {
    setItens(null);
    setIdAntes(null);
    setIdDepois(null);
  }, [paciente]);

  const antes = itens?.find((a) => a.id === idAntes) ?? null;
  const depois = itens?.find((a) => a.id === idDepois) ?? null;
  const linhas = useMemo(
    () => (antes && depois ? compararAcusticas(antes.resultado as AnaliseAcustica, depois.resultado as AnaliseAcustica) : []),
    [antes, depois],
  );

  return (
    <section className={PAINEL} aria-labelledby="vc2-comparar" data-testid="vc2-comparar">
      <h2 id="vc2-comparar" className="font-display text-lg font-semibold text-ink">Comparar antes e depois</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-muted">
        Escolha duas análises acústicas do paciente para ouvir as gravações e ver o que mudou. Compare gravações feitas com o mesmo microfone, à mesma distância e com a mesma vogal.
      </p>

      {!paciente ? (
        <p className="mt-4 text-sm text-ink-muted">Preencha o nome do paciente para ver as sessões.</p>
      ) : erro ? (
        <p className="mt-4 text-sm text-signal-err" role="alert">{erro}</p>
      ) : itens === null ? (
        <p className="mt-4 text-sm text-ink-muted">Carregando…</p>
      ) : itens.length < 2 ? (
        <p className="mt-4 rounded-xl border border-dashed border-ink/15 px-4 py-4 text-sm text-ink-muted" data-testid="vc2-comparar-vazio">
          {itens.length === 0 ? "Nenhuma análise acústica salva ainda." : "Só há uma análise acústica salva."} Grave e analise uma vogal na aba Avaliação; a partir da segunda sessão dá para comparar.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[
              { id: idA, rotulo: "Antes", valor: idAntes, mudar: setIdAntes, sessao: antes, teste: "vc2-comparar-antes" },
              { id: idD, rotulo: "Depois", valor: idDepois, mudar: setIdDepois, sessao: depois, teste: "vc2-comparar-depois" },
            ].map((lado) => (
              <div key={lado.rotulo} className="rounded-xl p-3 ring-1 ring-inset ring-ink/10">
                <label htmlFor={lado.id} className="text-sm font-medium text-ink">{lado.rotulo}</label>
                <select
                  id={lado.id}
                  className={cn(SELECT, "mt-1")}
                  value={lado.valor ?? ""}
                  onChange={(e) => lado.mudar(e.target.value)}
                  data-testid={lado.teste}
                >
                  {itens.map((a, i) => (
                    <option key={a.id} value={a.id}>{rotuloSessao(a, i + 1)}</option>
                  ))}
                </select>
                {lado.sessao ? <Gravacao avaliacao={lado.sessao} rotulo={`${lado.rotulo.toLowerCase()} (${dataHora(lado.sessao.criado_em)})`} /> : null}
              </div>
            ))}
          </div>

          {idAntes === idDepois ? (
            <p className="mt-4 text-sm text-ink-muted">Escolha duas sessões diferentes.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <p className="text-sm text-ink" role="status" data-testid="vc2-comparar-resumo">{resumoComparacao(linhas)}</p>
              <table className="mt-2 w-full min-w-[32rem] text-sm" data-testid="vc2-comparar-tabela">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-faint">
                    <th className="py-2 font-medium">Medida</th>
                    <th className="py-2 text-right font-medium">Antes</th>
                    <th className="py-2 text-right font-medium">Depois</th>
                    <th className="py-2 text-right font-medium">Diferença</th>
                    <th className="py-2 pl-4 font-medium">Mudança</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.medida} className="border-b border-ink/[0.06]">
                      <td className="py-2 text-ink-muted">{l.medida}</td>
                      <td className="text-data py-2 text-right text-ink">{l.antes}</td>
                      <td className="text-data py-2 text-right text-ink">{l.depois}</td>
                      <td className="text-data py-2 text-right text-ink">{l.diferenca}</td>
                      <td className={cn("py-2 pl-4", COR[l.mudanca])}>{l.mudanca}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-ink-faint">
                &ldquo;Sem mudança&rdquo; = diferença menor que a variação comum entre gravações seguidas (ex.: 1 dB no HNR e no CPPS). F0 não tem melhor ou pior: depende do objetivo da terapia. Não é diagnóstico médico.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
