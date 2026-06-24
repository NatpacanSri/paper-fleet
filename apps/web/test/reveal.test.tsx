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
    expect(screen.getByText((_text, element) =>
      element?.tagName.toLowerCase() === "summary" &&
      (element.textContent?.includes("คำสั่งของ เรา") ?? false),
    )).toBeInTheDocument();
    expect(screen.getByText("2 นัด")).toBeInTheDocument();
    expect(screen.getByText((text) => text.includes("คู่แข่ง → เรา"))).toBeInTheDocument();
  });

  it("shows the player's damaged board and per-attacker recap during salvage", () => {
    const snapshot = makeSnapshot();
    snapshot.public.phase = "SALVAGE";
    snapshot.player.secret.ships = [{ id: "ship", coordinates: ["B4", "B5"], hits: ["B4"] }];
    snapshot.reveal = [
      {
        orderId: "one",
        attackerId: "p2",
        targetId: "p1",
        coordinate: "B4",
        result: "HIT",
      },
      {
        orderId: "two",
        attackerId: "p2",
        targetId: "p1",
        coordinate: "C4",
        result: "WATER",
      },
      {
        orderId: "three",
        attackerId: "p1",
        targetId: "p2",
        coordinate: "A1",
        result: "SUNK",
      },
    ];

    render(<RevealScreen snapshot={snapshot} liveReveal={[]} />);

    expect(screen.getByRole("heading", { name: "กระดานของฉันหลังโดนยิง" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ช่อง B4 เรือถูกยิง" }))
      .toHaveAttribute("data-damage", "hit");
    expect(screen.getByText("คู่แข่ง", { selector: ".completed-orders summary b" }))
      .toHaveClass("player-color-1");
    expect(screen.getByText("1 โดน · 1 พลาด")).toBeInTheDocument();
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
