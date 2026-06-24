import { describe, expect, it } from "vitest";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  SHIP_LENGTHS,
  calculateFirepower,
  generateRandomPlacement,
  resolveShot,
  validateDistribution,
  validatePlacement,
} from "../src/index";
import type { PlayerSecretState } from "../src/index";
import type { Coordinate } from "../src/index";

const validTerrain: Coordinate[] = [
  "A1", "A2", "A3", "A4", "B1", "B2",
  "E5", "E6", "E7", "F5", "F6", "F7",
];

const validState: PlayerSecretState = {
  terrain: validTerrain,
  forts: [
    { id: "fort-1", coordinate: "A1", destroyed: false },
    { id: "fort-2", coordinate: "B2", destroyed: false },
    { id: "fort-3", coordinate: "F7", destroyed: false },
  ],
  ships: [
    { id: "ship-4", coordinates: ["C1", "C2", "C3", "C4"], hits: [] },
    { id: "ship-3", coordinates: ["D1", "D2", "D3"], hits: [] },
    { id: "ship-2", coordinates: ["E1", "E2"], hits: [] },
    { id: "ship-1a", coordinates: ["C8"], hits: [] },
    { id: "ship-1b", coordinates: ["F1"], hits: [] },
  ],
  reserveAmmo: 0,
};

describe("board rules", () => {
  it("uses an 8 by 6 board and the required fleet", () => {
    expect([BOARD_WIDTH, BOARD_HEIGHT]).toEqual([8, 6]);
    expect(SHIP_LENGTHS).toEqual([4, 3, 2, 1, 1]);
  });

  it("accepts twelve land cells split into at most two orthogonal islands", () => {
    expect(validatePlacement(validState)).toEqual({ valid: true, errors: [] });
  });

  it("rejects diagonal-only islands and overlapping pieces", () => {
    const invalid: PlayerSecretState = {
      ...validState,
      terrain: [
        "A1", "B2", "C3", "D4", "E5", "F6",
        "A8", "B7", "C6", "D5", "E4", "F3",
      ],
      forts: [
        { id: "fort-1", coordinate: "A1", destroyed: false },
        { id: "fort-2", coordinate: "B2", destroyed: false },
        { id: "fort-3", coordinate: "F3", destroyed: false },
      ],
      ships: [
        { id: "ship-4", coordinates: ["C1", "C2", "C3", "C4"], hits: [] },
        { id: "ship-3", coordinates: ["D1", "D2", "D3"], hits: [] },
        { id: "ship-2", coordinates: ["E1", "E2"], hits: [] },
        { id: "ship-1a", coordinates: ["C2"], hits: [] },
        { id: "ship-1b", coordinates: ["F1"], hits: [] },
      ],
    };

    const result = validatePlacement(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("terrain_islands");
    expect(result.errors).toContain("piece_overlap");
  });

  it("generates a complete placement that passes the same validator", () => {
    const generated = generateRandomPlacement(() => 0.42);
    expect(validatePlacement(generated)).toEqual({ valid: true, errors: [] });
  });
});

describe("combat rules", () => {
  it("calculates one base shot plus living forts and reserve ammunition", () => {
    expect(calculateFirepower(validState)).toBe(4);
    expect(
      calculateFirepower({
        ...validState,
        reserveAmmo: 3,
        forts: validState.forts.map((fort, index) => ({
          ...fort,
          destroyed: index === 0,
        })),
      }),
    ).toBe(6);
  });

  it("requires shot counts across living opponents to differ by at most one", () => {
    expect(validateDistribution(["p2", "p3", "p2"], ["p2", "p3"])).toBe(true);
    expect(validateDistribution(["p2", "p2", "p2"], ["p2", "p3"])).toBe(false);
  });

  it("salvages land, damages forts, sinks ships, and treats repeated ship hits as wrecks", () => {
    const land = structuredClone(validState);
    expect(resolveShot(land, "A2").result).toBe("LAND_SALVAGED");
    expect(land.reserveAmmo).toBe(1);

    const fort = structuredClone(validState);
    expect(resolveShot(fort, "A1").result).toBe("HIT");
    expect(fort.forts[0]?.destroyed).toBe(true);
    expect(resolveShot(fort, "A1").result).toBe("LAND_SALVAGED");

    const ship = structuredClone(validState);
    expect(resolveShot(ship, "C8").result).toBe("SUNK");
    expect(resolveShot(ship, "C8").result).toBe("WRECK");
  });
});
