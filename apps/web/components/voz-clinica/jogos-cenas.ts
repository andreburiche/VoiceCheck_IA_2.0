/**
 * VoiceCheck IA 2.0 — cenários e personagens dos jogos de percurso (Altitude e Trilha),
 * desenhados em canvas: cada variação tem o seu, como os vários jogos do VoxGames.
 * Só desenho; a lógica do jogo fica em lib/voz-clinica-jogos.ts.
 */

export type Cena = "ceu" | "mar" | "espaco";
export type Personagem = "balao" | "passaro" | "peixe" | "foguete";

export const TEMA: Record<string, { cena: Cena; personagem: Personagem; nome: string }> = {
  patamares: { cena: "ceu", personagem: "balao", nome: "Balão no céu" },
  "forte-fraco": { cena: "ceu", personagem: "passaro", nome: "Pássaro" },
  ondas: { cena: "mar", personagem: "peixe", nome: "Peixe nas ondas" },
  deslizes: { cena: "espaco", personagem: "foguete", nome: "Foguete" },
  escada: { cena: "ceu", personagem: "balao", nome: "Balão na escada" },
  sirene: { cena: "mar", personagem: "peixe", nome: "Peixe" },
  pulsos: { cena: "espaco", personagem: "foguete", nome: "Foguete em pulsos" },
  saltos: { cena: "mar", personagem: "peixe", nome: "Peixe saltando" },
  entonacao: { cena: "ceu", personagem: "passaro", nome: "Pássaro cantando" },
};

const CORES = {
  ceu: { topo: "#12324F", base: "#1E5B7A", faixa: "rgba(255,255,255,0.16)", borda: "rgba(255,255,255,0.6)" },
  mar: { topo: "#0B3B4A", base: "#062330", faixa: "rgba(32,217,210,0.18)", borda: "rgba(32,217,210,0.7)" },
  espaco: { topo: "#070B14", base: "#111A33", faixa: "rgba(167,139,250,0.18)", borda: "rgba(167,139,250,0.7)" },
} as const;

export function coresDaCena(cena: Cena) {
  return CORES[cena];
}

/** Fundo com movimento lento (paralaxe pelo tempo `t`, em segundos). */
export function desenharFundo(g: CanvasRenderingContext2D, w: number, h: number, cena: Cena, t: number) {
  const c = CORES[cena];
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, c.topo);
  grad.addColorStop(1, c.base);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  if (cena === "ceu") {
    g.fillStyle = "rgba(255,255,255,0.10)";
    for (let i = 0; i < 5; i++) {
      const x = ((i * 0.27 * w - t * 18) % (w + 120) + w + 120) % (w + 120) - 60;
      const y = 24 + ((i * 53) % Math.max(40, h - 60));
      g.beginPath();
      g.ellipse(x, y, 34, 10, 0, 0, Math.PI * 2);
      g.ellipse(x + 22, y - 6, 22, 9, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else if (cena === "mar") {
    g.strokeStyle = "rgba(255,255,255,0.08)";
    g.lineWidth = 2;
    for (let k = 1; k <= 4; k++) {
      const yb = (h * k) / 5;
      g.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = yb + Math.sin(x / 40 + t * 1.5 + k) * 4;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  } else {
    for (let i = 0; i < 40; i++) {
      const x = ((((i * 97) % w) - t * (10 + (i % 3) * 8)) % w + w) % w;
      const y = (i * 61) % h;
      g.fillStyle = `rgba(255,255,255,${0.25 + (i % 4) * 0.15})`;
      g.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
    }
  }
}

/** Personagem no ponto (x, y); `feliz` quando está dentro da faixa-alvo. */
export function desenharPersonagem(g: CanvasRenderingContext2D, p: Personagem, x: number, y: number, feliz: boolean, t: number) {
  const cor = feliz ? "#20D9D2" : "#F8FAFC";
  g.save();
  g.translate(x, y);
  g.scale(1.5, 1.5);
  if (p === "balao") {
    g.strokeStyle = "rgba(248,250,252,0.7)";
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, 14); g.quadraticCurveTo(4, 24, 0, 34); g.stroke();
    g.fillStyle = cor;
    g.beginPath(); g.ellipse(0, 0, 12, 15, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(255,255,255,0.45)";
    g.beginPath(); g.ellipse(-4, -6, 3, 5, -0.4, 0, Math.PI * 2); g.fill();
  } else if (p === "passaro") {
    const asa = Math.sin(t * 12) * 8;
    g.fillStyle = cor;
    g.beginPath(); g.ellipse(0, 0, 13, 8, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(-2, -2); g.lineTo(-10, -10 - asa); g.lineTo(6, -2); g.closePath(); g.fill();
    g.fillStyle = "#E8B84A";
    g.beginPath(); g.moveTo(12, -1); g.lineTo(19, 1); g.lineTo(12, 3); g.closePath(); g.fill();
    g.fillStyle = "#070B14";
    g.beginPath(); g.arc(7, -2, 1.6, 0, Math.PI * 2); g.fill();
  } else if (p === "peixe") {
    const cauda = Math.sin(t * 10) * 4;
    g.fillStyle = cor;
    g.beginPath(); g.ellipse(0, 0, 14, 8, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(-12, 0); g.lineTo(-22, -8 + cauda); g.lineTo(-22, 8 + cauda); g.closePath(); g.fill();
    g.fillStyle = "#070B14";
    g.beginPath(); g.arc(7, -2, 1.8, 0, Math.PI * 2); g.fill();
  } else {
    g.fillStyle = "#E8B84A";
    const chama = 6 + Math.abs(Math.sin(t * 20)) * 6;
    g.beginPath(); g.moveTo(-12, -4); g.lineTo(-12 - chama, 0); g.lineTo(-12, 4); g.closePath(); g.fill();
    g.fillStyle = cor;
    g.beginPath(); g.moveTo(16, 0); g.lineTo(4, -8); g.lineTo(-12, -6); g.lineTo(-12, 6); g.lineTo(4, 8); g.closePath(); g.fill();
    g.fillStyle = "#070B14";
    g.beginPath(); g.arc(3, 0, 2.5, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}
