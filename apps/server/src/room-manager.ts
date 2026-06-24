import {
  buildPlayerSnapshot,
  calculateScores,
  calculateFirepower,
  chooseBotOrders,
  createGameRoom,
  generateRandomPlacement,
  resolveRound,
  validateDistribution,
  validatePlacement,
} from "@paper-fleet/game-core";
import type {
  BotDifficulty,
  Coordinate,
  FireOrder,
  GameRoom,
  RoomSettings,
  Seat,
} from "@paper-fleet/game-core";

interface RoomManagerOptions {
  now?: () => number;
  randomId?: () => string;
  random?: () => number;
}

interface SessionResult {
  roomCode: string;
  playerId: string;
  token: string;
}

interface ManagedRoom {
  game: GameRoom;
  hostId: string;
  tokens: Map<string, string>;
  disconnectedAt: Map<string, number>;
  takenOverHumans: Set<string>;
  firepower: Map<string, number>;
  emptySince: number | null;
}

interface OrderInput {
  targetId: string;
  coordinate: Coordinate;
}

interface SettingsInput {
  maxRounds?: number;
}

interface TickResult {
  resolvedRoomCodes: string[];
  updatedRoomCodes: string[];
}

export class RoomManager {
  private readonly rooms = new Map<string, ManagedRoom>();
  private readonly now: () => number;
  private readonly randomId: () => string;
  private readonly random: () => number;

  constructor(options: RoomManagerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.randomId = options.randomId ?? (() => crypto.randomUUID().replaceAll("-", ""));
    this.random = options.random ?? Math.random;
  }

  createRoom(name: string): SessionResult {
    const playerId = this.nextId("player");
    const roomCode = this.uniqueRoomCode();
    const token = this.nextId("token");
    const host = this.humanSeat(playerId, name);
    const game = createGameRoom(roomCode, host);

    this.rooms.set(roomCode, {
      game,
      hostId: playerId,
      tokens: new Map([[playerId, token]]),
      disconnectedAt: new Map(),
      takenOverHumans: new Set(),
      firepower: new Map(),
      emptySince: null,
    });

    return { roomCode, playerId, token };
  }

  joinRoom(roomCode: string, name: string): SessionResult {
    const managed = this.requireManaged(roomCode);
    if (managed.game.phase !== "LOBBY") throw new Error("game_started");
    if (Object.keys(managed.game.players).length >= managed.game.settings.maxSeats) {
      throw new Error("room_full");
    }

    const playerId = this.nextId("player");
    const token = this.nextId("token");
    managed.game.players[playerId] = {
      seat: this.humanSeat(playerId, name),
      secret: { terrain: [], forts: [], ships: [], reserveAmmo: 0 },
      intel: [],
      orders: [],
      sealed: false,
    };
    managed.tokens.set(playerId, token);
    return { roomCode: managed.game.code, playerId, token };
  }

  addBot(roomCode: string, requesterId: string, difficulty: BotDifficulty) {
    const managed = this.requireManaged(roomCode);
    if (managed.hostId !== requesterId) throw new Error("host_only");
    if (managed.game.phase !== "LOBBY") throw new Error("game_started");
    if (Object.keys(managed.game.players).length >= managed.game.settings.maxSeats) {
      throw new Error("room_full");
    }

    const id = this.nextId("bot");
    managed.game.players[id] = {
      seat: {
        id,
        name: this.nextBotName(managed.game),
        kind: "BOT",
        botDifficulty: difficulty,
        connected: true,
        ready: true,
        eliminated: false,
      },
      secret: { terrain: [], forts: [], ships: [], reserveAmmo: 0 },
      intel: [],
      orders: [],
      sealed: false,
    };
    return id;
  }

  updateSettings(roomCode: string, requesterId: string, settings: SettingsInput) {
    const managed = this.requireManaged(roomCode);
    if (managed.hostId !== requesterId) throw new Error("host_only");
    if (managed.game.phase !== "LOBBY") throw new Error("game_started");

    managed.game.settings = {
      ...managed.game.settings,
      maxRounds: this.clampMaxRounds(settings.maxRounds ?? managed.game.settings.maxRounds),
    };
    return managed.game.settings;
  }

