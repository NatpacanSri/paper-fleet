import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GameSnapshot, Session } from "../src/types";

const { emitAck } = vi.hoisted(() => ({
  emitAck: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../src/socket", () => ({
  emitAck,
  socket: { on: vi.fn(), off: vi.fn(), connect: vi.fn() },
}));

import { LobbyScreen, ResultsScreen } from "../src/App";

const session: Session = {
  roomCode: "ABC123",
  playerId: "p1",
  token: "token",
  isHost: true,
};

describe("Wave 3 room flow", () => {
  it("lets the host configure max rounds from the lobby", async () => {
    const user = userEvent.setup();
    render(
      <LobbyScreen
        session={session}
        snapshot={makeSnapshot("LOBBY")}
        setError={() => {}}
      />,
    );

    const input = screen.getByLabelText("จำนวนรอบสูงสุด");
    await user.clear(input);
    await user.type(input, "14");

    expect(emitAck).toHaveBeenLastCalledWith(
      "room:update-settings",
      expect.objectContaining({
        roomCode: "ABC123",
        requesterId: "p1",
        settings: { maxRounds: 14 },
      }),
    );
  });

  it("shows scoring history and lets the host restart the finished room", async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    render(
      <ResultsScreen
        session={session}
        snapshot={makeSnapshot("FINISHED")}
        setError={() => {}}
        onLeave={onLeave}
      />,
    );

    expect(screen.getByText("ครบ 20 รอบ ตัดสินด้วยคะแนน")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ตารางคะแนน" })).toBeInTheDocument();
    expect(screen.getByText("ประวัติการยิง")).toBeInTheDocument();
    expect(screen.getByText("รอบ 1 · เรา → คู่แข่ง · B4 · โดน")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "เริ่มใหม่ในห้องเดิม" }));

    expect(emitAck).toHaveBeenCalledWith(
      "room:restart",
      { roomCode: "ABC123", requesterId: "p1" },
    );
    expect(onLeave).not.toHaveBeenCalled();
  });
});

function makeSnapshot(phase: GameSnapshot["public"]["phase"]): GameSnapshot {
  return {
    public: {
      roomCode: "ABC123",
      phase,
      round: 20,
      deadlineAt: null,
      winnerId: "p1",
      settings: { maxSeats: 6, planningSeconds: 90, maxRounds: 20 },
      finishReason: phase === "FINISHED" ? "ROUND_LIMIT" : null,
      scores: [
        {
          playerId: "p1",
          survived: true,
          remainingShipCells: 7,
          remainingForts: 2,
          hits: 5,
          misses: 3,
          score: 83,
        },
        {
          playerId: "p2",
          survived: true,
          remainingShipCells: 5,
          remainingForts: 1,
          hits: 4,
          misses: 5,
          score: 56,
        },
      ],
      seats: [
        { id: "p1", name: "เรา", kind: "HUMAN", connected: true, ready: false, eliminated: false },
        { id: "p2", name: "คู่แข่ง", kind: "HUMAN", connected: true, ready: false, eliminated: false },
      ],
    },
    player: {
      self: { id: "p1", name: "เรา", kind: "HUMAN", connected: true, ready: false, eliminated: false },
      secret: { terrain: [], forts: [], ships: [], reserveAmmo: 0 },
      intel: [],
      orders: [],
    },
    reveal: [
      { orderId: "latest", attackerId: "p1", targetId: "p2", coordinate: "B4", result: "HIT" },
    ],
    previousReveal: [],
    history: [
      { round: 1, orderId: "latest", attackerId: "p1", targetId: "p2", coordinate: "B4", result: "HIT" },
    ],
  };
}
