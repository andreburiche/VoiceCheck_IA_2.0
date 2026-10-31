import { describe, expect, it } from "vitest";

import { resolverTema } from "@/lib/tema";
import { CHAVE_TEMA, SCRIPT_TEMA } from "@/lib/tema-script";

describe("tema", () => {
  it("resolve a preferência para o tema ativo", () => {
    expect(resolverTema("claro", false)).toBe("claro");
    expect(resolverTema("escuro", true)).toBe("escuro");
    expect(resolverTema("sistema", true)).toBe("claro");
    expect(resolverTema("sistema", false)).toBe("escuro");
  });

  it("o script do <head> lê a mesma chave salva", () => {
    expect(SCRIPT_TEMA.includes(`localStorage.getItem("${CHAVE_TEMA}")`)).toBe(true);
    expect(SCRIPT_TEMA.includes('dataset.theme=c?"light":"dark"')).toBe(true);
  });
});
