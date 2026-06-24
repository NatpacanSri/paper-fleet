import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RevealScreen } from "../src/App";
import type { GameSnapshot } from "../src/types";

describe("RevealScreen", () => {
  it("stages the latest shot and folds completed attackers into round logs", () => {
    const snapshot = makeSnapshot();
    render(
      <RevealScreen
        snapshot={snapshot}
        liveReveal={[
          {
            orderId: "one",
            attackerId: "p1",
            targetId: "p2",
            coordinate: "A1",
            result: "WATER",
          },
          {
            orderId: "two",
            attackerId: "p1",
            targetId: "p3",
            coordinate: "A2",
            result: "HIT",
          },
          {
            orderId: "three",
            attackerId: "p2",
            targetId: "p1",
            coordinate: "B4",
            result: "SUNK",
          },
        ]}
      />,
    );

    expect(screen.getByText("B4")).toBeInTheDocument();
    expect(screen.getByText("จม")).toBeInTheDocument();
    expect(screen.getByText("คำสั่งของ เรา")).toBeInTheDocument();
    expect(screen.getByText("2 นัด")).toBeInTheDocument();
    expect(screen.getByText((text) => text.includes("คู่แข่ง → เรา"))).toBeInTheDocument();
  });
});

function makeSnapshot(): GameSnapshot {
  return {
    public: {
      roomCode: "ABC123",
      phase: "REVEAL",
      round: 2,
      deadlineAt: null,
      winnerId: null,
      seats: [
        { id: "p1", name: "เรา", kind: "HUMAN", connected: true, ready: false, eliminated: false },
        { id: "p2", name: "คู่แข่ง", kind: "HUMAN", connected: true, ready: false, eliminated: false },
        { id: "p3", name: "หมึกแดง", kind: "BOT", botDifficulty: "EASY", connected: true, ready: false, eliminated: false },
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
