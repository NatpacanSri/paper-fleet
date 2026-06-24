import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import type {
  BotDifficulty,
  Coordinate,
  PlayerSecretState,
  RevealEntry,
} from "@paper-fleet/game-core";
import { RoomManager } from "./room-manager";

type Ack = (result: Record<string, unknown>) => void;

interface SocketServerOptions {
  revealStepMs?: number;
  attackerGapMs?: number;
  salvageDelayMs?: number;
  webDistDir?: string;
}

export function buildRevealSchedule(
  reveal: RevealEntry[],
  revealStepMs: number,
  attackerGapMs: number,
) {
  let delayMs = 0;
  return reveal.map((shot, index) => {
    if (index > 0) {
      delayMs += reveal[index - 1]?.attackerId === shot.attackerId
        ? revealStepMs
        : attackerGapMs;
    }
    return { shot, delayMs };
  });
}

export function defaultWebDistDir(moduleUrl = import.meta.url) {
  return process.env.WEB_DIST_DIR
    ?? join(dirname(fileURLToPath(moduleUrl)), "../../web/dist");
}

export function createSocketServer(
  manager = new RoomManager(),
  {
    revealStepMs = 800,
    attackerGapMs = 1_200,
    salvageDelayMs = 3_500,
    webDistDir = defaultWebDistDir(),
  }: SocketServerOptions = {},
) {
  const app = express();
  app.use(cors());
  app.get("/health", (_request, response) => {
    response.json({ ok: true, service: "paper-fleet-server" });
  });
  if (existsSync(join(webDistDir, "index.html"))) {
    app.use(express.static(webDistDir));
    app.get(/^\/(?!socket\.io\/?).*/, (_request, response) => {
      response.sendFile(join(webDistDir, "index.html"));
    });
  }

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
  });

  const sendSnapshots = async (roomCode: string) => {
    const sockets = await io.in(roomCode).fetchSockets();
    for (const socket of sockets) {
      const playerId = socket.data.playerId as string | undefined;
      if (!playerId) continue;
      try {
        socket.emit("room:state", manager.snapshot(roomCode, playerId));
      } catch {
        // A socket may outlive a removed room for a few milliseconds.
      }
    }
  };

  const announceResolution = async (roomCode: string) => {
    const room = manager.getRoom(roomCode);
    if (room.reveal.length === 0) return;
    io.to(roomCode).emit("phase:update", { phase: "REVEAL", round: room.round });
    const schedule = buildRevealSchedule(room.reveal, revealStepMs, attackerGapMs);
    schedule.forEach(({ shot, delayMs }) => {
      setTimeout(() => io.to(roomCode).emit("reveal:shot", shot), delayMs);
    });
    const revealDuration = (schedule.at(-1)?.delayMs ?? 0) + revealStepMs;
    setTimeout(() => {
      io.to(roomCode).emit("phase:update", { phase: room.phase, round: room.round });
      void sendSnapshots(roomCode);
    }, revealDuration + 150);
    if (room.phase === "SALVAGE") {
      setTimeout(() => {
        manager.advanceFromSalvage(roomCode);
        io.to(roomCode).emit("phase:update", {
          phase: "PLANNING",
          round: manager.getRoom(roomCode).round,
        });
        void sendSnapshots(roomCode);
      }, revealDuration + salvageDelayMs);
    }
  };

  io.on("connection", (socket) => {
    socket.on("room:create", (payload: { name?: string }, ack: Ack) => {
      safeAck(ack, () => {
        const session = manager.createRoom(payload.name ?? "");
        socket.data.roomCode = session.roomCode;
        socket.data.playerId = session.playerId;
        socket.join(session.roomCode);
        return {
          ok: true,
          ...session,
          snapshot: manager.snapshot(session.roomCode, session.playerId),
        };
      });
    });

    socket.on(
      "room:join",
      (payload: { roomCode?: string; name?: string }, ack: Ack) => {
        safeAck(ack, () => {
          const session = manager.joinRoom(payload.roomCode ?? "", payload.name ?? "");
          socket.data.roomCode = session.roomCode;
          socket.data.playerId = session.playerId;
          socket.join(session.roomCode);
          void sendSnapshots(session.roomCode);
          return {
            ok: true,
            ...session,
            snapshot: manager.snapshot(session.roomCode, session.playerId),
          };
        });
      },
    );

    socket.on(
      "room:update-seat",
      (
        payload: { roomCode?: string; requesterId?: string; difficulty?: BotDifficulty },
        ack: Ack,
      ) => {
        safeAck(ack, () => {
          const botId = manager.addBot(
            payload.roomCode ?? "",
            payload.requesterId ?? "",
            payload.difficulty ?? "NORMAL",
          );
          void sendSnapshots(payload.roomCode ?? "");
          return { ok: true, botId };
        });
      },
    );

    socket.on(
      "room:start",
      (payload: { roomCode?: string; requesterId?: string }, ack: Ack) => {
        safeAck(ack, () => {
          manager.startRoom(payload.roomCode ?? "", payload.requesterId ?? "");
          void sendSnapshots(payload.roomCode ?? "");
          return { ok: true };
        });
      },
    );

    socket.on(
      "setup:update",
      (
        payload: { roomCode?: string; playerId?: string; secret?: PlayerSecretState },
        ack: Ack,
      ) => {
        safeAck(ack, () => {
          if (!payload.secret) throw new Error("invalid_setup");
          manager.updateSetup(payload.roomCode ?? "", payload.playerId ?? "", payload.secret);
          void sendSnapshots(payload.roomCode ?? "");
          return { ok: true };
        });
      },
    );

    socket.on(
      "setup:randomize",
      (payload: { roomCode?: string; playerId?: string }, ack: Ack) => {
        safeAck(ack, () => {
          const secret = manager.randomizeSetup(
            payload.roomCode ?? "",
            payload.playerId ?? "",
          );
          void sendSnapshots(payload.roomCode ?? "");
          return { ok: true, secret };
        });
      },
    );

    socket.on(
      "setup:ready",
      (payload: { roomCode?: string; playerId?: string }, ack: Ack) => {
        safeAck(ack, () => {
          manager.readySetup(payload.roomCode ?? "", payload.playerId ?? "");
          void sendSnapshots(payload.roomCode ?? "");
          return { ok: true };
        });
      },
    );

    socket.on(
      "orders:update",
      (
        payload: {
          roomCode?: string;
          playerId?: string;
          orders?: Array<{ targetId: string; coordinate: Coordinate }>;
        },
        ack: Ack,
      ) => {
        safeAck(ack, () => {
          const orders = manager.updateOrders(
            payload.roomCode ?? "",
            payload.playerId ?? "",
            payload.orders ?? [],
          );
          return { ok: true, orders };
        });
      },
    );

    socket.on(
      "orders:seal",
      (payload: { roomCode?: string; playerId?: string }, ack: Ack) => {
        safeAck(ack, () => {
          manager.sealOrders(payload.roomCode ?? "", payload.playerId ?? "");
          const room = manager.getRoom(payload.roomCode ?? "");
          if (room.phase === "SALVAGE" || room.phase === "FINISHED") {
            void announceResolution(room.code);
          } else {
            void sendSnapshots(payload.roomCode ?? "");
          }
          return { ok: true };
        });
      },
    );

    socket.on(
      "player:reconnect",
      (
        payload: { roomCode?: string; playerId?: string; token?: string },
        ack: Ack,
      ) => {
        safeAck(ack, () => {
          const roomCode = payload.roomCode ?? "";
          const playerId = payload.playerId ?? "";
          const snapshot = manager.reconnect(roomCode, playerId, payload.token ?? "");
          socket.data.roomCode = roomCode;
          socket.data.playerId = playerId;
          socket.join(roomCode);
          void sendSnapshots(roomCode);
          return { ok: true, snapshot };
        });
      },
    );

    socket.on(
      "chat:send",
      (payload: { roomCode?: string; playerId?: string; text?: string }, ack: Ack) => {
        safeAck(ack, () => {
          const text = payload.text?.trim().slice(0, 280);
          if (!text) throw new Error("empty_message");
          io.to(payload.roomCode ?? "").emit("chat:message", {
            playerId: payload.playerId,
            text,
            sentAt: Date.now(),
          });
          return { ok: true };
        });
      },
    );

    socket.on(
      "reaction:send",
      (payload: { roomCode?: string; playerId?: string; reaction?: string }, ack: Ack) => {
        safeAck(ack, () => {
          io.to(payload.roomCode ?? "").emit("reaction:show", {
            playerId: payload.playerId,
            reaction: payload.reaction?.slice(0, 24) || "โดน!",
          });
          return { ok: true };
        });
      },
    );

    socket.on("disconnect", () => {
      const roomCode = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (!roomCode || !playerId) return;
      try {
        manager.disconnect(roomCode, playerId);
        void sendSnapshots(roomCode);
      } catch {
        // The room may have expired before the transport disconnected.
      }
    });
  });

  const tickTimer = setInterval(() => manager.tick(), 1_000);
  tickTimer.unref();
  httpServer.on("close", () => clearInterval(tickTimer));

  return { app, httpServer, io, manager };
}

function safeAck(ack: Ack | undefined, operation: () => Record<string, unknown>) {
  try {
    ack?.(operation());
  } catch (error) {
    ack?.({
      ok: false,
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
}
