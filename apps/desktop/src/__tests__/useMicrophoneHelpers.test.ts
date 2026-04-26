import { describe, expect, it } from "vitest";
import { detectPermissionFromError, parsePermissionStatus } from "../hooks/useMicrophone";

describe("useMicrophone helpers", () => {
  it("parses known permission states", () => {
    expect(parsePermissionStatus("prompt")).toBe("prompt");
    expect(parsePermissionStatus("granted")).toBe("granted");
    expect(parsePermissionStatus("denied")).toBe("denied");
    expect(parsePermissionStatus("unknown-state")).toBe("unknown");
  });

  it("detects denied permission errors", () => {
    const deniedError = new DOMException("No mic", "NotAllowedError");
    expect(detectPermissionFromError(deniedError)).toBe("denied");
  });

  it("falls back to unknown on non-permission errors", () => {
    expect(detectPermissionFromError(new Error("boom"))).toBe("unknown");
  });
});
