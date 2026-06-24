import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App, SocialBar, SpectatorScreen, Toast } from "../src/App";
import { Board } from "../src/components/Board";
import { SetupEditor } from "../src/components/SetupEditor";

describe("App", () => {
  it("presents create, join, and tutorial paths in Thai", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "วาดเกาะ ซ่อนเรือ แล้วอ่านใจเพื่อน" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "สร้างห้อง" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เข้าห้อง" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ลองสนามฝึก" })).toBeInTheDocument();
  });

  it("opens the guided tutorial without requiring a server", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "ลองสนามฝึก" }));

    expect(screen.getByRole("dialog", { name: "สนามฝึก Paper Fleet" })).toBeInTheDocument();
    expect(screen.getByText("1 / 4")).toBeInTheDocument();
  });
});

describe("Toast", () => {
  it("dismisses automatically after four seconds and can be closed immediately", async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { rerender } = render(<Toast message="ผิดพลาด" onDismiss={onDismiss} />);

    await vi.advanceTimersByTimeAsync(3_999);
    expect(onDismiss).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    onDismiss.mockClear();
    rerender(<Toast message="ผิดอีกครั้ง" onDismiss={onDismiss} />);
    screen.getByRole("button", { name: "ปิดการแจ้งเตือน" }).click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("SocialBar", () => {
  it("starts collapsed, counts unread messages, and clears them when opened", async () => {
    const user = userEvent.setup();
    const session = {
      roomCode: "ABC123",
      playerId: "p1",
      token: "token",
      isHost: true,
    };
    const { rerender } = render(<SocialBar session={session} messages={[]} />);

    expect(screen.queryByPlaceholderText("แซวเพื่อน...")).not.toBeInTheDocument();
    rerender(<SocialBar session={session} messages={[{ playerId: "p2", text: "ยิงโดนแล้ว" }]} />);
    expect(screen.getByRole("button", { name: "เปิดแชต มี 1 ข้อความใหม่" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "เปิดแชต มี 1 ข้อความใหม่" }));
    expect(screen.getByPlaceholderText("แซวเพื่อน...")).toBeInTheDocument();
    expect(screen.getByText("ยิงโดนแล้ว")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ย่อแชต" }));
    expect(screen.getByRole("button", { name: "เปิดแชต" })).toBeInTheDocument();
  });
});

describe("SetupEditor", () => {
  it("draws and erases terrain cells locally", async () => {
    const user = userEvent.setup();
    render(<SetupEditor value={{ terrain: [], forts: [], ships: [], reserveAmmo: 0 }} onChange={() => {}} />);

    const cell = screen.getByRole("button", { name: "ช่อง A1" });
    await user.click(cell);
    expect(cell).toHaveAttribute("data-terrain", "true");
    await user.click(cell);
    expect(cell).toHaveAttribute("data-terrain", "false");
  });

  it("offers all setup layers and randomize", () => {
    render(<SetupEditor value={{ terrain: [], forts: [], ships: [], reserveAmmo: 0 }} onChange={() => {}} />);

    expect(screen.getByRole("button", { name: "วาดเกาะ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "วางป้อม" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "วางเรือ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "สุ่มแผน" })).toBeInTheDocument();
  });

  it("does not allow terrain to overlap an existing ship", async () => {
    const user = userEvent.setup();
    render(
      <SetupEditor
        value={{
          terrain: [],
          forts: [],
          ships: [{ id: "ship-1", coordinates: ["A1"], hits: [] }],
          reserveAmmo: 0,
        }}
        onChange={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "ช่อง A1" }));

    expect(screen.getByRole("button", { name: "ช่อง A1" }))
      .toHaveAttribute("data-terrain", "false");
  });

  it("shows ship inventory and a placement preview before clicking", async () => {
    const user = userEvent.setup();
    render(
      <SetupEditor
        value={{ terrain: [], forts: [], ships: [], reserveAmmo: 0 }}
        onChange={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "วางเรือ" }));
    expect(screen.getByText("เรือ 4 ช่อง 0/1")).toBeInTheDocument();
    expect(screen.getByText("เรือ 1 ช่อง 0/2")).toBeInTheDocument();

    await user.hover(screen.getByRole("button", { name: "ช่อง A1" }));
    for (const coordinate of ["A1", "A2", "A3", "A4"]) {
      expect(screen.getByRole("button", { name: `ช่อง ${coordinate}` }))
        .toHaveAttribute("data-preview", "valid");
    }
  });
});

describe("Board", () => {
  it("shows damage on the player's own ships and forts", () => {
    render(
      <Board
        secret={{
          terrain: ["A1"],
          forts: [{ id: "fort", coordinate: "A1", destroyed: true }],
          ships: [{ id: "ship", coordinates: ["B1", "B2"], hits: ["B1"] }],
          reserveAmmo: 0,
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "ช่อง A1 ป้อมถูกทำลาย" }))
      .toHaveAttribute("data-damage", "destroyed");
    expect(screen.getByRole("button", { name: "ช่อง B1 เรือถูกยิง" }))
      .toHaveAttribute("data-damage", "hit");
  });
});

describe("SpectatorScreen", () => {
  it("shows only public fleet status after elimination", () => {
    render(
      <SpectatorScreen
        snapshot={{
          public: {
            roomCode: "ABC123",
            phase: "PLANNING",
            round: 3,
            deadlineAt: null,
            winnerId: null,
            seats: [
              { id: "p1", name: "คนดู", kind: "HUMAN", connected: true, ready: false, eliminated: true },
              { id: "p2", name: "ผู้รอด", kind: "HUMAN", connected: true, ready: false, eliminated: false },
            ],
          },
          player: {
            self: { id: "p1", name: "คนดู", kind: "HUMAN", connected: true, ready: false, eliminated: true },
            secret: { terrain: ["A1"], forts: [], ships: [], reserveAmmo: 0 },
            intel: [],
            orders: [],
          },
          reveal: [],
          previousReveal: [],
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "กองเรือคุณจมแล้ว" })).toBeInTheDocument();
    expect(screen.getByText("ผู้รอด")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ช่อง A1" })).not.toBeInTheDocument();
  });
});
