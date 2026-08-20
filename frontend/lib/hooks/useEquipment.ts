"use client";

import { useState, useEffect, useCallback } from "react";
import type { Equipment } from "@/lib/types";
import { getEquipment } from "@/lib/api";

interface UseEquipmentResult {
  equipment: Equipment[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useEquipment(pollInterval = 5000): UseEquipmentResult {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await getEquipment();
      setEquipment(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch equipment"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    const interval = setInterval(fetchData, pollInterval);
    return () => clearInterval(interval);
  }, [fetchData, pollInterval]);

  return { equipment, loading, error, refetch: fetchData };
}
