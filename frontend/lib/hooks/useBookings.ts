"use client";

import { useState, useEffect, useCallback } from "react";
import type { BookingWithCrane } from "@/lib/types";
import { getBookings } from "@/lib/api";

interface UseBookingsResult {
  bookings: BookingWithCrane[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useBookings(
  params?: { status?: string; crane_id?: string },
  pollInterval = 15000
): UseBookingsResult {
  const [bookings, setBookings] = useState<BookingWithCrane[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await getBookings(params);
      setBookings(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch bookings");
    } finally {
      setLoading(false);
    }
  }, [params?.status, params?.crane_id]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, pollInterval);
    return () => clearInterval(interval);
  }, [fetchData, pollInterval]);

  return { bookings, loading, error, refetch: fetchData };
}