  startRoom(roomCode: string, requesterId: string) {
    const managed = this.requireManaged(roomCode);
    if (managed.hostId !== requesterId) throw new Error("host_only");
    if (Object.keys(managed.game.players).length < 2) throw new Error("not_enough_players");
    managed.game.phase = "SETUP";

    for (const player of Object.values(managed.game.players)) {
      player.seat.ready = player.seat.kind === "BOT";
      if (player.seat.kind === "BOT") player.secret = generateRandomPlacement();
    }
  }

  randomizeSetup(roomCode: string, playerId: string) {
    const player = this.requirePlayer(roomCode, playerId);
    player.secret = generateRandomPlacement();
    player.seat.ready = false;
    return player.secret;
  }

  updateSetup(roomCode: string, playerId: string, secret: GameRoom["players"][string]["secret"]) {
    const managed = this.requireManaged(roomCode);
    if (managed.game.phase !== "SETUP") throw new Error("wrong_phase");
    const validation = validatePlacement(secret);
    if (!validation.valid) throw new Error(validation.errors[0] ?? "invalid_setup");
    const player = this.requirePlayer(roomCode, playerId);
    player.secret = structuredClone(secret);
    player.seat.ready = false;
  }

  readySetup(roomCode: string, playerId: string) {
    const managed = this.requireManaged(roomCode);
    if (managed.game.phase !== "SETUP") throw new Error("wrong_phase");
    const player = this.requirePlayer(roomCode, playerId);
    const validation = validatePlacement(player.secret);
    if (!validation.valid) throw new Error(validation.errors[0] ?? "invalid_setup");
    player.seat.ready = true;

    if (Object.values(managed.game.players).every((candidate) => candidate.seat.ready)) {
      this.beginPlanning(managed);
    }
  }

  updateOrders(roomCode: string, playerId: string, inputs: OrderInput[]) {
    const managed = this.requireManaged(roomCode);
    if (managed.game.phase !== "PLANNING") throw new Error("wrong_phase");
    const player = this.requirePlayer(roomCode, playerId);
    if (player.sealed || player.seat.eliminated) throw new Error("orders_locked");

    const available = managed.firepower.get(playerId) ?? calculateFirepower(player.secret);
    if (inputs.length > available) throw new Error("orders_ammo");

    const opponents = Object.values(managed.game.players)
      .filter((candidate) => candidate.seat.id !== playerId && !candidate.seat.eliminated)
      .map((candidate) => candidate.seat.id);
    if (
      inputs.some(
        (input) =>
          !opponents.includes(input.targetId) ||
          !/^[A-F][1-8]$/.test(input.coordinate),
      )
    ) {
      throw new Error("orders_invalid");
    }

    player.orders = inputs.map((input, index) => ({
      id: `${playerId}-${managed.game.round}-${index}`,
      attackerId: playerId,
      targetId: input.targetId,
      coordinate: input.coordinate,
    }));
    return player.orders;
  }

  sealOrders(roomCode: string, playerId: string) {
    const managed = this.requireManaged(roomCode);
    if (managed.game.phase !== "PLANNING") throw new Error("wrong_phase");
    const player = this.requirePlayer(roomCode, playerId);
    if (player.sealed || player.seat.eliminated) throw new Error("orders_locked");
    const opponents = Object.values(managed.game.players)
      .filter((candidate) => candidate.seat.id !== playerId && !candidate.seat.eliminated)
      .map((candidate) => candidate.seat.id);
    if (!validateDistribution(player.orders.map((order) => order.targetId), opponents)) {
      throw new Error("orders_distribution");
    }
    player.sealed = true;
    player.secret.reserveAmmo = 0;
    this.resolveIfReady(managed);
  }

  advanceFromSalvage(roomCode: string) {
    const managed = this.requireManaged(roomCode);
    if (managed.game.phase !== "SALVAGE") return;
    managed.game.round += 1;
    this.beginPlanning(managed);
  }

