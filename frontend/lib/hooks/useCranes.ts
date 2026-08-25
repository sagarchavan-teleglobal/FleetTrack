"use client";

import { useState, useEffect, useCallback } from "react";
import type { CraneSummary } from "@/lib/types";
import { getCranes } from "@/lib/api";

interface UseCranesResult {
  cranes: CraneSummary[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCranes(pollInterval = 10000): UseCranesResult {
  const [cranes, setCranes] = useState<CraneSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await getCranes();
      setCranes(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch cranes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, pollInterval);
    return () => clearInterval(interval);
  }, [fetchData, pollInterval]);

  return { cranes, loading, error, refetch: fetchData };
}
