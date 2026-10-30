import { describe, expect, it } from "vitest";

import { descricaoDoQuadro, estimarFps, nomeArquivoQuadro, numeroDoQuadro, tempoDoQuadro } from "@/lib/voz-clinica-video";

describe("revisão de vídeo laríngeo", () => {
  it("estima os quadros por segundo pelos tempos apresentados", () => {
    const a30 = Array.from({ length: 20 }, (_, i) => i / 30);
    expect(estimarFps(a30)).toBe(30);
    // quadros pulados (intervalo duplo) não mudam a mediana; 25 fps reconhecido
    const a25 = [0, 0.04, 0.08, 0.16, 0.2, 0.24, 0.28, 0.32, 0.36];
    expect(estimarFps(a25)).toBe(25);
    expect(estimarFps([0, 0.033])).toBeNull();
  });

  it("anda um quadro de cada vez, sem sair do vídeo", () => {
    const fps = 30;
    const t1 = tempoDoQuadro(0, fps, 1, 10);
    expect(numeroDoQuadro(t1, fps)).toBe(2);
    expect(numeroDoQuadro(tempoDoQuadro(t1, fps, 1, 10), fps)).toBe(3);
    expect(numeroDoQuadro(tempoDoQuadro(t1, fps, -1, 10), fps)).toBe(1);
    expect(numeroDoQuadro(tempoDoQuadro(0, fps, -1, 10), fps)).toBe(1); // não vai antes do início
    expect(tempoDoQuadro(9.99, fps, 1, 10)).toBeLessThan(10); // nem depois do fim
  });

  it("descreve e nomeia o quadro capturado", () => {
    expect(descricaoDoQuadro(1.2345, 30, "Videolaringoscopia")).toBe("Quadro 38 (1,235 s) de Videolaringoscopia");
    expect(descricaoDoQuadro(1, 30, "x".repeat(300)).length).toBe(200);
    expect(nomeArquivoQuadro(1.2345, 30)).toBe("quadro-38-1235ms.png");
  });
});
