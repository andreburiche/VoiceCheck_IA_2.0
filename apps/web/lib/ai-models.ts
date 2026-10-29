/**
 * Classificação e verificação de modelos a partir do system/status real.
 * Não inventa download, instalação ou remoção de pesos.
 */

import type { SeparationModelInfo, SystemStatus } from "@/lib/api";

export type ModelBucket = "installed" | "available" | "incompatible";

export type IntegrityResult = {
  ok: boolean;
  checkedAt: string;
  modelCode: string;
  messages: string[];
};

export function packageStatusOf(m: SeparationModelInfo): ModelBucket {
  if (m.package_status === "installed" || m.package_status === "available" || m.package_status === "incompatible") {
    return m.package_status;
  }
  if (m.installed && m.selectable) return "installed";
  if (m.installed && !m.selectable) return "incompatible";
  return "available";
}

export function groupModels(models: SeparationModelInfo[]): Record<ModelBucket, SeparationModelInfo[]> {
  const out: Record<ModelBucket, SeparationModelInfo[]> = {
    installed: [],
    available: [],
    incompatible: [],
  };
  for (const m of models) {
    out[packageStatusOf(m)].push(m);
  }
  return out;
}

export function statusLabel(bucket: ModelBucket): string {
  if (bucket === "installed") return "Instalado";
  if (bucket === "incompatible") return "Incompatível";
  return "Disponível em pacote";
}

export function isBasicFourStem(m: SeparationModelInfo): boolean {
  return m.code === "htdemucs" || (m.tier === "basic" && m.stems.length === 4);
}

/**
 * Verificação de integridade local: catálogo + flags do runtime (sem inventar checksum de pesos).
 */
export function verifyModelIntegrity(
  status: SystemStatus | undefined,
  modelCode: string,
): IntegrityResult {
  const checkedAt = new Date().toISOString();
  const messages: string[] = [];
  if (!status) {
    return { ok: false, checkedAt, modelCode, messages: ["Status do sistema indisponível."] };
  }
  const m = status.models?.find((x) => x.code === modelCode);
  if (!m) {
    return {
      ok: false,
      checkedAt,
      modelCode,
      messages: ["Modelo ausente do catálogo do servidor — não prometa instalação."],
    };
  }
  if (m.installed) {
    messages.push(`Registro no banco: instalado${m.version ? ` · v${m.version}` : ""}.`);
  } else {
    messages.push("Não há registro habilitado deste modelo no banco (não instalado).");
  }
  if (m.selectable) {
    messages.push(`Selecionável para jobs · ${m.reason}`);
  } else {
    messages.push(`Não selecionável · ${m.reason}`);
  }
  if (status.using_contract_silence) {
    messages.push("Adapter contract ativo: stems de smoke (silêncio), não Demucs real.");
  } else {
    messages.push(`Adapter: ${status.separation_adapter}.`);
  }
  if (m.disk_bytes != null && m.disk_bytes > 0) {
    messages.push(`Cache local medido: ~${Math.round(m.disk_bytes / (1024 * 1024))} MB.`);
  } else if (m.installed) {
    messages.push("Pesos no cache Torch/Demucs não foram encontrados para medir (comum em Docker remoto).");
  }
  const ok = m.installed && m.selectable;
  if (ok) messages.push("Integridade do registro: OK para iniciar separação.");
  else messages.push("Integridade: incompleta ou incompatível neste runtime.");
  return { ok, checkedAt, modelCode, messages };
}

export const STEM_DIFF_PANEL = {
  title: "4, 6 ou mais fontes — o que muda?",
  points: [
    "4 fontes (Básico / HTDemucs): voz, bateria, baixo e outros. É o modelo instalado e suportado neste produto.",
    "2 fontes (Instrumental): voz vs resto. Só funciona se o pacote two-stems estiver instalado no worker.",
    "6+ fontes: piano, guitarra etc. Exigem modelo e VRAM maiores — listados só quando existirem no catálogo do servidor.",
    "Limite: Demucs separa aproximações. Guitarra/teclado isolados “perfeitos” não estão disponíveis no Básico de 4 stems.",
  ],
} as const;
