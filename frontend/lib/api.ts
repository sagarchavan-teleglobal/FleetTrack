import type {
  Equipment,
  Device,
  TelemetryRecord,
  UtilizationResponse,
  EquipmentCreatePayload,
  Vendor,
  VendorWithCranes,
  VendorCreatePayload,
  CraneSummary,
  Booking,
  BookingWithCrane,
  BookingCreatePayload,
  PaymentResult,
  DashboardSummary,
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

export async function exportTelemetryCsv(equipmentId: string): Promise<void> {
  const url = `${BASE_URL}/equipment/${equipmentId}/telemetry/export`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new ApiError(response.status, "Failed to export telemetry");
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = `${equipmentId}_telemetry.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(downloadUrl);
}

export { ApiError };

// ─────────────────────────────────────────────
// Vendors
// ─────────────────────────────────────────────

export async function getVendors(): Promise<Vendor[]> {
  return fetchApi<Vendor[]>("/vendors");
}

export async function getVendor(id: number): Promise<VendorWithCranes> {
  return fetchApi<VendorWithCranes>(`/vendors/${id}`);
}

export async function createVendor(payload: VendorCreatePayload): Promise<Vendor> {
  return fetchApi<Vendor>("/vendors", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteVendor(id: number): Promise<void> {
  await fetchApi(`/vendors/${id}`, { method: "DELETE" });
}

// ─────────────────────────────────────────────
// Cranes
// ─────────────────────────────────────────────

export async function getCranes(): Promise<CraneSummary[]> {
  return fetchApi<CraneSummary[]>("/cranes");
}

export async function getAvailableCranes(
  startDate: string,
  endDate: string
): Promise<Equipment[]> {
  return fetchApi<Equipment[]>(
    `/cranes/available?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`
  );
}

export async function updateCraneLifecycle(
  craneId: string,
  lifecycleStatus: string
): Promise<Equipment> {
  return fetchApi<Equipment>(`/cranes/${craneId}/lifecycle`, {
    method: "PATCH",
    body: JSON.stringify({ lifecycle_status: lifecycleStatus }),
  });
}

// ─────────────────────────────────────────────
// Bookings
// ─────────────────────────────────────────────

export async function getBookings(params?: {
  status?: string;
  crane_id?: string;
}): Promise<BookingWithCrane[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.crane_id) query.set("crane_id", params.crane_id);
  const qs = query.toString();
  return fetchApi<BookingWithCrane[]>(`/bookings${qs ? `?${qs}` : ""}`);
}

export async function getBooking(id: number): Promise<BookingWithCrane> {
  return fetchApi<BookingWithCrane>(`/bookings/${id}`);
}

export async function createBooking(
  payload: BookingCreatePayload
): Promise<Booking> {
  return fetchApi<Booking>("/bookings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function payBooking(
  bookingId: number,
  simulateFailure = false
): Promise<PaymentResult> {
  return fetchApi<PaymentResult>(`/bookings/${bookingId}/pay`, {
    method: "POST",
    body: JSON.stringify({ method: "card", simulate_failure: simulateFailure }),
  });
}

export async function updateBookingStatus(
  bookingId: number,
  status: string
): Promise<Booking> {
  return fetchApi<Booking>(`/bookings/${bookingId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ booking_status: status }),
  });
}

// ─────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return fetchApi<DashboardSummary>("/dashboard/summary");
}

// ─────────────────────────────────────────────
// Utilization Reports
// ─────────────────────────────────────────────

export interface DailyUtilization {
  date: string;
  working_seconds: number;
  idle_seconds: number;
  offline_seconds: number;
  total_seconds: number;
  uptime_percentage: number;
  utilization_percentage: number;
}

export interface UtilizationReport {
  equipment_id: string;
  equipment_name: string;
  start_date: string;
  end_date: string;
  total_records: number;
  overall: {
    working_seconds: number;
    idle_seconds: number;
    offline_seconds: number;
    total_seconds: number;
    uptime_percentage: number;
    utilization_percentage: number;
  };
  daily: DailyUtilization[];
}

export interface FleetUtilizationReport {
  start_date: string;
  end_date: string;
  cranes: {
    equipment_id: string;
    equipment_name: string;
    lifecycle_status: string;
    total_records: number;
    working_seconds: number;
    idle_seconds: number;
    offline_seconds: number;
    total_seconds: number;
    uptime_percentage: number;
    utilization_percentage: number;
  }[];
}

export async function getUtilizationReport(
  equipmentId: string,
  startDate: string,
  endDate: string
): Promise<UtilizationReport> {
  return fetchApi<UtilizationReport>(
    `/reports/utilization/${equipmentId}?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`
  );
}

export async function getFleetUtilizationReport(
  startDate: string,
  endDate: string
): Promise<FleetUtilizationReport> {
  return fetchApi<FleetUtilizationReport>(
    `/reports/fleet-utilization?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`
  );
}

