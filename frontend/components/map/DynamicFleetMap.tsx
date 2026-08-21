"use client";

import dynamic from "next/dynamic";
import type { Equipment, Device } from "@/lib/types";
import type { Geofence } from "@/lib/hooks/useGeofences";

const FleetMap = dynamic(() => import("./FleetMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 h-full min-h-[300px]">
      <div className="text-center">
        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <p className="mt-2 text-sm text-gray-500">Loading map...</p>
      </div>
    </div>
  ),
});

interface DynamicFleetMapProps {
  equipment: Equipment[];
  devices: Device[];
  geofences?: Geofence[];
  onDeleteGeofence?: (id: number) => void;
  height?: string;
  className?: string;
}

export default function DynamicFleetMap(props: DynamicFleetMapProps) {
  return <FleetMap {...props} />;
}
