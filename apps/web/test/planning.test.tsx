import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameSnapshot, Session } from "../src/types";

const { emitAck } = vi.hoisted(() => ({
  emitAck: vi.fn(async (event: string, payload: { orders?: unknown[] }) => {
    if (event === "orders:seal") return { ok: false, error: "orders_distribution" };
    return {
      ok: true,
      orders: (payload.orders ?? []).map((order, index) => ({
        ...(order as object),
        id: `server-order-${index}`,
        attackerId: "p1",
      })),
    };
  }),
}));

vi.mock("../src/socket", () => ({
  emitAck,
  socket: { on: vi.fn(), off: vi.fn(), connect: vi.fn() },
}));

import { PlanningScreen } from "../src/App";

afterEach(() => {
  cleanup();
  emitAck.mockClear();
});

const session: Session = {
  roomCode: "ABC123",
  playerId: "p1",
  token: "token",
  isHost: true,
};

describe("PlanningScreen", () => {
  it("uses พร้อมโจมตี and lets a selected coordinate be toggled off", async () => {
    const user = userEvent.setup();
    const snapshot = makeSnapshot(1, [{
      id: "p1-1-0",
      attackerId: "p1",
      targetId: "p2",
      coordinate: "A1",
    }]);
    render(
      <PlanningScreen
        session={session}
        snapshot={snapshot}
        setSnapshot={() => {}}
        setError={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "พร้อมโจมตี" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ช่อง A1" }));

    expect(emitAck).toHaveBeenCalledWith(
      "orders:update",
      expect.objectContaining({ orders: [] }),
    );
  });

  it("keeps the attack button disabled until every shot is assigned", () => {
    render(
      <PlanningScreen
        session={session}
        snapshot={makeSnapshot(1, [])}
        setSnapshot={() => {}}
        setError={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "เลือกเป้าให้ครบ 0/1" }))
      .toBeDisabled();
  });

  it("resets local targeting state when a new round starts", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <PlanningScreen
        session={session}
        snapshot={makeSnapshot(1, [{
          id: "p1-1-0",
          attackerId: "p1",
          targetId: "p2",
          coordinate: "A1",
        }])}
        setSnapshot={() => {}}
        setError={() => {}}
      />,
    );

    rerender(
      <PlanningScreen
        session={session}
        snapshot={makeSnapshot(2, [])}
        setSnapshot={() => {}}
        setError={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "ช่อง A2" }));

    expect(emitAck).toHaveBeenLastCalledWith(
      "orders:update",
      expect.objectContaining({
        orders: [expect.objectContaining({ targetId: "p2", coordinate: "A2" })],
      }),
    );
  });

  it("can switch between the opponent board and the player's own damaged board", async () => {
    const user = userEvent.setup();
    render(
      <PlanningScreen
        session={session}
        snapshot={makeSnapshot(1, [])}
        setSnapshot={() => {}}
        setError={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "ดูกระดานของฉัน" }));

    expect(screen.getByRole("heading", { name: "สถานะสนามรบของฉัน" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ช่อง B1 เรือถูกยิง" })).toBeInTheDocument();
  });

  it("lets the player draft consecutive shots at the same opponent before seal validation", async () => {
    const user = userEvent.setup();
    const snapshot = makeSnapshot(1, []);
    snapshot.player.secret.reserveAmmo = 1;
    render(
      <PlanningScreen
        session={session}
        snapshot={snapshot}
        setSnapshot={() => {}}
        setError={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "ช่อง A1" }));
    await user.click(screen.getByRole("button", { name: "ช่อง A2" }));

    expect(emitAck).toHaveBeenLastCalledWith(
      "orders:update",
      expect.objectContaining({
        orders: [
          expect.objectContaining({ targetId: "p2", coordinate: "A1" }),
          expect.objectContaining({ targetId: "p2", coordinate: "A2" }),
        ],
      }),
    );
  });

  it("shows every player's planning status and validates distribution when sealing", async () => {
    const user = userEvent.setup();
    const setError = vi.fn();
    const snapshot = makeSnapshot(1, [{
      id: "p1-1-0",
      attackerId: "p1",
      targetId: "p2",
      coordinate: "A1",
    }]);
    snapshot.public.seats[1]!.sealed = true;
    render(
      <PlanningScreen
        session={session}
        snapshot={snapshot}
        setSnapshot={() => {}}
        setError={setError}
      />,
    );

    expect(screen.getByText("เรา: กำลังเลือกเป้า")).toBeInTheDocument();
    expect(screen.getByText("คู่แข่ง: พร้อมโจมตีแล้ว")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "พร้อมโจมตี" }));

    expect(emitAck).toHaveBeenLastCalledWith(
      "orders:seal",
      expect.objectContaining({ playerId: "p1" }),
    );
    expect(setError).toHaveBeenCalledWith(
      "ต้องกระจายกระสุนให้คู่แข่งต่างกันไม่เกินหนึ่งนัด",
    );
  });

  it("offers the previous round log during planning", () => {
    const snapshot = makeSnapshot(2, []);
    snapshot.previousReveal = [{
      orderId: "previous",
      attackerId: "p1",
      targetId: "p2",
      coordinate: "C4",
      result: "HIT",
    }];
    render(
      <PlanningScreen
        session={session}
        snapshot={snapshot}
        setSnapshot={() => {}}
        setError={() => {}}
      />,
    );

    expect(screen.getByText("บันทึกรอบก่อน")).toBeInTheDocument();
    expect(screen.getAllByText("C4")).toHaveLength(2);
  });
});

function makeSnapshot(round: number, orders: GameSnapshot["player"]["orders"]): GameSnapshot {
  return {
    public: {
      roomCode: "ABC123",
      phase: "PLANNING",
      round,
      deadlineAt: Date.now() + 90_000,
      winnerId: null,
      seats: [
        { id: "p1", name: "เรา", kind: "HUMAN", connected: true, ready: false, eliminated: false },
        { id: "p2", name: "คู่แข่ง", kind: "HUMAN", connected: true, ready: false, eliminated: false },
      ],
    },
    player: {
      self: { id: "p1", name: "เรา", kind: "HUMAN", connected: true, ready: false, eliminated: false },
      secret: {
        terrain: ["A1"],
        forts: [{ id: "fort", coordinate: "A1", destroyed: true }],
        ships: [{ id: "ship", coordinates: ["B1"], hits: ["B1"] }],
        reserveAmmo: 0,
      },
      intel: [],
      orders,
    },
    reveal: [],
    previousReveal: [],
  };
}
