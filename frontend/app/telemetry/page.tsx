"use client";

import { useState, useMemo } from "react";
import { Activity, Filter, Download } from "lucide-react";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";
import { useEquipment } from "@/lib/hooks/useEquipment";
import { useTelemetry } from "@/lib/hooks/useTelemetry";
import { exportTelemetryCsv } from "@/lib/api";

export default function TelemetryPage() {
  const { equipment, loading: eqLoading } = useEquipment(30000); // slower poll for this page
  const [selectedEquipment, setSelectedEquipment] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { telemetry, loading: telLoading, error: telError, refetch } = useTelemetry(
    selectedEquipment
  );

  // Show most recent first, limited to 100 records
  const filteredTelemetry = useMemo(() => {
    const reversed = [...telemetry].reverse();
    if (statusFilter === "all") return reversed.slice(0, 100);
    return reversed.filter((t) => t.status === statusFilter).slice(0, 100);
  }, [telemetry, statusFilter]);

  // Auto-select first equipment if none selected
  const effectiveEquipment = selectedEquipment || (equipment.length > 0 ? equipment[0].id : null);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Telemetry</h1>
        <p className="mt-1 text-sm text-gray-500">
          Historical GPS and IoT telemetry data
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={selectedEquipment || effectiveEquipment || ""}
            onChange={(e) => setSelectedEquipment(e.target.value || null)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            {eqLoading ? (
              <option>Loading...</option>
            ) : (
              equipment.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name} ({eq.id})
                </option>
              ))
            )}
          </select>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <option value="all">All Status</option>
          <option value="working">Working</option>
          <option value="idle">Idle</option>
          <option value="stopped">Stopped</option>
        </select>

        <span className="text-xs text-gray-500">
          Showing {filteredTelemetry.length} records (latest first)
        </span>

        {(selectedEquipment || effectiveEquipment) && telemetry.length > 0 && (
          <button
            onClick={() => exportTelemetryCsv(selectedEquipment || effectiveEquipment || "")}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        )}
      </div>

      {/* Content */}
      {!effectiveEquipment ? (
        <EmptyState
          title="No equipment"
          message="No equipment registered yet."
        />
      ) : telLoading ? (
        <LoadingState message="Loading telemetry data..." />
      ) : telError ? (
        <ErrorState message={telError} onRetry={refetch} />
      ) : filteredTelemetry.length === 0 ? (
        <EmptyState
          title="No telemetry"
          message="No telemetry records found for the selected equipment and filters."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Timestamp
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Equipment
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Device
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Latitude
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Longitude
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Speed
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Engine
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Signal
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredTelemetry.map((record) => (
                  <tr
                    key={record.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-700">
                      {new Date(record.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-medium text-gray-900">
                      {record.equipment_id}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">
                      {record.device_id}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">
                      {record.latitude.toFixed(6)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">
                      {record.longitude.toFixed(6)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-700">
                      {record.speed.toFixed(1)} km/h
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-xs font-medium ${
                          record.engine_on ? "text-green-600" : "text-gray-400"
                        }`}
                      >
                        {record.engine_on ? "ON" : "OFF"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={record.status} size="sm" />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-10 rounded-full bg-gray-200">
                          <div
                            className={`h-1.5 rounded-full ${
                              record.signal_strength > 70
                                ? "bg-green-500"
                                : record.signal_strength > 40
                                ? "bg-amber-500"
                                : "bg-red-500"
                            }`}
                            style={{ width: `${record.signal_strength}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">
                          {record.signal_strength}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
