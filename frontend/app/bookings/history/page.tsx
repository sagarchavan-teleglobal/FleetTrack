"use client";

import Link from "next/link";
import { ArrowLeft, Calendar } from "lucide-react";
import { useBookings } from "@/lib/hooks/useBookings";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import BookingCard from "@/components/bookings/BookingCard";

export default function BookingHistoryPage() {
  const { bookings, loading, error, refetch } = useBookings();

  if (loading) return <LoadingState message="Loading booking history..." />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const completed = bookings.filter(
    (b) => b.booking_status === "completed" || b.booking_status === "cancelled"
  );

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/bookings"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Bookings
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Booking History</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Completed and cancelled bookings
        </p>
      </div>

      {completed.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-center">
          <Calendar className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            No completed bookings yet
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {completed.map((booking) => (
            <BookingCard key={booking.id} booking={booking} onStatusChange={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}
