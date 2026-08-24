"use client";

import { useState, useEffect, useCallback } from "react";
import { MapPin, Shield, Plus, Trash2, Route, Truck } from "lucide-react";
import DynamicFleetMap from "@/components/map/DynamicFleetMap";
import DynamicHistoryTrail from "@/components/map/DynamicHistoryTrail";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import StatusBadge from "@/components/ui/StatusBadge";
import { useEquipment } from "@/lib/hooks/useEquipment";
import { useDevices } from "@/lib/hooks/useDevices";
import { useGeofences } from "@/lib/hooks/useGeofences";
import { getEquipmentTelemetry } from "@/lib/api";
import type { TelemetryRecord } from "@/lib/types";
import Link from "next/link";

const trailColors: Record<string, string> = {
  "TR-001": "#3b82f6",
  "CR-001": "#8b5cf6",
  "EX-001": "#f59e0b",
  "DM-001": "#ec4899",
};

export default function TrackingPage() {
  const { equipment, loading: eqLoading, error: eqError, refetch: eqRefetch } = useEquipment();
  const { devices, loading: devLoading, error: devError, refetch: devRefetch } = useDevices();
  const { geofences, createGeofence, deleteGeofence } = useGeofences();

  const [showGeofenceForm, setShowGeofenceForm] = useState(false);
  const [geofenceName, setGeofenceName] = useState("");
  const [geofenceCreating, setGeofenceCreating] = useState(false);

  // Trail state
  const [showTrails, setShowTrails] = useState(false);
  const [trails, setTrails] = useState<Record<string, TelemetryRecord[]>>({});
  const [trailsLoading, setTrailsLoading] = useState(false);

  const loading = eqLoading || devLoading;
  const error = eqError || devError;

  // Fetch trails when toggled on
  const fetchTrails = useCallback(async () => {
    if (equipment.length === 0) return;
    setTrailsLoading(true);
    const result: Record<string, TelemetryRecord[]> = {};

    for (const eq of equipment) {
      try {
        const data = await getEquipmentTelemetry(eq.id);
        // Take last 50 points for the trail
        result[eq.id] = data.slice(-50);
      } catch {
        // No telemetry yet
      }
    }

    setTrails(result);
    setTrailsLoading(false);
  }, [equipment]);

  useEffect(() => {
    if (showTrails) {
      fetchTrails();
      const interval = setInterval(fetchTrails, 15000); // refresh trails every 15s
      return () => clearInterval(interval);
    }
  }, [showTrails, fetchTrails]);

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

  const handleCreateGeofence = async () => {
    if (!geofenceName.trim()) return;
    setGeofenceCreating(true);

    const avgLat = equipment.reduce((s, e) => s + e.latitude, 0) / equipment.length;
    const avgLng = equipment.reduce((s, e) => s + e.longitude, 0) / equipment.length;
    const radius = 0.002;
    const polygon = [
      [avgLat + radius, avgLng - radius],
      [avgLat + radius, avgLng + radius],
      [avgLat - radius, avgLng + radius],
      [avgLat - radius, avgLng - radius],
    ];

    try {
      await createGeofence(geofenceName, polygon);
      setGeofenceName("");
      setShowGeofenceForm(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create geofence");
    } finally {
      setGeofenceCreating(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Live Tracking
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Real-time equipment locations and geofence zones
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Trail toggle */}
            <button
              onClick={() => setShowTrails(!showTrails)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                showTrails
                  ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
              }`}
            >
              <Route className="h-4 w-4" />
              {showTrails ? "Hide Trails" : "Show Trails"}
              {trailsLoading && (
                <span className="h-3 w-3 animate-spin rounded-full border border-blue-600 border-t-transparent" />
              )}
            </button>

            <button
              onClick={() => setShowGeofenceForm(!showGeofenceForm)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 transition-colors"
            >
              <Shield className="h-4 w-4" />
              Add Geofence
            </button>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Refreshing every 5s
            </div>
          </div>
        </div>

        {showGeofenceForm && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 p-4">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
              Create Geofence Zone
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-400 mb-3">
              Creates a ~200m rectangular zone centered on the fleet&apos;s current average position.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Zone name (e.g. Construction Site A)"
                value={geofenceName}
                onChange={(e) => setGeofenceName(e.target.value)}
                className="flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              <button
                onClick={handleCreateGeofence}
                disabled={geofenceCreating || !geofenceName.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Plus className="h-4 w-4" />
                {geofenceCreating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        {/* Map */}
        <div className="xl:col-span-3">
          <DynamicFleetMap
            equipment={equipment}
            devices={devices}
            geofences={geofences}
            onDeleteGeofence={deleteGeofence}
            height="650px"
          >
            {showTrails &&
              Object.entries(trails).map(([eqId, telemetry]) => (
                <DynamicHistoryTrail
                  key={`trail-${eqId}`}
                  telemetry={telemetry}
                  color={trailColors[eqId] || "#3b82f6"}
                  equipmentName={equipment.find((e) => e.id === eqId)?.name}
                />
              ))}
          </DynamicFleetMap>
        </div>

        {/* Sidebar */}
        <div className="xl:col-span-1 space-y-4">
          {/* Equipment list */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-100 dark:border-gray-700 px-4 py-3">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                Equipment ({equipment.length})
              </h3>
            </div>
            <div className="max-h-[350px] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700">
              {equipment.map((eq) => (
                <Link
                  key={eq.id}
                  href={`/equipment/${eq.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
                    <Truck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {eq.name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <StatusBadge status={eq.status} size="sm" />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {eq.speed.toFixed(1)} km/h
                      </span>
                    </div>
                  </div>
                  {/* Trail color indicator */}
                  {showTrails && trails[eq.id] && (
                    <span
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: trailColors[eq.id] || "#3b82f6" }}
                    />
                  )}
                </Link>
              ))}
            </div>
          </div>

          {/* Geofences list */}
          {geofences.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="border-b border-gray-100 dark:border-gray-700 px-4 py-3">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                  Geofences ({geofences.length})
                </h3>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-gray-700">
                {geofences.map((gf) => (
                  <div
                    key={gf.id}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {gf.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(gf.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteGeofence(gf.id)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
