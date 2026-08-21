"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import EquipmentMarker from "./EquipmentMarker";
import GeofenceLayer from "./GeofenceLayer";
import type { Equipment, Device } from "@/lib/types";
import type { Geofence } from "@/lib/hooks/useGeofences";
import "leaflet/dist/leaflet.css";

interface FleetMapProps {
  equipment: Equipment[];
  devices: Device[];
  geofences?: Geofence[];
  onDeleteGeofence?: (id: number) => void;
  height?: string;
  className?: string;
}

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || "";

export default function FleetMap({
  equipment,
  devices,
  geofences = [],
  onDeleteGeofence,
  height = "400px",
  className = "",
}: FleetMapProps) {
  // Build device lookup
  const deviceMap = useMemo(
    () => new Map(devices.map((d) => [d.equipment_id, d])),
    [devices]
  );

  // Calculate map center from equipment positions
  const center = useMemo((): [number, number] => {
    if (equipment.length === 0) return [18.5204, 73.8567]; // Default: Pune

    const avgLat =
      equipment.reduce((sum, eq) => sum + eq.latitude, 0) / equipment.length;
    const avgLng =
      equipment.reduce((sum, eq) => sum + eq.longitude, 0) / equipment.length;

    return [avgLat, avgLng];
  }, [equipment]);

  // Use MapTiler if key is available, otherwise fall back to OpenStreetMap
  const tileUrl = MAPTILER_KEY
    ? `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  const attribution = MAPTILER_KEY
    ? '&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  return (
    <div className={`rounded-lg overflow-hidden border border-gray-200 ${className}`} style={{ height }}>
      <MapContainer
        center={center}
        zoom={15}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution={attribution}
          url={tileUrl}
          tileSize={512}
          zoomOffset={-1}
        />
        <GeofenceLayer geofences={geofences} onDelete={onDeleteGeofence} />
        {equipment.map((eq) => (
          <EquipmentMarker
            key={eq.id}
            equipment={eq}
            device={deviceMap.get(eq.id)}
          />
        ))}
      </MapContainer>
    </div>
  );
}
