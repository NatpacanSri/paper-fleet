import { describe, expect, it } from "vitest";
import {
  buildPlayerSnapshot,
  chooseBotOrders,
  createGameRoom,
  resolveRound,
} from "../src/index";
import type {
  Coordinate,
  FireOrder,
  PlayerSecretState,
  Seat,
} from "../src/index";

function oneShipState(coordinate: Coordinate): PlayerSecretState {
  return {
    terrain: [
      "A1", "A2", "A3", "A4", "B1", "B2",
      "E5", "E6", "E7", "F5", "F6", "F7",
    ],
    forts: [],
    ships: [{ id: `ship-${coordinate}`, coordinates: [coordinate], hits: [] }],
    reserveAmmo: 0,
  };
}

function twoCellShipState(coordinates: [Coordinate, Coordinate]): PlayerSecretState {
  return {
    terrain: [
      "A1", "A2", "A3", "A4", "B1", "B2",
      "E5", "E6", "E7", "F5", "F6", "F7",
    ],
    forts: [{ id: "fort-1", coordinate: "B1", destroyed: false }],
    ships: [{ id: `ship-${coordinates.join("-")}`, coordinates, hits: [] }],
    reserveAmmo: 0,
  };
}

const human = (id: string, name: string): Seat => ({
  id,
  name,
  kind: "HUMAN",
  connected: true,
  ready: true,
  eliminated: false,
});

describe("round resolution", () => {
  it("defaults rooms to a 20 round limit", () => {
    const room = createGameRoom("LIMIT1", human("p1", "หนึ่ง"));

    expect(room.settings.maxRounds).toBe(20);
  });

  it("ends at the configured round limit, scores players, and keeps reveal history", () => {
    const room = createGameRoom("LIMIT2", human("p1", "หนึ่ง"));
    const playerOne = room.players.p1!;
    room.phase = "REVEAL";
    room.settings.maxRounds = 1;
    playerOne.secret = twoCellShipState(["C3", "C4"]);
    room.players.p2 = {
      seat: human("p2", "สอง"),
      secret: twoCellShipState(["D4", "D5"]),
      intel: [],
      orders: [],
      sealed: true,
    };
    playerOne.orders = [
      { id: "hit", attackerId: "p1", targetId: "p2", coordinate: "D4" },
    ];
    room.players.p2.orders = [
      { id: "miss", attackerId: "p2", targetId: "p1", coordinate: "A8" },
    ];
    playerOne.sealed = true;

    const reveal = resolveRound(room);
    const snapshot = buildPlayerSnapshot(room, "p1");

    expect(room.phase).toBe("FINISHED");
    expect((room as any).finishReason).toBe("ROUND_LIMIT");
    expect(room.winnerId).toBe("p1");
    expect((room as any).scores).toEqual([
      expect.objectContaining({
        playerId: "p1",
        remainingShipCells: 2,
        remainingForts: 1,
        hits: 1,
        misses: 0,
      }),
      expect.objectContaining({
        playerId: "p2",
        remainingShipCells: 1,
        remainingForts: 1,
        hits: 0,
        misses: 1,
      }),
    ]);
    expect((room as any).history).toEqual([
      expect.objectContaining({ round: 1, orderId: "hit", result: "HIT" }),
      expect.objectContaining({ round: 1, orderId: "miss", result: "WATER" }),
    ]);
    expect((snapshot.public as any).finishReason).toBe("ROUND_LIMIT");
    expect((snapshot.public as any).settings.maxRounds).toBe(1);
    expect((snapshot.public as any).scores[0].playerId).toBe("p1");
    expect((snapshot as any).history).toHaveLength(reveal.length);
  });

  it("resolves every sealed order even when an attacker is eliminated earlier in the reveal", () => {
    const room = createGameRoom("PAPER1", human("p1", "หนึ่ง"));
    const playerOne = room.players.p1!;
    room.phase = "REVEAL";
    playerOne.secret = oneShipState("C3");
    room.players.p2 = {
      seat: human("p2", "สอง"),
      secret: oneShipState("D4"),
      intel: [],
      orders: [],
      sealed: true,
    };
    playerOne.orders = [
      { id: "o1", attackerId: "p1", targetId: "p2", coordinate: "D4" },
    ];
    room.players.p2.orders = [
      { id: "o2", attackerId: "p2", targetId: "p1", coordinate: "C3" },
    ];
    playerOne.sealed = true;

    const reveal = resolveRound(room);

    expect(reveal).toHaveLength(2);
    expect(reveal.map((entry) => entry.result)).toEqual(["SUNK", "SUNK"]);
    expect(playerOne.seat.eliminated).toBe(true);
    expect(room.players.p2.seat.eliminated).toBe(true);
  });

  it("stores permanent intel only for the attacker and only for hits", () => {
    const room = createGameRoom("PAPER2", human("p1", "หนึ่ง"));
    const playerOne = room.players.p1!;
    room.phase = "REVEAL";
    playerOne.secret = oneShipState("C3");
    room.players.p2 = {
      seat: human("p2", "สอง"),
      secret: oneShipState("D4"),
      intel: [],
      orders: [],
      sealed: true,
    };
    playerOne.orders = [
      { id: "hit", attackerId: "p1", targetId: "p2", coordinate: "D4" },
      { id: "miss", attackerId: "p1", targetId: "p2", coordinate: "A8" },
    ];
    playerOne.sealed = true;

    resolveRound(room);

    expect(playerOne.intel).toEqual([
      { targetId: "p2", coordinate: "D4", result: "SUNK", round: 1 },
    ]);
    expect(room.players.p2.intel).toEqual([]);
  });
});

