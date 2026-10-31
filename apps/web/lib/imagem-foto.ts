/**
 * Prepara uma foto de pessoa para envio: reduz para no máximo `lado` px e regrava em JPEG.
 * Regravar pelo canvas também descarta os metadados (EXIF), inclusive a localização GPS
 * que celulares costumam gravar — a foto do paciente não leva onde foi tirada.
 */
export async function prepararFoto(arquivo: File, lado = 640, qualidade = 0.88): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) throw new Error("Envie uma imagem JPG, PNG ou WebP.");
  if (arquivo.size > 15 * 1024 * 1024) throw new Error("Imagem muito grande (máximo 15 MB).");
  const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => null);
  if (!bitmap) throw new Error("Não foi possível ler esta imagem.");
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não conseguiu preparar a imagem.");
  ctx.fillStyle = "#ffffff"; // PNG com transparência vira fundo branco no JPEG
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", qualidade));
  if (!blob) throw new Error("Não foi possível preparar a imagem.");
  return blob;
}

/** Iniciais para o avatar sem foto ("Ana Souza" → "AS"). */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  const a = partes[0]![0] ?? "";
  const b = partes.length > 1 ? partes[partes.length - 1]![0] ?? "" : "";
  return (a + b).toUpperCase();
}
