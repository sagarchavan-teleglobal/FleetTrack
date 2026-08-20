"use client";

import { Wifi, WifiOff } from "lucide-react";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";
import { useDevices } from "@/lib/hooks/useDevices";

export default function DevicesPage() {
  const { devices, loading, error, refetch } = useDevices();

  if (loading) return <LoadingState message="Loading devices..." />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (devices.length === 0)
    return <EmptyState title="No devices" message="No GPS devices have been registered." />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Devices</h1>
        <p className="mt-1 text-sm text-gray-500">
          GPS/IoT device connectivity and signal status
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Device ID
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Equipment
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Connection
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Signal Strength
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Last Seen
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {devices.map((device) => (
              <tr key={device.device_id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    {device.connected ? (
                      <Wifi className="h-4 w-4 text-green-500" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-gray-400" />
                    )}
                    <span className="text-sm font-medium text-gray-900">
                      {device.device_id}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <span className="text-sm text-gray-700">
                    {device.equipment_id}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <StatusBadge
                    status={device.connected ? "connected" : "disconnected"}
                  />
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 rounded-full bg-gray-200">
                      <div
                        className={`h-1.5 rounded-full ${
                          device.signal_strength > 70
                            ? "bg-green-500"
                            : device.signal_strength > 40
                            ? "bg-amber-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${device.signal_strength}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">
                      {device.signal_strength}%
                    </span>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <span className="text-sm text-gray-500">
                    {device.last_seen
                      ? new Date(device.last_seen).toLocaleString()
                      : "Never"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
