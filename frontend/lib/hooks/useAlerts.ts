"use client";

import { useState, useEffect, useCallback } from "react";

export interface Alert {
  id: number;
  equipment_id: string;
  alert_type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

export interface AlertCount {
  total: number;
  unacknowledged: number;
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// When the API is reached through an ngrok tunnel, ngrok intercepts
// browser-looking requests and answers with its own HTML warning page -
// using HTTP 200, so `res.ok` is true and `res.json()` then throws. This
// header opts out of that interstitial. `lib/api.ts` sends it on every
// call; these hooks use bare fetch, so they must send it too.
const API_HEADERS = { "ngrok-skip-browser-warning": "true" };

export function useAlerts(pollInterval = 10000) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [count, setCount] = useState<AlertCount>({ total: 0, unacknowledged: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const [alertsRes, countRes] = await Promise.all([
        fetch(`${BASE_URL}/alerts?limit=50`, { headers: API_HEADERS }),
        fetch(`${BASE_URL}/alerts/count`, { headers: API_HEADERS }),
      ]);

      if (alertsRes.ok) {
        const data = await alertsRes.json();
        setAlerts(data);
      }
      if (countRes.ok) {
        const data = await countRes.json();
        setCount(data);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch alerts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, pollInterval);
    return () => clearInterval(interval);
  }, [fetchAlerts, pollInterval]);

  const acknowledgeAlert = useCallback(async (alertId: number) => {
    try {
      await fetch(`${BASE_URL}/alerts/${alertId}/acknowledge`, {
        method: "PATCH",
        headers: API_HEADERS,
      });
      fetchAlerts();
    } catch {}
  }, [fetchAlerts]);

  const acknowledgeAll = useCallback(async () => {
    try {
      await fetch(`${BASE_URL}/alerts/acknowledge-all`, {
        method: "PATCH",
        headers: API_HEADERS,
      });
      fetchAlerts();
    } catch {}
  }, [fetchAlerts]);

  return { alerts, count, loading, error, refetch: fetchAlerts, acknowledgeAlert, acknowledgeAll };
}