// ─────────────────────────────────────────────
// Chat / Communication
// ─────────────────────────────────────────────

export interface ChatMessage {
  id: number;
  sender: "user" | "vendor";
  message: string;
  channel: string;
  status: string;
  timestamp: string;
}

export interface SendMessageResponse {
  user_message: ChatMessage;
  vendor_reply: ChatMessage;
}

export interface VoiceCall {
  id: number;
  vendor_id: number;
  vendor_name: string;
  vendor_phone: string;
  direction: string;
  call_status: string;
  duration_seconds: number;
  transcript: string | null;
  summary: string | null;
  external_call_id: string | null;
  initiated_at: string;
  completed_at: string | null;
}

export async function getChatHistory(vendorId: number): Promise<ChatMessage[]> {
  return fetchApi<ChatMessage[]>(`/chat/${vendorId}`);
}

export async function sendChatMessage(
  vendorId: number,
  message: string,
  channel: string = "in_app"
): Promise<SendMessageResponse> {
  return fetchApi<SendMessageResponse>(`/chat/${vendorId}`, {
    method: "POST",
    body: JSON.stringify({ message, channel }),
  });
}

// Discriminated union matching the SSE event payloads emitted by
// POST /chat/{vendorId}/stream. See services/communication.py::stream_message.
export type ChatStreamEvent =
  | { type: "user_message"; message: ChatMessage }
  | { type: "token"; content: string }
  | { type: "done"; vendor_reply: ChatMessage; generated_by: "llm" | "fallback" }
  | { type: "error"; detail: string };

/**
 * Stream a vendor reply token-by-token.
 *
 * `EventSource` only supports GET, so this parses the SSE wire format
 * ("data: {...}\n\n" frames) directly off a POST fetch's ReadableStream.
 *
 * Calls `onEvent` for every parsed event in arrival order. Throws if the
 * network request itself fails (non-2xx or fetch error); mid-stream issues
 * are instead delivered as a `{type: "error"}` event so the caller can
 * decide whether to keep any tokens already rendered.
 */
export async function streamChatMessage(
  vendorId: number,
  message: string,
  channel: string,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${BASE_URL}/chat/${vendorId}/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, channel }),
    signal,
  });

  if (!response.ok || !response.body) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorBody.detail || `Stream request failed with status ${response.status}`
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; a frame may itself be
    // split across chunk boundaries, so only consume complete frames and
    // keep any trailing partial frame in the buffer for the next read.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;

      const jsonText = line.slice(5).trim();
      if (!jsonText) continue;

      try {
        onEvent(JSON.parse(jsonText) as ChatStreamEvent);
      } catch {
        // Malformed frame — skip rather than aborting the whole stream.
      }
    }
  }
}

export async function sendQuickAction(
  vendorId: number,
  action: string
): Promise<SendMessageResponse> {
  return fetchApi<SendMessageResponse>(`/chat/${vendorId}/quick-action`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export async function callVendor(vendorId: number): Promise<VoiceCall> {
  return fetchApi<VoiceCall>(`/voice/call/${vendorId}`, {
    method: "POST",
  });
}

export async function getVoiceCalls(vendorId?: number): Promise<VoiceCall[]> {
  const qs = vendorId ? `?vendor_id=${vendorId}` : "";
  return fetchApi<VoiceCall[]>(`/voice/calls${qs}`);
}

// ─────────────────────────────────────────────
// AI / LLM status
// ─────────────────────────────────────────────

export interface AiStatus {
  provider: string;
  host: string;
  model: string;
  keep_alive: string;
  available: boolean;
}

export async function getAiStatus(): Promise<AiStatus> {
  return fetchApi<AiStatus>("/ai/status");
}

// ─────────────────────────────────────────────
// Payments (Razorpay)
// ─────────────────────────────────────────────

export interface PaymentConfig {
  key_id: string;
  live_mode: boolean;
  currency: string;
}

export interface RazorpayOrder {
  order_id: string;
  amount: number;
  amount_display: number;
  currency: string;
  booking_id: number;
  key_id: string;
  mode: "live" | "demo";
  customer_name: string;
  customer_phone: string;
  description: string;
}

export interface PaymentVerification {
  booking_id: number;
  payment_status: string;
  booking_status: string;
  payment_reference: string;
  amount: number;
  message: string;
  mode: string;
}

export async function getPaymentConfig(): Promise<PaymentConfig> {
  return fetchApi<PaymentConfig>("/payments/config");
}

export async function createPaymentOrder(bookingId: number): Promise<RazorpayOrder> {
  return fetchApi<RazorpayOrder>("/payments/create-order", {
    method: "POST",
    body: JSON.stringify({ booking_id: bookingId }),
  });
}

export async function verifyPayment(data: {
  booking_id: number;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<PaymentVerification> {
  return fetchApi<PaymentVerification>("/payments/verify", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
