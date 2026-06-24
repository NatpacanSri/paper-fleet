import type {
  PlayerView,
  PublicGameState,
  RevealEntry,
  RevealHistoryEntry,
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
  history: RevealHistoryEntry[];
}

export interface AckResult {
  ok: boolean;
  error?: string;
  roomCode?: string;
  playerId?: string;
  token?: string;
  snapshot?: GameSnapshot;
}
