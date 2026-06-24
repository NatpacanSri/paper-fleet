import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SetupScreen } from "../src/App";
import type { GameSnapshot, Session } from "../src/types";

vi.mock("../src/socket", () => ({
  emitAck: vi.fn(),
  socket: { on: vi.fn(), off: vi.fn(), connect: vi.fn() },
}));

const session: Session = {
  roomCode: "ABC123",
  playerId: "p1",
  token: "token",
  isHost: true,
};

describe("SetupScreen", () => {
  it("keeps the local setup draft when a stale setup snapshot arrives", async () => {
    const user = userEvent.setup();
    const staleSnapshot = makeSetupSnapshot();
    const { rerender } = render(
      <SetupScreen
        session={session}
        snapshot={staleSnapshot}
        setSnapshot={() => {}}
        setError={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "ช่อง A1" }));
    expect(screen.getByRole("button", { name: "ช่อง A1" })).toHaveAttribute("data-terrain", "true");

    rerender(
      <SetupScreen
        session={session}
        snapshot={makeSetupSnapshot()}
        setSnapshot={() => {}}
        setError={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "ช่อง A1" })).toHaveAttribute("data-terrain", "true");
  });
});

function makeSetupSnapshot(): GameSnapshot {
  return {
    public: {
      roomCode: "ABC123",
      phase: "SETUP",
      round: 1,
      deadlineAt: null,
      winnerId: null,
      seats: [
        { id: "p1", name: "เรา", kind: "HUMAN", connected: true, ready: false, eliminated: false },
        { id: "p2", name: "เพื่อน", kind: "HUMAN", connected: true, ready: false, eliminated: false },
      ],
    },
    player: {
      self: { id: "p1", name: "เรา", kind: "HUMAN", connected: true, ready: false, eliminated: false },
      secret: { terrain: [], forts: [], ships: [], reserveAmmo: 0 },
      intel: [],
      orders: [],
    },
    reveal: [],
    previousReveal: [],
  };
}
