"use client";

import { Polygon, Popup } from "react-leaflet";
import type { Geofence } from "@/lib/hooks/useGeofences";

interface GeofenceLayerProps {
  geofences: Geofence[];
  onDelete?: (id: number) => void;
}

export default function GeofenceLayer({ geofences, onDelete }: GeofenceLayerProps) {
  return (
    <>
      {geofences.map((gf) => {
        let positions: [number, number][] = [];
        try {
          positions = JSON.parse(gf.polygon);
        } catch {
          return null;
        }

        if (positions.length < 3) return null;

        return (
          <Polygon
            key={gf.id}
            positions={positions}
            pathOptions={{
              color: "#3b82f6",
              fillColor: "#3b82f6",
              fillOpacity: 0.1,
              weight: 2,
              dashArray: "5, 5",
            }}
          >
            <Popup>
              <div className="min-w-[150px]">
                <p className="text-sm font-semibold text-gray-900">{gf.name}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {positions.length} points
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Created: {new Date(gf.created_at).toLocaleDateString()}
                </p>
                {onDelete && (
                  <button
                    onClick={() => onDelete(gf.id)}
                    className="mt-2 text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    Delete Zone
                  </button>
                )}
              </div>
            </Popup>
          </Polygon>
        );
      })}
    </>
  );
}
