import type {
  PlayerView,
  PublicGameState,
  RevealEntry,
} from "@paper-fleet/game-core";

export interface Session {
  roomCode: string;
  playerId: string;
  token: string;
  isHost: boolean;
}

export interface GameSnapshot {
  public: PublicGameState;
  player: PlayerView;
  reveal: RevealEntry[];
  previousReveal: RevealEntry[];
}

export interface AckResult {
  ok: boolean;
  error?: string;
  roomCode?: string;
  playerId?: string;
  token?: string;
  snapshot?: GameSnapshot;
}
