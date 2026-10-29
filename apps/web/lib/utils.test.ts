import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("mescla classes do Tailwind", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
