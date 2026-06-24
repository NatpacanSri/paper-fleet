import { io } from "socket.io-client";

export function resolveSocketUrl(
  configuredUrl = import.meta.env.VITE_SERVER_URL,
  origin = window.location.origin,
) {
  return configuredUrl || origin;
}

export const socket = io(resolveSocketUrl(), { autoConnect: false });

export function emitAck<T>(event: string, payload: unknown) {
  return new Promise<T>((resolve) => socket.emit(event, payload, resolve));
}