describe("privacy filtering", () => {
  it("never includes another player's secret board or orders", () => {
    const room = createGameRoom("PAPER3", human("p1", "หนึ่ง"));
    room.players.p1!.secret = oneShipState("C3");
    room.players.p2 = {
      seat: human("p2", "สอง"),
      secret: oneShipState("D4"),
      intel: [],
      orders: [
        { id: "hidden", attackerId: "p2", targetId: "p1", coordinate: "C3" },
      ],
      sealed: false,
    };

    const snapshot = buildPlayerSnapshot(room, "p1");
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.player.secret.ships[0]?.coordinates).toEqual(["C3"]);
    expect(serialized).not.toContain("D4");
    expect(serialized).not.toContain("hidden");
  });

  it("publishes readiness status without exposing another player's orders", () => {
    const room = createGameRoom("PAPER4", human("p1", "หนึ่ง"));
    room.phase = "PLANNING";
    room.players.p2 = {
      seat: human("p2", "สอง"),
      secret: oneShipState("D4"),
      intel: [],
      orders: [
        { id: "hidden", attackerId: "p2", targetId: "p1", coordinate: "C3" },
      ],
      sealed: true,
    };

    const snapshot = buildPlayerSnapshot(room, "p1");

    expect(snapshot.public.seats.find((seat) => seat.id === "p2")?.sealed).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("hidden");
  });

  it("keeps the completed reveal available during the next planning round", () => {
    const room = createGameRoom("PAPER5", human("p1", "หนึ่ง"));
    room.reveal = [{
      orderId: "old",
      attackerId: "p1",
      targetId: "p2",
      coordinate: "A1",
      result: "WATER",
    }];
    room.previousReveal = structuredClone(room.reveal);
    room.reveal = [];

    const snapshot = buildPlayerSnapshot(room, "p1");

    expect(snapshot.previousReveal).toEqual([
      expect.objectContaining({ orderId: "old", coordinate: "A1" }),
    ]);
  });
});

describe("bot orders", () => {
  it.each(["EASY", "NORMAL", "HARD"] as const)(
    "%s distributes every shot fairly across living opponents",
    (difficulty) => {
      const orders = chooseBotOrders({
        attackerId: "bot",
        difficulty,
        firepower: 7,
        opponentIds: ["p1", "p2", "p3"],
        intel: [],
        random: () => 0.25,
      });

      const counts = ["p1", "p2", "p3"].map(
        (id) => orders.filter((order) => order.targetId === id).length,
      );
      expect(orders).toHaveLength(7);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    },
  );

  it("normal bot follows an adjacent cell after its own hit", () => {
    const orders = chooseBotOrders({
      attackerId: "bot",
      difficulty: "NORMAL",
      firepower: 1,
      opponentIds: ["p1"],
      intel: [{ targetId: "p1", coordinate: "C3", result: "HIT", round: 1 }],
      random: () => 0,
    });

    expect(["B3", "D3", "C2", "C4"]).toContain(orders[0]?.coordinate);
  });

  it("returns serializable fire orders", () => {
    const orders: FireOrder[] = chooseBotOrders({
      attackerId: "bot",
      difficulty: "EASY",
      firepower: 2,
      opponentIds: ["p1"],
      intel: [],
      random: () => 0.5,
    });

    expect(() => JSON.stringify(orders)).not.toThrow();
  });
});
