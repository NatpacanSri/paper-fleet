import { describe, expect, it } from "vitest";
import { resolveSocketUrl } from "../src/socket";

describe("socket URL", () => {
  it("uses the current origin when no server URL is configured", () => {
    expect(resolveSocketUrl(undefined, "https://paper-fleet.onrender.com")).toBe(
      "https://paper-fleet.onrender.com",
    );
  });

  it("uses the configured server URL when provided", () => {
    expect(resolveSocketUrl("https://api.example.test", "https://paper-fleet.onrender.com")).toBe(
      "https://api.example.test",
    );
  });
});
