/** Converte erros técnicos (rede, timeout, HTTP) em frases que o usuário entende. */
export function friendlyError(err: unknown, fallback = "Algo deu errado. Tente de novo em instantes."): string {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!msg) return fallback;
  if (/Não foi possível falar com o servidor|demorou demais para responder/.test(msg)) return msg;
  if (/failed to fetch|networkerror|load failed|err_|network request failed|inacessível|sem resposta/i.test(msg)) {
    return "Não foi possível falar com o servidor. Verifique a conexão e tente de novo.";
  }
  if (/timeout|timed out|demorou/i.test(msg)) return "A operação demorou demais. Tente de novo.";
  if (/\b401\b|sessão expirada|not authenticated/i.test(msg)) return "Sua sessão expirou. Entre de novo para continuar.";
  if (/\b403\b|forbidden/i.test(msg)) return "Você não tem permissão para esta ação.";
  if (/\b404\b|not found|não encontrad/i.test(msg)) return "Não encontramos este item. Ele pode ter sido removido.";
  if (/decod|decode|encoding/i.test(msg)) return "Não foi possível ler este arquivo de áudio.";
  return msg;
}
