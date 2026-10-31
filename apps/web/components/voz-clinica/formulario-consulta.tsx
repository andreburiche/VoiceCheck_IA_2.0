"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import {
  DURACOES,
  ROTULO_MODALIDADE,
  ROTULO_SITUACAO,
  ROTULO_TIPO_CONSULTA,
  camposLocais,
  chaveDia,
  isoLocal,
  somarDias,
} from "@/lib/voz-clinica-agenda";
import {
  agendarConsulta,
  atualizarConsulta,
  type Consulta,
  type EntradaConsulta,
  type ModalidadeConsulta,
  type PacienteResumo,
  type SituacaoConsulta,
  type TipoConsulta,
} from "@/lib/voz-clinica-api";

const CAMPO =
  "mt-1 h-10 w-full rounded-lg border border-line bg-canvas-overlay/60 px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

type Props = {
  /** Consulta a editar; sem ela, cria uma nova. */
  consulta?: Consulta | null;
  /** Paciente já escolhido (ficha do paciente) — o campo fica travado. */
  paciente?: string;
  /** Sugestões de paciente (lista da avaliação clínica). */
  pacientes?: PacienteResumo[];
  /** Data/hora sugeridas para uma nova consulta (clique num dia da agenda). */
  sugestao?: { data: string; hora: string };
  onClose: () => void;
  onSalvo: (c: Consulta) => void;
};

/** Agendar ou remarcar uma consulta. Horário ocupado: a API avisa e o profissional pode encaixar. */
export function FormularioConsulta({ consulta, paciente, pacientes = [], sugestao, onClose, onSalvo }: Props) {
  const id = useId();
  const inicial = consulta ? camposLocais(consulta.inicio) : sugestao ?? { data: chaveDia(somarDias(new Date(), 1)), hora: "09:00" };
  const [nome, setNome] = useState(consulta?.paciente ?? paciente ?? "");
  const [data, setData] = useState(inicial.data);
  const [hora, setHora] = useState(inicial.hora);
  const [duracao, setDuracao] = useState(consulta?.duracao_min ?? 50);
  const [tipo, setTipo] = useState<TipoConsulta>(consulta?.tipo ?? "terapia");
  const [modalidade, setModalidade] = useState<ModalidadeConsulta>(consulta?.modalidade ?? "presencial");
  const [situacao, setSituacao] = useState<SituacaoConsulta>(consulta?.situacao ?? "agendada");
  const [obs, setObs] = useState(consulta?.observacoes ?? "");
  const [conflito, setConflito] = useState<string | null>(null);
  const [encaixar, setEncaixar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const n = nome.split(/\s+/).filter(Boolean).join(" ");
    if (!n) return setErro("Informe o paciente (nome ou código).");
    const inicio = isoLocal(data, hora);
    if (!inicio) return setErro("Confira a data e o horário.");
    const entrada: EntradaConsulta = {
      paciente: n, inicio, duracao_min: duracao, tipo, modalidade, situacao,
      observacoes: obs.trim() || null, permitir_conflito: encaixar,
    };
    setSalvando(true);
    try {
      const salvo = consulta ? await atualizarConsulta(consulta.id, entrada) : await agendarConsulta(entrada);
      onSalvo(salvo);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 409) setConflito((err as Error).message);
      else setErro((err as Error).message || "Não foi possível salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy={`${id}-titulo`} className="max-w-lg">
      <form onSubmit={salvar} className="space-y-4 p-5" noValidate data-testid="vc2-form-consulta">
        <h2 id={`${id}-titulo`} className="font-display text-lg font-semibold text-ink">
          {consulta ? "Editar consulta" : "Agendar consulta"}
        </h2>

        <div>
          <Label htmlFor={`${id}-paciente`}>Paciente</Label>
          <Input id={`${id}-paciente`} className="mt-1" value={nome} maxLength={120} autoComplete="off"
            list={`${id}-lista`} readOnly={!!paciente && !consulta} onChange={(e) => setNome(e.target.value)}
            placeholder="Nome ou código" data-testid="vc2-consulta-paciente" />
          <datalist id={`${id}-lista`}>
            {pacientes.map((p) => <option key={p.paciente} value={p.paciente} />)}
          </datalist>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor={`${id}-data`}>Data</Label>
            <Input id={`${id}-data`} type="date" className="mt-1" value={data} onChange={(e) => { setData(e.target.value); setConflito(null); }}
              required data-testid="vc2-consulta-data" />
          </div>
          <div>
            <Label htmlFor={`${id}-hora`}>Horário</Label>
            <Input id={`${id}-hora`} type="time" step={300} className="mt-1" value={hora}
              onChange={(e) => { setHora(e.target.value); setConflito(null); }} required data-testid="vc2-consulta-hora" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor={`${id}-duracao`}>Duração</Label>
            <select id={`${id}-duracao`} className={CAMPO} value={duracao}
              onChange={(e) => { setDuracao(Number(e.target.value)); setConflito(null); }}>
              {[...new Set([...DURACOES, duracao])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>{d} min</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor={`${id}-tipo`}>Tipo</Label>
            <select id={`${id}-tipo`} className={CAMPO} value={tipo} onChange={(e) => setTipo(e.target.value as TipoConsulta)}>
              {Object.entries(ROTULO_TIPO_CONSULTA).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor={`${id}-modalidade`}>Modalidade</Label>
            <select id={`${id}-modalidade`} className={CAMPO} value={modalidade}
              onChange={(e) => setModalidade(e.target.value as ModalidadeConsulta)}>
              {Object.entries(ROTULO_MODALIDADE).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor={`${id}-situacao`}>Situação</Label>
            <select id={`${id}-situacao`} className={CAMPO} value={situacao}
              onChange={(e) => setSituacao(e.target.value as SituacaoConsulta)}>
              {Object.entries(ROTULO_SITUACAO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </div>
        </div>

        <div>
          <Label htmlFor={`${id}-obs`}>Observações</Label>
          <textarea id={`${id}-obs`} value={obs} maxLength={2000} rows={3} onChange={(e) => setObs(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-canvas-overlay/60 px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            placeholder="Ex.: trazer exame de laringoscopia" />
          <p className="mt-1 text-xs text-ink-faint">Anote só o necessário para a agenda; o registro clínico fica na avaliação.</p>
        </div>

        {conflito ? (
          <div role="alert" className="rounded-lg bg-signal-warn/10 p-3 text-sm text-ink ring-1 ring-inset ring-signal-warn/40">
            <p>{conflito}</p>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={encaixar} onChange={(e) => setEncaixar(e.target.checked)}
                data-testid="vc2-consulta-encaixar" />
              Agendar mesmo assim (encaixe)
            </label>
          </div>
        ) : null}
        {erro ? <p role="alert" className="text-sm text-signal-err">{erro}</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvando || (!!conflito && !encaixar)} data-testid="vc2-consulta-salvar">
            {salvando ? "Salvando…" : consulta ? "Salvar alterações" : "Agendar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
