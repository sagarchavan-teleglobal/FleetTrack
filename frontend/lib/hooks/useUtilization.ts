"use client";

import { useState, useEffect, useCallback } from "react";
import type { UtilizationResponse } from "@/lib/types";
import { getEquipmentUtilization } from "@/lib/api";

interface UseUtilizationResult {
  utilization: UtilizationResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useUtilization(equipmentId: string | null): UseUtilizationResult {
  const [utilization, setUtilization] = useState<UtilizationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!equipmentId) {
      setUtilization(null);
      setLoading(false);
      return;
    }

    try {
      const data = await getEquipmentUtilization(equipmentId);
      setUtilization(data);
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) {
        setUtilization(null);
        setError(null);
      } else {
        setError(
          err instanceof Error ? err.message : "Failed to fetch utilization"
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

  return { utilization, loading, error, refetch: fetchData };
}
