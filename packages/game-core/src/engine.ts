import { resolveShot } from "./rules";
import type {
  FinishReason,
  GameRoom,
  PlayerScore,
  PlayerSecretState,
  PublicGameState,
  RevealEntry,
  Seat,
} from "./types";

function emptySecret(): PlayerSecretState {
  return { terrain: [], forts: [], ships: [], reserveAmmo: 0 };
}

export function createGameRoom(code: string, host: Seat): GameRoom {
  return {
    code,
    phase: "LOBBY",
    round: 1,
    settings: { maxSeats: 6, planningSeconds: 90, maxRounds: 20 },
    players: {
      [host.id]: {
        seat: host,
        secret: emptySecret(),
        intel: [],
        orders: [],
        sealed: false,
      },
    },
    deadlineAt: null,
    winnerId: null,
    reveal: [],
    previousReveal: [],
    history: [],
    scores: [],
    finishReason: null,
  };
}

function countRemainingShipCells(secret: PlayerSecretState) {
  return secret.ships.reduce(
    (total, ship) =>
      total + ship.coordinates.filter((coordinate) => !ship.hits.includes(coordinate)).length,
    0,
  );
}

export function calculateScores(room: GameRoom): PlayerScore[] {
  return Object.values(room.players)
    .map((player) => {
      const hits = room.history.filter(
        (entry) =>
          entry.attackerId === player.seat.id &&
          (entry.result === "HIT" || entry.result === "SUNK"),
      ).length;
      const misses = room.history.filter(
        (entry) =>
          entry.attackerId === player.seat.id &&
          (entry.result === "WATER" ||
            entry.result === "LAND_SALVAGED" ||
            entry.result === "WRECK"),
      ).length;
      const remainingShipCells = countRemainingShipCells(player.secret);
      const remainingForts = player.secret.forts.filter((fort) => !fort.destroyed).length;

      return {
        playerId: player.seat.id,
        survived: !player.seat.eliminated,
        remainingShipCells,
        remainingForts,
        hits,
        misses,
        score: remainingShipCells * 10 + remainingForts * 3 + hits * 2 - misses,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.remainingShipCells !== a.remainingShipCells) {
        return b.remainingShipCells - a.remainingShipCells;
      }
      if (b.hits !== a.hits) return b.hits - a.hits;
      if (a.misses !== b.misses) return a.misses - b.misses;
      return a.playerId.localeCompare(b.playerId);
    });
}

export function resolveRound(room: GameRoom): RevealEntry[] {
  const sealedOrders = Object.values(room.players)
    .filter((player) => player.sealed)
    .flatMap((player) => player.orders.map((order) => ({ ...order })));

  const reveal = sealedOrders.flatMap<RevealEntry>((order) => {
    const attacker = room.players[order.attackerId];
    const defender = room.players[order.targetId];
    if (!attacker || !defender) return [];

    const shot = resolveShot(defender.secret, order.coordinate);
    if (shot.result === "HIT" || shot.result === "SUNK") {
      attacker.intel.push({
        targetId: order.targetId,
        coordinate: order.coordinate,
        result: shot.result,
        round: room.round,
      });
    }

    return [{
      ...shot,
      orderId: order.id,
      attackerId: order.attackerId,
      targetId: order.targetId,
    }];
  });

  room.history.push(
    ...reveal.map((entry) => ({
      ...entry,
      round: room.round,
    })),
  );

  for (const player of Object.values(room.players)) {
    if (
      player.secret.ships.length > 0 &&
      player.secret.ships.every((ship) =>
        ship.coordinates.every((coordinate) => ship.hits.includes(coordinate)),
      )
    ) {
      player.seat.eliminated = true;
    }
    player.orders = [];
    player.sealed = false;
  }

  const survivors = Object.values(room.players).filter((player) => !player.seat.eliminated);
  room.winnerId = survivors.length === 1 && Object.keys(room.players).length > 1
    ? survivors[0]!.seat.id
    : null;
  room.scores = calculateScores(room);
  const finishReason: FinishReason = room.winnerId
    ? "ELIMINATION"
    : room.round >= room.settings.maxRounds
      ? "ROUND_LIMIT"
      : null;
  if (finishReason === "ROUND_LIMIT") {
    room.winnerId = room.scores[0]?.playerId ?? null;
  }
  room.finishReason = finishReason;
  room.phase = finishReason ? "FINISHED" : "SALVAGE";
  room.deadlineAt = null;
  room.reveal = reveal;
  return reveal;
}

function publicState(room: GameRoom): PublicGameState {
  return {
    roomCode: room.code,
    phase: room.phase,
    round: room.round,
    seats: Object.values(room.players).map((player) => ({
      ...player.seat,
      sealed: player.sealed,
    })),
    deadlineAt: room.deadlineAt,
    winnerId: room.winnerId,
    settings: { ...room.settings },
    scores: structuredClone(room.scores),
    finishReason: room.finishReason,
  };
}

export function buildPlayerSnapshot(room: GameRoom, playerId: string) {
  const player = room.players[playerId];
  if (!player) throw new Error("player_not_found");

  return {
    public: publicState(room),
    player: {
      self: { ...player.seat },
      secret: structuredClone(player.secret),
      intel: structuredClone(player.intel),
      orders: structuredClone(player.orders),
    },
    reveal: structuredClone(room.reveal),
    previousReveal: structuredClone(room.previousReveal),
    history: structuredClone(room.history),
  };
}

export function buildSpectatorSnapshot(room: GameRoom) {
  return {
    public: publicState(room),
    reveal: structuredClone(room.reveal),
    previousReveal: structuredClone(room.previousReveal),
    history: structuredClone(room.history),
  };
}
