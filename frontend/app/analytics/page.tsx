"use client";

import { useState, useEffect } from "react";
import {
  BarChart3,
  Clock,
  Activity,
  TrendingUp,
} from "lucide-react";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import EmptyState from "@/components/ui/EmptyState";
import KpiCard from "@/components/dashboard/KpiCard";
import { useEquipment } from "@/lib/hooks/useEquipment";
import { getEquipmentUtilization } from "@/lib/api";
import { formatDuration, formatPercent } from "@/lib/utils";
import type { UtilizationResponse } from "@/lib/types";
import UtilizationDonut from "@/components/analytics/UtilizationDonut";
import EquipmentUtilizationTable from "@/components/analytics/EquipmentUtilizationTable";

export default function AnalyticsPage() {
  const { equipment, loading: eqLoading, error: eqError } = useEquipment(30000);
  const [utilizations, setUtilizations] = useState<UtilizationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (equipment.length === 0) return;

    const fetchAll = async () => {
      setLoading(true);
      const results: UtilizationResponse[] = [];

      for (const eq of equipment) {
        try {
          const data = await getEquipmentUtilization(eq.id);
          results.push(data);
        } catch {
          // Skip equipment without telemetry (404)
        }
      }

      setUtilizations(results);
      setLoading(false);
    };

    fetchAll();
  }, [equipment]);

  if (eqLoading || loading) return <LoadingState message="Loading analytics..." />;
  if (eqError || error) return <ErrorState message={eqError || error || "Failed to load"} />;
  if (utilizations.length === 0)
    return (
      <EmptyState
        title="No analytics data"
        message="No utilization data available. Start the simulator to generate telemetry."
      />
    );

  // Fleet-wide aggregates
  const totalWorking = utilizations.reduce(
    (sum, u) => sum + u.utilization.working_seconds,
    0
  );
  const totalIdle = utilizations.reduce(
    (sum, u) => sum + u.utilization.idle_seconds,
    0
  );
  const totalOffline = utilizations.reduce(
    (sum, u) => sum + u.utilization.offline_seconds,
    0
  );
  const totalSeconds = totalWorking + totalIdle + totalOffline;
  const fleetUptime =
    totalSeconds > 0 ? ((totalWorking + totalIdle) / totalSeconds) * 100 : 0;
  const fleetUtilization =
    totalWorking + totalIdle > 0
      ? (totalWorking / (totalWorking + totalIdle)) * 100
      : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Fleet utilization, uptime, and performance metrics
        </p>
      </div>

      {/* Fleet KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Fleet Utilization"
          value={formatPercent(fleetUtilization)}
          icon={Activity}
          color="green"
          subtitle="Working / engine-on time"
        />
        <KpiCard
          title="Fleet Uptime"
          value={formatPercent(fleetUptime)}
          icon={Clock}
          color="blue"
          subtitle="Engine-on / total time"
        />
        <KpiCard
          title="Total Working Time"
          value={formatDuration(totalWorking)}
          icon={TrendingUp}
          color="green"
        />
        <KpiCard
          title="Total Observed"
          value={formatDuration(totalSeconds)}
          icon={BarChart3}
          color="purple"
        />
      </div>

      {/* Charts Row */}
      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Donut Chart */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-medium text-gray-900">
            Fleet Time Distribution
          </h2>
          <UtilizationDonut
            working={totalWorking}
            idle={totalIdle}
            stopped={totalOffline}
          />
        </div>

        {/* Per-equipment utilization table */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-medium text-gray-900">
            Equipment Utilization
          </h2>
          <EquipmentUtilizationTable
            utilizations={utilizations}
            equipment={equipment}
          />
        </div>
      </div>
    </div>
  );
}