  restartRoom(roomCode: string, requesterId: string) {
    const managed = this.requireManaged(roomCode);
    if (managed.hostId !== requesterId) throw new Error("host_only");
    if (managed.game.phase !== "FINISHED") throw new Error("wrong_phase");

    managed.game.phase = "LOBBY";
    managed.game.round = 1;
    managed.game.deadlineAt = null;
    managed.game.winnerId = null;
    managed.game.reveal = [];
    managed.game.previousReveal = [];
    managed.game.history = [];
    managed.game.scores = [];
    managed.game.finishReason = null;
    managed.firepower.clear();
    managed.emptySince = null;

    for (const player of Object.values(managed.game.players)) {
      player.secret = { terrain: [], forts: [], ships: [], reserveAmmo: 0 };
      player.intel = [];
      player.orders = [];
      player.sealed = false;
      player.seat.ready = player.seat.kind === "BOT";
      player.seat.eliminated = false;
    }

    return managed.game;
  }

  leaveRoom(roomCode: string, playerId: string) {
    const managed = this.requireManaged(roomCode);
    if (!managed.game.players[playerId]) throw new Error("player_not_found");

    delete managed.game.players[playerId];
    managed.tokens.delete(playerId);
    managed.disconnectedAt.delete(playerId);
    managed.takenOverHumans.delete(playerId);
    managed.firepower.delete(playerId);

    const players = Object.values(managed.game.players);
    if (players.length === 0) {
      this.rooms.delete(managed.game.code);
      return { deleted: true };
    }

    if (managed.hostId === playerId) {
      managed.hostId = (
        players.find((player) => player.seat.kind === "HUMAN") ?? players[0]!
      ).seat.id;
    }

    const activePlayers = players.filter((player) => !player.seat.eliminated);
    if (
      activePlayers.length === 1 &&
      managed.game.phase !== "LOBBY" &&
      managed.game.phase !== "SETUP"
    ) {
      managed.game.winnerId = activePlayers[0]!.seat.id;
      managed.game.phase = "FINISHED";
      managed.game.deadlineAt = null;
      managed.game.finishReason = "ELIMINATION";
      managed.game.scores = calculateScores(managed.game);
    } else if (managed.game.phase === "PLANNING") {
      this.resolveIfReady(managed);
    }

    return { deleted: false };
  }

  disconnect(roomCode: string, playerId: string) {
    const managed = this.requireManaged(roomCode);
    const player = this.requirePlayer(roomCode, playerId);
    player.seat.connected = false;
    managed.disconnectedAt.set(playerId, this.now());
  }

  reconnect(roomCode: string, playerId: string, token: string) {
    const managed = this.requireManaged(roomCode);
    if (managed.tokens.get(playerId) !== token) throw new Error("invalid_session");
    const player = this.requirePlayer(roomCode, playerId);
    player.seat.connected = true;
    if (managed.takenOverHumans.delete(playerId)) {
      player.seat.kind = "HUMAN";
      delete player.seat.botDifficulty;
    }
    managed.disconnectedAt.delete(playerId);
    managed.emptySince = null;
    return this.snapshot(roomCode, playerId);
  }

  tick(): TickResult {
    const now = this.now();
    const result: TickResult = { resolvedRoomCodes: [], updatedRoomCodes: [] };

    for (const [roomCode, managed] of this.rooms) {
      for (const [playerId, disconnectedAt] of managed.disconnectedAt) {
        if (now - disconnectedAt <= 60_000) continue;
        const player = managed.game.players[playerId];
        if (!player || player.seat.kind !== "HUMAN") continue;
        player.seat.kind = "BOT";
        player.seat.botDifficulty = "NORMAL";
        managed.takenOverHumans.add(playerId);
        if (managed.game.phase === "PLANNING" && !player.sealed) {
          this.prepareBotOrders(managed, playerId);
        }
        result.updatedRoomCodes.push(roomCode);
      }

      if (
        managed.game.phase === "PLANNING" &&
        managed.game.deadlineAt !== null &&
        now >= managed.game.deadlineAt
      ) {
        const previousPhase = managed.game.phase;
        for (const player of Object.values(managed.game.players)) {
          if (player.seat.eliminated || player.sealed) continue;
          player.sealed = true;
          player.secret.reserveAmmo = 0;
        }
        this.resolveIfReady(managed);
        if (managed.game.phase !== previousPhase) {
          result.resolvedRoomCodes.push(roomCode);
        } else {
          result.updatedRoomCodes.push(roomCode);
        }
      }

      const connectedHumans = Object.values(managed.game.players).filter(
        (player) => player.seat.kind === "HUMAN" && player.seat.connected,
      );
      if (connectedHumans.length === 0) {
        managed.emptySince ??= now;
        if (now - managed.emptySince > 120_000) this.rooms.delete(roomCode);
      } else {
        managed.emptySince = null;
      }
    }

    return {
      resolvedRoomCodes: [...new Set(result.resolvedRoomCodes)],
      updatedRoomCodes: [...new Set(result.updatedRoomCodes)],
    };
  }

