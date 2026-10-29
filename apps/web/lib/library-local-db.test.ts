import { describe, expect, it } from "vitest";

import { createCollectionId } from "@/lib/library-local-db";

describe("library-local-db", () => {
  it("gera ids de coleção únicos", () => {
    const a = createCollectionId();
    const b = createCollectionId();
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });
});
