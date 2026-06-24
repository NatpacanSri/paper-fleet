import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import {
  buildRevealSchedule,
  createSocketServer,
  defaultWebDistDir,
} from "../src/socket-server";
import { RoomManager } from "../src/room-manager";

const clients: Socket[] = [];
const servers: ReturnType<typeof createSocketServer>[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
  }
  for (const tempDir of tempDirs.splice(0)) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

describe("Socket.IO API", () => {
  it("adds a pause when reveal passes to the next attacker", () => {
    const schedule = buildRevealSchedule([
      { orderId: "1", attackerId: "p1", targetId: "p2", coordinate: "A1", result: "WATER" },
      { orderId: "2", attackerId: "p1", targetId: "p2", coordinate: "A2", result: "HIT" },
      { orderId: "3", attackerId: "p2", targetId: "p1", coordinate: "B1", result: "WATER" },
      { orderId: "4", attackerId: "p2", targetId: "p1", coordinate: "B2", result: "HIT" },
    ], 800, 1_200);

    expect(schedule.map((entry) => entry.delayMs)).toEqual([0, 800, 2_000, 2_800]);
  });

  it("creates a room and sends a private snapshot without leaking other boards", async () => {
    const server = createSocketServer();
    servers.push(server);
    server.httpServer.listen(0);
    await once(server.httpServer, "listening");
    const port = (server.httpServer.address() as AddressInfo).port;
    const client = createClient(`http://127.0.0.1:${port}`);
    clients.push(client);
    await waitForConnect(client);

    const created = await emitAck<{
      ok: true;
      roomCode: string;
      playerId: string;
      token: string;
      snapshot: unknown;
    }>(client, "room:create", { name: "กัปตัน" });

    expect(created.ok).toBe(true);
    expect(created.roomCode).toHaveLength(6);
    expect(JSON.stringify(created.snapshot)).toContain("กัปตัน");
  });

  it("removes a leaving player from the room for remaining clients", async () => {
    const server = createSocketServer();
    servers.push(server);
    server.httpServer.listen(0);
    await once(server.httpServer, "listening");
    const port = (server.httpServer.address() as AddressInfo).port;
    const hostClient = createClient(`http://127.0.0.1:${port}`);
    const guestClient = createClient(`http://127.0.0.1:${port}`);
    clients.push(hostClient, guestClient);
    await Promise.all([waitForConnect(hostClient), waitForConnect(guestClient)]);

    const host = await emitAck<{
      ok: true;
      roomCode: string;
      playerId: string;
      token: string;
    }>(hostClient, "room:create", { name: "กัปตัน" });
    const guest = await emitAck<{
      ok: true;
      roomCode: string;
      playerId: string;
      token: string;
    }>(guestClient, "room:join", { roomCode: host.roomCode, name: "ลูกเรือ" });
    const left = await emitAck<{ ok: true }>(guestClient, "room:leave", guest);

    expect(left.ok).toBe(true);
    const state = await waitForState(
      hostClient,
      (snapshot) => snapshot.public.seats.length === 1,
    );
    expect(state.public.seats).toEqual([expect.objectContaining({ id: host.playerId })]);
  });

  it("returns stable error codes through acknowledgements", async () => {
    const server = createSocketServer();
    servers.push(server);
    server.httpServer.listen(0);
    await once(server.httpServer, "listening");
    const port = (server.httpServer.address() as AddressInfo).port;
    const client = createClient(`http://127.0.0.1:${port}`);
    clients.push(client);
    await waitForConnect(client);

    const result = await emitAck<{ ok: false; error: string }>(
      client,
      "room:join",
      { roomCode: "MISSING", name: "ผู้เล่น" },
    );

    expect(result).toEqual({ ok: false, error: "room_not_found" });
  });

  it("serves the built web app and keeps health as API JSON", async () => {
    const webDistDir = await mkdtemp(join(tmpdir(), "paper-fleet-web-"));
    tempDirs.push(webDistDir);
    await writeFile(join(webDistDir, "index.html"), "<!doctype html><div id=\"root\">Paper Fleet</div>");

    const server = createSocketServer(undefined, { webDistDir });
    servers.push(server);
    server.httpServer.listen(0);
    await once(server.httpServer, "listening");
    const port = (server.httpServer.address() as AddressInfo).port;

    const indexResponse = await fetch(`http://127.0.0.1:${port}/`);
    expect(indexResponse.headers.get("content-type")).toContain("text/html");
    expect(await indexResponse.text()).toContain("Paper Fleet");

    const fallbackResponse = await fetch(`http://127.0.0.1:${port}/room/ABC123`);
    expect(fallbackResponse.headers.get("content-type")).toContain("text/html");
    expect(await fallbackResponse.text()).toContain("Paper Fleet");

    const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
    expect(healthResponse.headers.get("content-type")).toContain("application/json");
    expect(await healthResponse.json()).toEqual({ ok: true, service: "paper-fleet-server" });
  });

  it("resolves the web dist path from the server module instead of the current working directory", () => {
    const serverDistModule = pathToFileURL(join(process.cwd(), "dist/socket-server.js")).href;

    expect(defaultWebDistDir(serverDistModule)).toBe(join(process.cwd(), "../web/dist"));
  });

  it("advances from salvage to the next planning round after the reveal delay", async () => {
    const manager = new RoomManager();
    const host = manager.createRoom("กัปตัน");
    const guest = manager.joinRoom(host.roomCode, "ลูกเรือ");
    manager.startRoom(host.roomCode, host.playerId);
    for (const id of [host.playerId, guest.playerId]) {
      manager.randomizeSetup(host.roomCode, id);
      manager.readySetup(host.roomCode, id);
    }
    manager.updateOrders(host.roomCode, host.playerId, [
      { targetId: guest.playerId, coordinate: "C5" },
    ]);
    manager.updateOrders(host.roomCode, guest.playerId, [
      { targetId: host.playerId, coordinate: "C5" },
    ]);
    manager.sealOrders(host.roomCode, host.playerId);

    const server = createSocketServer(manager, {
      revealStepMs: 0,
      attackerGapMs: 0,
      salvageDelayMs: 5,
    });
    servers.push(server);
    server.httpServer.listen(0);
    await once(server.httpServer, "listening");
    const port = (server.httpServer.address() as AddressInfo).port;
    const client = createClient(`http://127.0.0.1:${port}`);
    clients.push(client);
    await waitForConnect(client);
    await emitAck(client, "player:reconnect", guest);
    await emitAck(client, "orders:seal", {
      roomCode: guest.roomCode,
      playerId: guest.playerId,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(manager.getRoom(host.roomCode).phase).toBe("PLANNING");
    expect(manager.getRoom(host.roomCode).round).toBe(2);
  });
});

function emitAck<T>(socket: Socket, event: string, payload: unknown) {
  return new Promise<T>((resolve) => socket.emit(event, payload, resolve));
}

function waitForConnect(socket: Socket) {
  return new Promise<void>((resolve) => socket.once("connect", () => resolve()));
}

function waitForState<T extends { public: { seats: unknown[] } }>(
  socket: Socket,
  predicate: (snapshot: T) => boolean,
) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("room:state", onState);
      reject(new Error("Timed out waiting for room state"));
    }, 1_000);
    const onState = (snapshot: T) => {
      if (!predicate(snapshot)) return;
      clearTimeout(timer);
      socket.off("room:state", onState);
      resolve(snapshot);
    };
    socket.on("room:state", onState);
  });
}
