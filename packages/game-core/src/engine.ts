import { resolveShot } from "./rules";
import type {
  GameRoom,
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
    settings: { maxSeats: 6, planningSeconds: 90 },
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
  };
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
  room.phase = room.winnerId ? "FINISHED" : "SALVAGE";
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
  };
}

export function buildSpectatorSnapshot(room: GameRoom) {
  return {
    public: publicState(room),
    reveal: structuredClone(room.reveal),
    previousReveal: structuredClone(room.previousReveal),
  };
}
