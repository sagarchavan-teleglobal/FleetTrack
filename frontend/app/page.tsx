"use client";

import {
  Truck,
  Cog,
  PauseCircle,
  StopCircle,
  Wifi,
  WifiOff,
} from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";
import DynamicFleetMap from "@/components/map/DynamicFleetMap";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import { useEquipment } from "@/lib/hooks/useEquipment";
import { useDevices } from "@/lib/hooks/useDevices";
import type { FleetSummary } from "@/lib/types";

function computeFleetSummary(
  equipment: { status: string }[],
  devices: { connected: boolean }[]
): FleetSummary {
  return {
    total: equipment.length,
    working: equipment.filter((e) => e.status === "working").length,
    idle: equipment.filter((e) => e.status === "idle").length,
    stopped: equipment.filter((e) => e.status === "stopped").length,
    connectedDevices: devices.filter((d) => d.connected).length,
    disconnectedDevices: devices.filter((d) => !d.connected).length,
  };
}

export default function DashboardPage() {
  const { equipment, loading: eqLoading, error: eqError, refetch: eqRefetch, wsConnected } = useEquipment();
  const { devices, loading: devLoading, error: devError, refetch: devRefetch } = useDevices();

  const loading = eqLoading || devLoading;
  const error = eqError || devError;

  if (loading) {
    return <LoadingState message="Loading fleet data..." />;
  }

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          eqRefetch();
          devRefetch();
        }}
      />
    );
  }

  const summary = computeFleetSummary(equipment, devices);

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>
        <div className="mt-1 flex items-center gap-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Real-time fleet overview and equipment status
          </p>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
            wsConnected
              ? "bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800"
              : "bg-gray-50 text-gray-500 border border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${wsConnected ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            {wsConnected ? "Live" : "Polling"}
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          title="Total Equipment"
          value={summary.total}
          icon={Truck}
          color="blue"
        />
        <KpiCard
          title="Working"
          value={summary.working}
          icon={Cog}
          color="green"
          subtitle="Engine on, moving"
        />
        <KpiCard
          title="Idle"
          value={summary.idle}
          icon={PauseCircle}
          color="amber"
          subtitle="Engine on, stationary"
        />
        <KpiCard
          title="Stopped"
          value={summary.stopped}
          icon={StopCircle}
          color="red"
          subtitle="Engine off"
        />
        <KpiCard
          title="GPS Connected"
          value={summary.connectedDevices}
          icon={Wifi}
          color="green"
        />
        <KpiCard
          title="GPS Disconnected"
          value={summary.disconnectedDevices}
          icon={WifiOff}
          color="gray"
        />
      </div>

      {/* Live Map */}
      <div className="mt-8">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Live Map</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Real-time equipment locations • Auto-refreshes every 5 seconds
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </div>
          </div>
          <DynamicFleetMap
            equipment={equipment}
            devices={devices}
            height="450px"
          />
        </div>
      </div>
    </div>
  );
}
