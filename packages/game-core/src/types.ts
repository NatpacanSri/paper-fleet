export type Row = "A" | "B" | "C" | "D" | "E" | "F";
export type Column = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type Coordinate = `${Row}${Column}`;
export type TerrainCell = Coordinate;

export type GamePhase =
  | "LOBBY"
  | "SETUP"
  | "PLANNING"
  | "REVEAL"
  | "SALVAGE"
  | "FINISHED";

export type BotDifficulty = "EASY" | "NORMAL" | "HARD";
export type ShotResult = "WATER" | "LAND_SALVAGED" | "HIT" | "SUNK" | "WRECK";

export interface Ship {
  id: string;
  coordinates: Coordinate[];
  hits: Coordinate[];
}

export interface Fort {
  id: string;
  coordinate: Coordinate;
  destroyed: boolean;
}

export interface FireOrder {
  id: string;
  attackerId: string;
  targetId: string;
  coordinate: Coordinate;
}

export interface PlayerSecretState {
  terrain: TerrainCell[];
  forts: Fort[];
  ships: Ship[];
  reserveAmmo: number;
}

export interface RoomSettings {
  maxSeats: number;
  planningSeconds: number;
}

export interface Seat {
  id: string;
  name: string;
  kind: "HUMAN" | "BOT";
  botDifficulty?: BotDifficulty;
  connected: boolean;
  ready: boolean;
  eliminated: boolean;
  sealed?: boolean;
}

export interface IntelMark {
  targetId: string;
  coordinate: Coordinate;
  result: Extract<ShotResult, "HIT" | "SUNK">;
  round: number;
}

export interface PlayerView {
  self: Seat;
  secret: PlayerSecretState;
  intel: IntelMark[];
  orders: FireOrder[];
}

export interface PublicGameState {
  roomCode: string;
  phase: GamePhase;
  round: number;
  seats: Seat[];
  deadlineAt: number | null;
  winnerId: string | null;
}

export interface ShotResolution {
  coordinate: Coordinate;
  result: ShotResult;
  shipId?: string;
}

export interface RuntimePlayer {
  seat: Seat;
  secret: PlayerSecretState;
  intel: IntelMark[];
  orders: FireOrder[];
  sealed: boolean;
}

export interface RevealEntry extends ShotResolution {
  orderId: string;
  attackerId: string;
  targetId: string;
}

export interface GameRoom {
  code: string;
  phase: GamePhase;
  round: number;
  settings: RoomSettings;
  players: Record<string, RuntimePlayer>;
  deadlineAt: number | null;
  winnerId: string | null;
  reveal: RevealEntry[];
  previousReveal: RevealEntry[];
}
