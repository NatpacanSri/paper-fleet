import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("typography system", () => {
  it("defines local handwriting and pixel families with swap fallbacks", () => {
    const css = readFileSync("src/styles.css", "utf8");

    expect(css).toContain('font-family: "Mali"');
    expect(css).toContain('font-family: "Sergamon"');
    expect(css.match(/font-display: swap/g)).toHaveLength(3);
    expect(css).toContain("--font-handwriting:");
    expect(css).toContain("--font-data:");
    expect(css).toContain('url("./assets/fonts/Mali-Regular.ttf")');
    expect(css).toContain('url("./assets/fonts/Sergamon.woff2")');
  });

  it("keeps Thai header labels readable while room codes and round numbers stay pixel", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const app = readFileSync("src/App.tsx", "utf8");

    expect(app).toContain('className="game-header-label"');
    expect(app).toContain('className="game-header-data"');
    expect(css).toContain(".game-header-label");
    expect(css).toContain("font-family: var(--font-body)");
    expect(css).toContain(".game-header-data");
    expect(css).toContain("font-family: var(--font-data)");
  });

  it("keeps Thai planning status copy readable and gives inputs a visible caret", () => {
    const css = readFileSync("src/styles.css", "utf8");

    expect(css).toContain("caret-color: var(--color-red)");
    expect(css).toMatch(/\.eyebrow \{[\s\S]*font-family: var\(--font-body\)/);
    expect(css).toMatch(/\.opponent-tabs b \{[\s\S]*font-family: var\(--font-body\)/);
    expect(css).toMatch(/\.planning-status-list span \{[\s\S]*font-family: var\(--font-body\)/);
  });
});
