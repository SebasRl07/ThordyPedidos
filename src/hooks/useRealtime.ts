import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import type { ChangeEvent } from "../../shared/domain";
/** One socket per signed-in user. Coalesce bursts without reconnecting on filters. */
export function useRealtime(
  userId: number | undefined,
  onChange: (event: ChangeEvent) => void,
  onConnection: (connected: boolean) => void,
  onReconnect: () => void,
) {
  const latest = useRef({ onChange, onConnection, onReconnect });
  latest.current = { onChange, onConnection, onReconnect };
  useEffect(() => {
    if (!userId) return;
    const socket = io();
    const pending = new Map<string, ChangeEvent>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    socket.on("connect", () => {
      latest.current.onConnection(true);
      latest.current.onReconnect();
    });
    socket.on("disconnect", () => latest.current.onConnection(false));
    socket.on("connect_error", () => latest.current.onConnection(false));
    socket.on("changed", (event: ChangeEvent = { resource: "orders" }) => {
      if (event.action === "deleted") {
        latest.current.onChange(event);
        return;
      }
      pending.set(event.resource, event);
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const change of pending.values()) latest.current.onChange(change);
        pending.clear();
      }, 100);
    });
    return () => {
      clearTimeout(timer);
      socket.disconnect();
    };
  }, [userId]);
}
export function useDebounced<T>(value: T, delay = 250) {
  const [state, setState] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setState(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return state;
}
import { useState } from "react";
