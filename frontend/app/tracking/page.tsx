"use client";

import { useState } from "react";
import { MapPin, Shield, Plus, Trash2 } from "lucide-react";
import DynamicFleetMap from "@/components/map/DynamicFleetMap";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import StatusBadge from "@/components/ui/StatusBadge";
import { useEquipment } from "@/lib/hooks/useEquipment";
import { useDevices } from "@/lib/hooks/useDevices";
import { useGeofences } from "@/lib/hooks/useGeofences";
import { Truck } from "lucide-react";
import Link from "next/link";

export default function TrackingPage() {
  const { equipment, loading: eqLoading, error: eqError, refetch: eqRefetch } = useEquipment();
  const { devices, loading: devLoading, error: devError, refetch: devRefetch } = useDevices();
  const { geofences, createGeofence, deleteGeofence } = useGeofences();

  const [showGeofenceForm, setShowGeofenceForm] = useState(false);
  const [geofenceName, setGeofenceName] = useState("");
  const [geofenceCreating, setGeofenceCreating] = useState(false);

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

  // Create a geofence around current equipment center (demo helper)
  const handleCreateGeofence = async () => {
    if (!geofenceName.trim()) return;
    setGeofenceCreating(true);

    // Create a polygon around the average position of equipment
    const avgLat = equipment.reduce((s, e) => s + e.latitude, 0) / equipment.length;
    const avgLng = equipment.reduce((s, e) => s + e.longitude, 0) / equipment.length;

    const radius = 0.002; // ~200m
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
            <h1 className="text-2xl font-semibold text-gray-900">
              Live Tracking
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Real-time equipment locations and geofence zones
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowGeofenceForm(!showGeofenceForm)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Shield className="h-4 w-4" />
              Add Geofence
            </button>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Refreshing every 5s
            </div>
          </div>
        </div>

        {/* Geofence creation form */}
        {showGeofenceForm && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-medium text-blue-900 mb-2">
              Create Geofence Zone
            </p>
            <p className="text-xs text-blue-700 mb-3">
              Creates a ~200m rectangular zone centered on the fleet&apos;s current average position.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Zone name (e.g. Construction Site A)"
                value={geofenceName}
                onChange={(e) => setGeofenceName(e.target.value)}
                className="flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
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
          />
        </div>

        {/* Sidebar */}
        <div className="xl:col-span-1 space-y-4">
          {/* Equipment list */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-4 py-3">
              <h3 className="text-sm font-medium text-gray-900">
                Equipment ({equipment.length})
              </h3>
            </div>
            <div className="max-h-[350px] overflow-y-auto divide-y divide-gray-50">
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

          {/* Geofences list */}
          {geofences.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-4 py-3">
                <h3 className="text-sm font-medium text-gray-900">
                  Geofences ({geofences.length})
                </h3>
              </div>
              <div className="divide-y divide-gray-50">
                {geofences.map((gf) => (
                  <div
                    key={gf.id}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {gf.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(gf.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteGeofence(gf.id)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
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
