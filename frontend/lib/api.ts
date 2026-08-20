import type {
  Equipment,
  Device,
  TelemetryRecord,
  UtilizationResponse,
  EquipmentCreatePayload,
} from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─────────────────────────────────────────────
// Generic fetch wrapper with error handling
// ─────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorBody.detail || `Request failed with status ${response.status}`
    );
  }

  return response.json();
}

// ─────────────────────────────────────────────
// Equipment endpoints
// ─────────────────────────────────────────────

export async function getEquipment(): Promise<Equipment[]> {
  return fetchApi<Equipment[]>("/equipment");
}

export async function getEquipmentById(id: string): Promise<Equipment> {
  return fetchApi<Equipment>(`/equipment/${id}`);
}

export async function createEquipment(
  payload: EquipmentCreatePayload
): Promise<Equipment> {
  return fetchApi<Equipment>("/equipment", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteEquipment(id: string): Promise<void> {
  await fetchApi(`/equipment/${id}`, { method: "DELETE" });
}

// ─────────────────────────────────────────────
// Telemetry endpoints
// ─────────────────────────────────────────────

export async function getEquipmentTelemetry(
  equipmentId: string
): Promise<TelemetryRecord[]> {
  return fetchApi<TelemetryRecord[]>(`/equipment/${equipmentId}/telemetry`);
}

// ─────────────────────────────────────────────
// Utilization endpoints
// ─────────────────────────────────────────────

export async function getEquipmentUtilization(
  equipmentId: string
): Promise<UtilizationResponse> {
  return fetchApi<UtilizationResponse>(`/equipment/${equipmentId}/utilization`);
}

// ─────────────────────────────────────────────
// Device endpoints
// ─────────────────────────────────────────────

export async function getDevices(): Promise<Device[]> {
  return fetchApi<Device[]>("/devices");
}

export async function getDeviceById(deviceId: string): Promise<Device> {
  return fetchApi<Device>(`/devices/${deviceId}`);
}

export async function createDevice(
  deviceId: string,
  equipmentId: string
): Promise<Device> {
  return fetchApi<Device>("/devices", {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId, equipment_id: equipmentId }),
  });
}

export { ApiError };
