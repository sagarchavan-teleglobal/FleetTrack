"use client";

import DynamicFleetMap from "@/components/map/DynamicFleetMap";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import StatusBadge from "@/components/ui/StatusBadge";
import { useEquipment } from "@/lib/hooks/useEquipment";
import { useDevices } from "@/lib/hooks/useDevices";
import { Truck } from "lucide-react";
import Link from "next/link";

export default function TrackingPage() {
  const { equipment, loading: eqLoading, error: eqError, refetch: eqRefetch } = useEquipment();
  const { devices, loading: devLoading, error: devError, refetch: devRefetch } = useDevices();

  const loading = eqLoading || devLoading;
  const error = eqError || devError;

  if (loading) return <LoadingState message="Loading fleet data..." />;
  if (error)
    return (
      <ErrorState
        message={error || "Failed to load data"}
        onRetry={() => {
          eqRefetch();
          devRefetch();
        }}
      />
    );

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Live Tracking
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Real-time equipment locations on the map
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Refreshing every 5s
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        {/* Map */}
        <div className="xl:col-span-3">
          <DynamicFleetMap
            equipment={equipment}
            devices={devices}
            height="650px"
          />
        </div>

        {/* Equipment sidebar list */}
        <div className="xl:col-span-1">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-4 py-3">
              <h3 className="text-sm font-medium text-gray-900">
                Equipment ({equipment.length})
              </h3>
            </div>
            <div className="max-h-[600px] overflow-y-auto divide-y divide-gray-50">
              {equipment.map((eq) => (
                <Link
                  key={eq.id}
                  href={`/equipment/${eq.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50">
                    <Truck className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {eq.name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <StatusBadge status={eq.status} size="sm" />
                      <span className="text-xs text-gray-500">
                        {eq.speed.toFixed(1)} km/h
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
