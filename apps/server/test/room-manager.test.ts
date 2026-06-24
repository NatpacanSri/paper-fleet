import { describe, expect, it } from "vitest";
import { RoomManager } from "../src/room-manager";

describe("RoomManager", () => {
  it("lets only the host configure max rounds before the room starts", () => {
    const manager = new RoomManager({ randomId: sequenceId() });
    const host = manager.createRoom("กัปตัน");
    const guest = manager.joinRoom(host.roomCode, "ลูกเรือ");

    const settings = (manager as any).updateSettings(host.roomCode, host.playerId, {
      maxRounds: 12,
    });

    expect(settings.maxRounds).toBe(12);
    expect(manager.getRoom(host.roomCode).settings.maxRounds).toBe(12);
    expect(() =>
      (manager as any).updateSettings(host.roomCode, guest.playerId, { maxRounds: 9 }),
    ).toThrow("host_only");

    manager.startRoom(host.roomCode, host.playerId);

    expect(() =>
      (manager as any).updateSettings(host.roomCode, host.playerId, { maxRounds: 9 }),
    ).toThrow("game_started");
  });

  it("restarts a finished room with the same seats and settings", () => {
    const manager = new RoomManager({ randomId: sequenceId() });
    const host = manager.createRoom("กัปตัน");
    const guest = manager.joinRoom(host.roomCode, "ลูกเรือ");
    (manager as any).updateSettings(host.roomCode, host.playerId, { maxRounds: 1 });
    manager.startRoom(host.roomCode, host.playerId);
    for (const id of [host.playerId, guest.playerId]) {
      manager.randomizeSetup(host.roomCode, id);
      manager.readySetup(host.roomCode, id);
    }
    manager.updateOrders(host.roomCode, host.playerId, [
      { targetId: guest.playerId, coordinate: "A8" },
    ]);
    manager.updateOrders(host.roomCode, guest.playerId, [
      { targetId: host.playerId, coordinate: "A8" },
    ]);
    manager.sealOrders(host.roomCode, host.playerId);
    manager.sealOrders(host.roomCode, guest.playerId);

    expect(manager.getRoom(host.roomCode).phase).toBe("FINISHED");

    const restarted = (manager as any).restartRoom(host.roomCode, host.playerId);

    expect(restarted.phase).toBe("LOBBY");
    expect(restarted.settings.maxRounds).toBe(1);
    expect(Object.keys(restarted.players)).toEqual([host.playerId, guest.playerId]);
    expect(restarted.history).toEqual([]);
    expect(restarted.players[host.playerId].secret.ships).toEqual([]);
    expect(restarted.players[host.playerId].seat.ready).toBe(false);
  });

  it("creates private rooms, joins by code, and caps seats at six", () => {
    const manager = new RoomManager({ randomId: sequenceId() });
    const host = manager.createRoom("กัปตัน");

    expect(host.roomCode).toHaveLength(6);
    expect(host.token).toBeTruthy();

    for (let index = 0; index < 5; index += 1) {
      manager.joinRoom(host.roomCode, `ผู้เล่น ${index + 2}`);
    }

    expect(() => manager.joinRoom(host.roomCode, "เกิน")).toThrow("room_full");
  });

  it("moves from setup to planning when humans are ready and prepares bot orders", () => {
    let now = 1_000;
    const manager = new RoomManager({ now: () => now, randomId: sequenceId() });
    const host = manager.createRoom("กัปตัน");
    const guest = manager.joinRoom(host.roomCode, "ลูกเรือ");
    manager.addBot(host.roomCode, host.playerId, "HARD");
    manager.startRoom(host.roomCode, host.playerId);

    manager.randomizeSetup(host.roomCode, host.playerId);
    manager.randomizeSetup(host.roomCode, guest.playerId);
    manager.readySetup(host.roomCode, host.playerId);
    manager.readySetup(host.roomCode, guest.playerId);

    const room = manager.getRoom(host.roomCode);
    expect(room.phase).toBe("PLANNING");
    expect(room.deadlineAt).toBe(now + 90_000);
    const bot = Object.values(room.players).find((player) => player.seat.kind === "BOT");
    expect(bot?.sealed).toBe(true);
    expect(bot?.orders.length).toBeGreaterThan(0);
  });

  it("keeps partial orders on timeout and discards unused ammunition", () => {
    let now = 2_000;
    const manager = new RoomManager({ now: () => now, randomId: sequenceId() });
    const host = manager.createRoom("กัปตัน");
    const guest = manager.joinRoom(host.roomCode, "ลูกเรือ");
    manager.startRoom(host.roomCode, host.playerId);
    manager.randomizeSetup(host.roomCode, host.playerId);
    manager.randomizeSetup(host.roomCode, guest.playerId);
    manager.readySetup(host.roomCode, host.playerId);
    manager.readySetup(host.roomCode, guest.playerId);

    manager.updateOrders(host.roomCode, host.playerId, [
      { targetId: guest.playerId, coordinate: "A8" },
    ]);
    now += 91_000;
    const tick = manager.tick();

    const room = manager.getRoom(host.roomCode);
    expect(tick.resolvedRoomCodes).toEqual([host.roomCode]);
    expect(room.phase).toBe("SALVAGE");
    expect(room.reveal).toHaveLength(1);
    expect(room.players[host.playerId]?.secret.reserveAmmo).toBe(0);
  });

  it("removes a seat when a player intentionally leaves and promotes the next human host", () => {
    const manager = new RoomManager({ randomId: sequenceId() });
    const host = manager.createRoom("กัปตัน");
    const guest = manager.joinRoom(host.roomCode, "ลูกเรือ");

    manager.leaveRoom(host.roomCode, host.playerId);

    expect(manager.getRoom(host.roomCode).players[host.playerId]).toBeUndefined();
    expect(Object.keys(manager.getRoom(host.roomCode).players)).toEqual([guest.playerId]);
    expect(() => manager.addBot(host.roomCode, guest.playerId, "EASY")).not.toThrow();
  });

  it("hands a disconnected seat to a fair bot after sixty seconds and restores it on reconnect", () => {
    let now = 10_000;
    const manager = new RoomManager({ now: () => now, randomId: sequenceId() });
    const host = manager.createRoom("กัปตัน");
    const guest = manager.joinRoom(host.roomCode, "ลูกเรือ");

    manager.disconnect(host.roomCode, guest.playerId);
    now += 60_001;
    manager.tick();

    expect(manager.getRoom(host.roomCode).players[guest.playerId]?.seat.kind).toBe("BOT");

    manager.reconnect(host.roomCode, guest.playerId, guest.token);
    const restored = manager.getRoom(host.roomCode).players[guest.playerId]?.seat;
    expect(restored?.kind).toBe("HUMAN");
    expect(restored?.connected).toBe(true);
  });

  it("keeps an uneven draft but rejects it only when the player seals", () => {
    const manager = new RoomManager({ randomId: sequenceId() });
    const host = manager.createRoom("กัปตัน");
    const guest = manager.joinRoom(host.roomCode, "หนึ่ง");
    const third = manager.joinRoom(host.roomCode, "สอง");
    manager.startRoom(host.roomCode, host.playerId);
    for (const id of [host.playerId, guest.playerId, third.playerId]) {
      manager.randomizeSetup(host.roomCode, id);
      manager.readySetup(host.roomCode, id);
    }

    const draft = manager.updateOrders(host.roomCode, host.playerId, [
      { targetId: guest.playerId, coordinate: "A1" },
      { targetId: guest.playerId, coordinate: "A2" },
    ]);

    expect(draft).toHaveLength(2);
    expect(() => manager.sealOrders(host.roomCode, host.playerId))
      .toThrow("orders_distribution");
    expect(manager.getRoom(host.roomCode).players[host.playerId]?.orders)
      .toHaveLength(2);
  });

  it("assigns unique thematic names to bots while keeping difficulty separate", () => {
    const manager = new RoomManager({
      randomId: sequenceId(),
      random: () => 0,
    });
    const host = manager.createRoom("กัปตัน");

    manager.addBot(host.roomCode, host.playerId, "EASY");
    manager.addBot(host.roomCode, host.playerId, "HARD");

    const bots = Object.values(manager.getRoom(host.roomCode).players)
      .filter((player) => player.seat.kind === "BOT");
    expect(bots.map((bot) => bot.seat.name)).toEqual(["ฉลามขาว", "หมึกแดง"]);
    expect(new Set(bots.map((bot) => bot.seat.name)).size).toBe(2);
    expect(bots.map((bot) => bot.seat.botDifficulty)).toEqual(["EASY", "HARD"]);
  });
});

function sequenceId() {
  let value = 0;
  return () => `${(value += 1).toString(36).padStart(8, "0")}`;
}
