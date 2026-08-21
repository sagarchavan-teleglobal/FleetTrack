"use client";

import { Bell, CheckCircle, AlertTriangle, AlertOctagon, Info, CheckCheck } from "lucide-react";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import EmptyState from "@/components/ui/EmptyState";
import { useAlerts } from "@/lib/hooks/useAlerts";

const severityConfig = {
  critical: {
    icon: AlertOctagon,
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    badge: "bg-red-100 text-red-700",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    badge: "bg-amber-100 text-amber-700",
  },
  info: {
    icon: Info,
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    badge: "bg-blue-100 text-blue-700",
  },
};

const alertTypeLabels: Record<string, string> = {
  low_signal: "Low Signal",
  overspeed: "Overspeed",
  device_disconnected: "Device Disconnected",
  device_reconnected: "Device Reconnected",
  geofence_breach: "Geofence Breach",
};

export default function AlertsPage() {
  const { alerts, count, loading, error, refetch, acknowledgeAlert, acknowledgeAll } = useAlerts(5000);

  if (loading) return <LoadingState message="Loading alerts..." />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Alerts</h1>
          <p className="mt-1 text-sm text-gray-500">
            {count.unacknowledged} unacknowledged of {count.total} total alerts
          </p>
        </div>
        {count.unacknowledged > 0 && (
          <button
            onClick={acknowledgeAll}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <CheckCheck className="h-4 w-4" />
            Acknowledge All
          </button>
        )}
      </div>

      {alerts.length === 0 ? (
        <EmptyState
          title="No alerts"
          message="No alerts have been triggered yet. Alerts are generated automatically from telemetry data."
        />
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const config = severityConfig[alert.severity] || severityConfig.info;
            const Icon = config.icon;

            return (
              <div
                key={alert.id}
                className={`rounded-xl border p-4 ${
                  alert.acknowledged
                    ? "border-gray-100 bg-gray-50 opacity-60"
                    : `${config.border} ${config.bg}`
                } transition-all`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 rounded-lg p-1.5 ${alert.acknowledged ? "bg-gray-200" : config.badge}`}>
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${alert.acknowledged ? "text-gray-500" : config.text}`}>
                        {alertTypeLabels[alert.alert_type] || alert.alert_type}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${alert.acknowledged ? "bg-gray-200 text-gray-500" : config.badge}`}>
                        {alert.severity}
                      </span>
                      <span className="text-xs text-gray-500">
                        {alert.equipment_id}
                      </span>
                    </div>
                    <p className={`mt-1 text-sm ${alert.acknowledged ? "text-gray-400" : "text-gray-700"}`}>
                      {alert.message}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      {new Date(alert.timestamp).toLocaleString()}
                    </p>
                  </div>

                  {!alert.acknowledged && (
                    <button
                      onClick={() => acknowledgeAlert(alert.id)}
                      className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-green-600 transition-colors"
                      title="Acknowledge"
                    >
                      <CheckCircle className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
