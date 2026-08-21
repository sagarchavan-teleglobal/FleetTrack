"use client";

import { useEffect, useRef, useCallback, useState } from "react";

export interface WsTelemetryMessage {
  type: "telemetry";
  equipment_id: string;
  device_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  engine_on: boolean;
  status: string;
  signal_strength: number;
  timestamp: string;
}

interface UseWebSocketOptions {
  onMessage: (data: WsTelemetryMessage) => void;
  enabled?: boolean;
}

/**
 * WebSocket hook for real-time telemetry updates.
 * Automatically reconnects on disconnect with exponential backoff.
 * Falls back gracefully — if WS unavailable, the polling hooks still work.
 */
export function useWebSocket({ onMessage, enabled = true }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    if (!enabled) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const wsUrl = apiUrl.replace(/^http/, "ws") + "/ws/telemetry";

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setConnected(true);
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WsTelemetryMessage;
          if (data.type === "telemetry") {
            onMessage(data);
          }
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;

        // Reconnect with exponential backoff (max 30s)
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current += 1;

        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      // WebSocket not available — polling will handle updates
      setConnected(false);
    }
  }, [enabled, onMessage]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { connected };
}
