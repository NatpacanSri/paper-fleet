import { io } from "socket.io-client";

export const socket = io(
  import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001",
  { autoConnect: false },
);

export function emitAck<T>(event: string, payload: unknown) {
  return new Promise<T>((resolve) => socket.emit(event, payload, resolve));
}
