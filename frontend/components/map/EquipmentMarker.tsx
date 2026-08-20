"use client";

import { useEffect, useMemo, useRef } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { Equipment, Device } from "@/lib/types";
import Link from "next/link";

interface EquipmentMarkerProps {
  equipment: Equipment;
  device?: Device;
}

const statusColors: Record<string, string> = {
  working: "#16a34a",
  idle: "#d97706",
  stopped: "#dc2626",
};

function createIcon(status: string) {
  const color = statusColors[status] || "#6b7280";
  const svg = `
    <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 24 16 24s16-12 16-24C32 7.163 24.837 0 16 0z" fill="${color}"/>
      <circle cx="16" cy="16" r="8" fill="white"/>
      <circle cx="16" cy="16" r="5" fill="${color}"/>
    </svg>
  `;

  return L.divIcon({
    html: svg,
    className: "equipment-marker",
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40],
  });
}

export default function EquipmentMarker({ equipment, device }: EquipmentMarkerProps) {
  const markerRef = useRef<L.Marker>(null);
  const icon = useMemo(() => createIcon(equipment.status), [equipment.status]);

  // Smooth marker position update
  useEffect(() => {
    const marker = markerRef.current;
    if (marker) {
      const currentLatLng = marker.getLatLng();
      const targetLatLng = L.latLng(equipment.latitude, equipment.longitude);

      if (
        currentLatLng.lat !== targetLatLng.lat ||
        currentLatLng.lng !== targetLatLng.lng
      ) {
        // Animate position over 1 second
        const startLat = currentLatLng.lat;
        const startLng = currentLatLng.lng;
        const diffLat = targetLatLng.lat - startLat;
        const diffLng = targetLatLng.lng - startLng;
        const duration = 1000;
        const startTime = Date.now();

        const animate = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          // Ease-out cubic
          const eased = 1 - Math.pow(1 - progress, 3);

          const newLat = startLat + diffLat * eased;
          const newLng = startLng + diffLng * eased;
          marker.setLatLng([newLat, newLng]);

          if (progress < 1) {
            requestAnimationFrame(animate);
          }
        };

        requestAnimationFrame(animate);
      }
    }
  }, [equipment.latitude, equipment.longitude]);

  return (
    <Marker
      ref={markerRef}
      position={[equipment.latitude, equipment.longitude]}
      icon={icon}
    >
      <Popup>
        <div className="min-w-[200px] p-1">
          {/* Header */}
          <div className="mb-2 border-b border-gray-100 pb-2">
            <p className="text-sm font-semibold text-gray-900">
              {equipment.name}
            </p>
            <p className="text-xs text-gray-500">{equipment.id}</p>
          </div>

          {/* Details */}
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Type</span>
              <span className="capitalize font-medium text-gray-700">
                {equipment.equipment_type}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <span
                className="font-medium capitalize"
                style={{ color: statusColors[equipment.status] || "#6b7280" }}
              >
                {equipment.status}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Speed</span>
              <span className="font-medium text-gray-700">
                {equipment.speed.toFixed(1)} km/h
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Engine</span>
              <span
                className={`font-medium ${
                  equipment.engine_on ? "text-green-600" : "text-gray-400"
                }`}
              >
                {equipment.engine_on ? "ON" : "OFF"}
              </span>
            </div>
            {device && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-500">GPS</span>
                  <span
                    className={`font-medium ${
                      device.connected ? "text-green-600" : "text-red-500"
                    }`}
                  >
                    {device.connected ? "Connected" : "Disconnected"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Signal</span>
                  <span className="font-medium text-gray-700">
                    {device.signal_strength}%
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Link */}
          <div className="mt-3 border-t border-gray-100 pt-2">
            <Link
              href={`/equipment/${equipment.id}`}
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              View Details →
            </Link>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}
