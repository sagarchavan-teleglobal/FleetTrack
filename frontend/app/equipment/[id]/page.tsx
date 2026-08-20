"use client";

import { use, useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Gauge,
  Power,
  Wifi,
  Signal,
  Clock,
  Activity,
} from "lucide-react";
import Link from "next/link";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";
import KpiCard from "@/components/dashboard/KpiCard";
import DynamicFleetMap from "@/components/map/DynamicFleetMap";
import { getEquipmentById } from "@/lib/api";
import { useTelemetry } from "@/lib/hooks/useTelemetry";
import { useUtilization } from "@/lib/hooks/useUtilization";
import { useDevices } from "@/lib/hooks/useDevices";
import { formatDuration, formatPercent } from "@/lib/utils";
import type { Equipment } from "@/lib/types";

export default function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { devices } = useDevices(10000);
  const { telemetry, loading: telLoading } = useTelemetry(id);
  const { utilization, loading: utilLoading } = useUtilization(id);

  const fetchEquipment = useCallback(async () => {
    try {
      const data = await getEquipmentById(id);
      setEquipment(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch equipment"
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEquipment();
    const interval = setInterval(fetchEquipment, 5000);
    return () => clearInterval(interval);
  }, [fetchEquipment]);

  if (loading) return <LoadingState message="Loading equipment details..." />;
  if (error) return <ErrorState message={error} onRetry={fetchEquipment} />;
  if (!equipment)
    return <EmptyState title="Not found" message="Equipment does not exist." />;

  const device = devices.find((d) => d.equipment_id === id);
  const recentTelemetry = [...telemetry].reverse().slice(0, 20);

  return (
    <div>
      {/* Back link + header */}
      <div className="mb-6">
        <Link
          href="/equipment"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Equipment
        </Link>

        <div className="mt-3 flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {equipment.name}
            </h1>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-sm text-gray-500">{equipment.id}</span>
              <span className="text-sm capitalize text-gray-500">
                {equipment.equipment_type}
              </span>
              <StatusBadge status={equipment.status} size="md" />
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          title="Speed"
          value={`${equipment.speed.toFixed(1)} km/h`}
          icon={Gauge}
          color="blue"
        />
        <KpiCard
          title="Engine"
          value={equipment.engine_on ? "ON" : "OFF"}
          icon={Power}
          color={equipment.engine_on ? "green" : "red"}
        />
        <KpiCard
          title="GPS"
          value={device?.connected ? "Connected" : "Disconnected"}
          icon={Wifi}
          color={device?.connected ? "green" : "gray"}
        />
        <KpiCard
          title="Signal"
          value={device ? `${device.signal_strength}%` : "N/A"}
          icon={Signal}
          color="purple"
        />
        <KpiCard
          title="Uptime"
          value={
            utilization
              ? formatPercent(utilization.utilization.uptime_percentage)
              : "—"
          }
          icon={Clock}
          color="blue"
          subtitle="Engine running time"
        />
        <KpiCard
          title="Utilization"
          value={
            utilization
              ? formatPercent(utilization.utilization.utilization_percentage)
              : "—"
          }
          icon={Activity}
          color="green"
          subtitle="Productive time"
        />
      </div>

      {/* Map + Utilization */}
      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Current position map */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-gray-900">
            Current Position
          </h2>
          <DynamicFleetMap
            equipment={[equipment]}
            devices={device ? [device] : []}
            height="280px"
          />
          <div className="mt-3 flex gap-4 text-xs text-gray-500">
            <span>Lat: {equipment.latitude.toFixed(6)}</span>
            <span>Lng: {equipment.longitude.toFixed(6)}</span>
          </div>
        </div>

        {/* Utilization breakdown */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-medium text-gray-900">
            Utilization Breakdown
          </h2>
          {utilLoading ? (
            <LoadingState message="Loading utilization..." />
          ) : utilization ? (
            <div className="space-y-4">
              {/* Progress bars */}
              <UtilizationBar
                label="Working"
                seconds={utilization.utilization.working_seconds}
                total={utilization.utilization.total_seconds}
                color="bg-green-500"
              />
              <UtilizationBar
                label="Idle"
                seconds={utilization.utilization.idle_seconds}
                total={utilization.utilization.total_seconds}
                color="bg-amber-500"
              />
              <UtilizationBar
                label="Stopped"
                seconds={utilization.utilization.offline_seconds}
                total={utilization.utilization.total_seconds}
                color="bg-red-500"
              />

              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
                <div>
                  <p className="text-xs text-gray-500">Total Observed</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatDuration(utilization.utilization.total_seconds)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Uptime</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatPercent(utilization.utilization.uptime_percentage)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Utilization</p>
                  <p className="text-sm font-medium text-green-700">
                    {formatPercent(
                      utilization.utilization.utilization_percentage
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Working Time</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatDuration(utilization.utilization.working_seconds)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No data"
              message="No utilization data available yet."
            />
          )}
        </div>
      </div>

      {/* Telemetry Table */}
      <div className="mt-8">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-medium text-gray-900">
              Recent Telemetry
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Last {recentTelemetry.length} packets
            </p>
          </div>

          {telLoading ? (
            <LoadingState message="Loading telemetry..." />
          ) : recentTelemetry.length === 0 ? (
            <EmptyState
              title="No telemetry"
              message="No telemetry data has been received for this equipment."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                      Timestamp
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                      Latitude
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                      Longitude
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                      Speed
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                      Engine
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                      Signal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentTelemetry.map((record) => (
                    <tr
                      key={record.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-2.5 text-xs text-gray-700">
                        {new Date(record.timestamp).toLocaleString()}
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
                            record.engine_on
                              ? "text-green-600"
                              : "text-gray-400"
                          }`}
                        >
                          {record.engine_on ? "ON" : "OFF"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={record.status} size="sm" />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">
                        {record.signal_strength}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Utilization bar component
// ─────────────────────────────────────────────

function UtilizationBar({
  label,
  seconds,
  total,
  color,
}: {
  label: string;
  seconds: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? (seconds / total) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600">{label}</span>
        <span className="text-gray-500">
          {formatDuration(seconds)} ({percentage.toFixed(1)}%)
        </span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
        <div
          className={`h-2 rounded-full ${color} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
