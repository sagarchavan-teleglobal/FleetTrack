// ─────────────────────────────────────────────
// Types aligned with FastAPI backend responses
// ─────────────────────────────────────────────

export type EquipmentType = "tractor" | "crane" | "excavator" | "dumper";
export type EquipmentStatus = "working" | "idle" | "stopped";

export interface Equipment {
  id: string;
  name: string;
  equipment_type: EquipmentType;
  latitude: number;
  longitude: number;
  speed: number;
  engine_on: boolean;
  status: EquipmentStatus;
}

export interface Device {
  device_id: string;
  equipment_id: string;
  connected: boolean;
  last_seen: string | null;
  signal_strength: number;
}

export interface TelemetryRecord {
  id: number;
  equipment_id: string;
  device_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  engine_on: boolean;
  timestamp: string;
  signal_strength: number;
  status: string;
}

export interface UtilizationData {
  working_seconds: number;
  idle_seconds: number;
  offline_seconds: number;
  total_seconds: number;
  uptime_percentage: number;
  utilization_percentage: number;
}

export interface UtilizationResponse {
  equipment_id: string;
  utilization: UtilizationData;
}

// ─────────────────────────────────────────────
// Frontend-derived types (computed from API data)
// ─────────────────────────────────────────────

export interface FleetSummary {
  total: number;
  working: number;
  idle: number;
  stopped: number;
  connectedDevices: number;
  disconnectedDevices: number;
}

// ─────────────────────────────────────────────
// Request payloads
// ─────────────────────────────────────────────

export interface EquipmentCreatePayload {
  id: string;
  name: string;
  equipment_type: EquipmentType;
  latitude: number;
  longitude: number;
}
