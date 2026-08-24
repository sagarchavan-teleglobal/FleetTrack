"use client";

import { Polyline, CircleMarker, Tooltip } from "react-leaflet";
import type { TelemetryRecord } from "@/lib/types";

interface HistoryTrailProps {
  telemetry: TelemetryRecord[];
  color?: string;
  equipmentName?: string;
}

const statusColors: Record<string, string> = {
  working: "#16a34a",
  idle: "#d97706",
  stopped: "#dc2626",
};

export default function HistoryTrail({
  telemetry,
  color = "#3b82f6",
  equipmentName,
}: HistoryTrailProps) {
  if (telemetry.length < 2) return null;

  // Build positions array from telemetry
  const positions: [number, number][] = telemetry.map((t) => [
    t.latitude,
    t.longitude,
  ]);

  // Show dots at intervals (every 10th point) for visual clarity
  const dotInterval = Math.max(1, Math.floor(telemetry.length / 20));

  return (
    <>
      {/* Main trail polyline */}
      <Polyline
        positions={positions}
        pathOptions={{
          color,
          weight: 3,
          opacity: 0.7,
          lineCap: "round",
          lineJoin: "round",
        }}
      />

      {/* Trail dots showing direction and status */}
      {telemetry
        .filter((_, i) => i % dotInterval === 0)
        .map((point, idx) => (
          <CircleMarker
            key={`trail-dot-${point.id || idx}`}
            center={[point.latitude, point.longitude]}
            radius={4}
            pathOptions={{
              color: statusColors[point.status] || color,
              fillColor: statusColors[point.status] || color,
              fillOpacity: 0.8,
              weight: 1,
            }}
          >
            <Tooltip direction="top" offset={[0, -5]}>
              <div className="text-xs">
                <p className="font-medium">{equipmentName || point.equipment_id}</p>
                <p>{new Date(point.timestamp).toLocaleTimeString()}</p>
                <p className="capitalize">{point.status} • {point.speed.toFixed(1)} km/h</p>
              </div>
            </Tooltip>
          </CircleMarker>
        ))}

      {/* Start marker */}
      <CircleMarker
        center={positions[0]}
        radius={6}
        pathOptions={{
          color: "#6b7280",
          fillColor: "#ffffff",
          fillOpacity: 1,
          weight: 2,
        }}
      >
        <Tooltip direction="top" permanent={false}>
          <span className="text-xs font-medium">Start</span>
        </Tooltip>
      </CircleMarker>
    </>
  );
}
