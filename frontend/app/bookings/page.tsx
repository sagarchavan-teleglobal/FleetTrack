"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Calendar, Filter, Construction, CalendarCheck, Wrench } from "lucide-react";
import { useBookings } from "@/lib/hooks/useBookings";
import { useDashboard } from "@/lib/hooks/useDashboard";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import BookingCard from "@/components/bookings/BookingCard";
import KpiCard from "@/components/dashboard/KpiCard";

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function BookingsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const { bookings, loading, error, refetch } = useBookings(
    statusFilter ? { status: statusFilter } : undefined
  );
  const { summary, loading: summaryLoading } = useDashboard();

  if (loading) return <LoadingState message="Loading bookings..." />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Crane Bookings</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage crane reservations and payment status
          </p>
        </div>
        <Link
          href="/bookings/new"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          New Booking
        </Link>
      </div>

      {/* Crane & Booking KPIs */}
      {!summaryLoading && summary && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total Cranes"
            value={summary.total_cranes}
            icon={Construction}
            color="blue"
          />
          <KpiCard
            title="Available Cranes"
            value={summary.available_cranes}
            icon={Construction}
            color="green"
            subtitle="Ready for booking"
          />
          <KpiCard
            title="In Repair"
            value={summary.repair_cranes}
            icon={Wrench}
            color="amber"
          />
          <KpiCard
            title="Active Bookings"
            value={summary.active_bookings}
            icon={CalendarCheck}
            color="purple"
          />
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex items-center gap-3">
        <Filter className="h-4 w-4 text-gray-400" />
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === f.value
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bookings List */}
      {bookings.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-center">
          <Calendar className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            No bookings found{statusFilter && ` with status "${statusFilter}"`}
          </p>
          <Link
            href="/bookings/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Create First Booking
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} onStatusChange={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}
