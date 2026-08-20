"use client";

import { useState, useMemo } from "react";
import { Truck, Search, Filter } from "lucide-react";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";
import { useEquipment } from "@/lib/hooks/useEquipment";
import { useDevices } from "@/lib/hooks/useDevices";
import Link from "next/link";
import type { EquipmentStatus, EquipmentType } from "@/lib/types";

export default function EquipmentPage() {
  const { equipment, loading, error, refetch } = useEquipment();
  const { devices } = useDevices();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<EquipmentType | "all">("all");

  // Build device lookup by equipment_id
  const deviceMap = useMemo(
    () => new Map(devices.map((d) => [d.equipment_id, d])),
    [devices]
  );

  // Filter equipment
  const filtered = useMemo(() => {
    return equipment.filter((eq) => {
      const matchesSearch =
        search === "" ||
        eq.name.toLowerCase().includes(search.toLowerCase()) ||
        eq.id.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || eq.status === statusFilter;

      const matchesType =
        typeFilter === "all" || eq.equipment_type === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [equipment, search, statusFilter, typeFilter]);

  if (loading) return <LoadingState message="Loading equipment..." />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Equipment</h1>
        <p className="mt-1 text-sm text-gray-500">
          All registered equipment and their current status
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as EquipmentStatus | "all")}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="all">All Status</option>
            <option value="working">Working</option>
            <option value="idle">Idle</option>
            <option value="stopped">Stopped</option>
          </select>
        </div>

        {/* Type Filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as EquipmentType | "all")}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <option value="all">All Types</option>
          <option value="tractor">Tractor</option>
          <option value="crane">Crane</option>
          <option value="excavator">Excavator</option>
          <option value="dumper">Dumper</option>
        </select>

        {/* Results count */}
        <span className="text-xs text-gray-500">
          {filtered.length} of {equipment.length} equipment
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No matches"
          message="No equipment matches your current filters."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Equipment
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Type
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Speed
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Engine
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  GPS
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Last Seen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((eq) => {
                const device = deviceMap.get(eq.id);
                return (
                  <tr
                    key={eq.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/equipment/${eq.id}`}
                        className="flex items-center gap-3"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                          <Truck className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {eq.name}
                          </p>
                          <p className="text-xs text-gray-500">{eq.id}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm capitalize text-gray-700">
                        {eq.equipment_type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={eq.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-gray-700">
                        {eq.speed.toFixed(1)} km/h
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`text-sm font-medium ${
                          eq.engine_on ? "text-green-600" : "text-gray-400"
                        }`}
                      >
                        {eq.engine_on ? "ON" : "OFF"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {device ? (
                        <StatusBadge
                          status={device.connected ? "connected" : "disconnected"}
                        />
                      ) : (
                        <span className="text-xs text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-gray-500">
                        {device?.last_seen
                          ? new Date(device.last_seen).toLocaleTimeString()
                          : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
