"use client";

import { useState, useEffect, useCallback } from "react";

export interface Geofence {
  id: number;
  name: string;
  polygon: string; // JSON string: [[lat,lng], ...]
  created_at: string;
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useGeofences() {
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGeofences = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/geofences`);
      if (res.ok) {
        const data = await res.json();
        setGeofences(data);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch geofences");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGeofences();
  }, [fetchGeofences]);

  const createGeofence = useCallback(async (name: string, polygon: number[][]) => {
    const polygonStr = JSON.stringify(polygon);
    const res = await fetch(
      `${BASE_URL}/geofences?name=${encodeURIComponent(name)}&polygon=${encodeURIComponent(polygonStr)}`,
      { method: "POST" }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || "Failed to create geofence");
    }
    fetchGeofences();
  }, [fetchGeofences]);

  const deleteGeofence = useCallback(async (id: number) => {
    await fetch(`${BASE_URL}/geofences/${id}`, { method: "DELETE" });
    fetchGeofences();
  }, [fetchGeofences]);

  return { geofences, loading, error, createGeofence, deleteGeofence, refetch: fetchGeofences };
}
