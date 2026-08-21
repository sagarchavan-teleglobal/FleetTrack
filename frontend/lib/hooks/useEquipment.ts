"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Equipment } from "@/lib/types";
import { getEquipment } from "@/lib/api";
import { useWebSocket, type WsTelemetryMessage } from "./useWebSocket";

interface UseEquipmentResult {
  equipment: Equipment[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  wsConnected: boolean;
}

export function useEquipment(pollInterval = 5000): UseEquipmentResult {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const equipmentRef = useRef<Equipment[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const data = await getEquipment();
      setEquipment(data);
      equipmentRef.current = data;
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch equipment"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle WebSocket real-time updates
  const handleWsMessage = useCallback((msg: WsTelemetryMessage) => {
    setEquipment((prev) => {
      const updated = prev.map((eq) => {
        if (eq.id === msg.equipment_id) {
          return {
            ...eq,
            latitude: msg.latitude,
            longitude: msg.longitude,
            speed: msg.speed,
            engine_on: msg.engine_on,
            status: msg.status as Equipment["status"],
          };
        }
        return eq;
      });
      equipmentRef.current = updated;
      return updated;
    });
  }, []);

  const { connected: wsConnected } = useWebSocket({
    onMessage: handleWsMessage,
    enabled: true,
  });

  useEffect(() => {
    fetchData();

    // Use slower polling when WebSocket is connected (just as a sync fallback)
    const interval = setInterval(fetchData, wsConnected ? 30000 : pollInterval);
    return () => clearInterval(interval);
  }, [fetchData, pollInterval, wsConnected]);

  return { equipment, loading, error, refetch: fetchData, wsConnected };
}
