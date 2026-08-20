"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import EquipmentMarker from "./EquipmentMarker";
import type { Equipment, Device } from "@/lib/types";
import "leaflet/dist/leaflet.css";

interface FleetMapProps {
  equipment: Equipment[];
  devices: Device[];
  height?: string;
  className?: string;
}

export default function FleetMap({
  equipment,
  devices,
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

  return (
    <div className={`rounded-lg overflow-hidden border border-gray-200 ${className}`} style={{ height }}>
      <MapContainer
        center={center}
        zoom={15}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
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
