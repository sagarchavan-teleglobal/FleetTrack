"use client";

import { useState, useEffect, useCallback } from "react";
import type { TelemetryRecord } from "@/lib/types";
import { getEquipmentTelemetry } from "@/lib/api";

interface UseTelemetryResult {
  telemetry: TelemetryRecord[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTelemetry(equipmentId: string | null): UseTelemetryResult {
  const [telemetry, setTelemetry] = useState<TelemetryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!equipmentId) {
      setTelemetry([]);
      setLoading(false);
      return;
    }

    try {
      const data = await getEquipmentTelemetry(equipmentId);
      setTelemetry(data);
      setError(null);
    } catch (err) {
      // 404 means no telemetry yet — not an error for the UI
      if (err instanceof Error && err.message.includes("404")) {
        setTelemetry([]);
        setError(null);
      } else {
        setError(
          err instanceof Error ? err.message : "Failed to fetch telemetry"
        );
      }
    } finally {
      setLoading(false);
    }
  }, [equipmentId]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  return { telemetry, loading, error, refetch: fetchData };
}