  snapshot(roomCode: string, playerId: string) {
    return buildPlayerSnapshot(this.getRoom(roomCode), playerId);
  }

  getRoom(roomCode: string) {
    return this.requireManaged(roomCode).game;
  }

  private beginPlanning(managed: ManagedRoom) {
    if (managed.game.reveal.length > 0) {
      managed.game.previousReveal = structuredClone(managed.game.reveal);
    }
    managed.game.phase = "PLANNING";
    managed.game.deadlineAt = this.now() + managed.game.settings.planningSeconds * 1_000;
    managed.game.reveal = [];
    managed.firepower.clear();

    for (const [playerId, player] of Object.entries(managed.game.players)) {
      player.orders = [];
      player.sealed = player.seat.eliminated;
      player.seat.ready = false;
      managed.firepower.set(playerId, calculateFirepower(player.secret));
      if (player.seat.kind === "BOT" && !player.seat.eliminated) {
        this.prepareBotOrders(managed, playerId);
      }
    }
    this.resolveIfReady(managed);
  }

  private prepareBotOrders(managed: ManagedRoom, playerId: string) {
    const player = managed.game.players[playerId];
    if (!player) return;
    const opponents = Object.values(managed.game.players)
      .filter((candidate) => candidate.seat.id !== playerId && !candidate.seat.eliminated)
      .map((candidate) => candidate.seat.id);
    player.orders = chooseBotOrders({
      attackerId: playerId,
      difficulty: player.seat.botDifficulty ?? "NORMAL",
      firepower: managed.firepower.get(playerId) ?? calculateFirepower(player.secret),
      opponentIds: opponents,
      intel: player.intel,
    });
    player.secret.reserveAmmo = 0;
    player.sealed = true;
  }

  private resolveIfReady(managed: ManagedRoom) {
    const activePlayers = Object.values(managed.game.players).filter(
      (player) => !player.seat.eliminated,
    );
    if (activePlayers.length > 0 && activePlayers.every((player) => player.sealed)) {
      managed.game.phase = "REVEAL";
      resolveRound(managed.game);
    }
  }

  private requireManaged(roomCode: string) {
    const managed = this.rooms.get(roomCode.toUpperCase());
    if (!managed) throw new Error("room_not_found");
    return managed;
  }

  private requirePlayer(roomCode: string, playerId: string) {
    const player = this.requireManaged(roomCode).game.players[playerId];
    if (!player) throw new Error("player_not_found");
    return player;
  }

  private humanSeat(id: string, name: string): Seat {
    return {
      id,
      name: name.trim().slice(0, 24) || "กัปตันไร้นาม",
      kind: "HUMAN",
      connected: true,
      ready: false,
      eliminated: false,
    };
  }

  private nextBotName(game: GameRoom) {
    const names = [
      "ฉลามขาว",
      "หมึกแดง",
      "คลื่นคราม",
      "วาฬเทา",
      "ปูเสฉวน",
      "กระเบนดำ",
      "โลมาสีเงิน",
      "พายุใต้",
    ];
    const occupied = new Set(
      Object.values(game.players).map((player) => player.seat.name),
    );
    const available = names.filter((name) => !occupied.has(name));
    if (available.length > 0) {
      return available[Math.floor(this.random() * available.length)] ?? available[0]!;
    }
    let suffix = 2;
    while (occupied.has(`ฉลามขาว ${suffix}`)) suffix += 1;
    return `ฉลามขาว ${suffix}`;
  }

  private clampMaxRounds(maxRounds: RoomSettings["maxRounds"]) {
    if (!Number.isFinite(maxRounds)) return 20;
    return Math.min(50, Math.max(1, Math.floor(maxRounds)));
  }

  private uniqueRoomCode() {
    let code = "";
    do {
      code = this.randomId().replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase().padStart(6, "0");
    } while (this.rooms.has(code));
    return code;
  }

  private nextId(prefix: string) {
    return `${prefix}_${this.randomId()}`;
  }
}
