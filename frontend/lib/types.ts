// ─────────────────────────────────────────────
// Types aligned with FastAPI backend responses
// ─────────────────────────────────────────────

export type EquipmentType = "tractor" | "crane" | "excavator" | "dumper";
export type EquipmentStatus = "working" | "idle" | "stopped";
export type LifecycleStatus = "available" | "booked" | "working" | "repair" | "deceased";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type BookingStatus = "pending" | "confirmed" | "active" | "completed" | "cancelled";

export interface Equipment {
  id: string;
  name: string;
  equipment_type: EquipmentType;
  latitude: number;
  longitude: number;
  speed: number;
  engine_on: boolean;
  status: EquipmentStatus;
  lifecycle_status?: LifecycleStatus;
  vendor_id?: number | null;
  hourly_rate?: number;
}

export interface Vendor {
  id: number;
  name: string;
  phone: string;
  email: string;
  company: string;
  created_at: string;
}

export interface VendorWithCranes extends Vendor {
  crane_count: number;
  cranes: Equipment[];
}

export interface CraneSummary {
  id: string;
  name: string;
  equipment_type: string;
  latitude: number;
  longitude: number;
  speed: number;
  engine_on: boolean;
  status: string;
  lifecycle_status: LifecycleStatus;
  hourly_rate: number;
  vendor: Vendor | null;
  active_booking_id: number | null;
  active_booking_customer: string | null;
}

export interface Booking {
  id: number;
  crane_id: string;
  customer_name: string;
  customer_phone: string | null;
  site_address: string | null;
  start_date: string;
  end_date: string;
  payment_status: PaymentStatus;
  booking_status: BookingStatus;
  amount: number;
  payment_reference: string | null;
  created_at: string;
}

export interface BookingWithCrane extends Booking {
  crane_name: string | null;
  vendor_name: string | null;
}

export interface PaymentResult {
  booking_id: number;
  payment_status: PaymentStatus;
  booking_status: BookingStatus;
  payment_reference: string | null;
  amount: number;
  message: string;
}

export interface FleetStatusCount {
  lifecycle_status: LifecycleStatus;
  count: number;
}

export interface DashboardSummary {
  total_equipment: number;
  total_cranes: number;
  crane_status_breakdown: FleetStatusCount[];
  available_cranes: number;
  booked_cranes: number;
  working_cranes: number;
  repair_cranes: number;
  deceased_cranes: number;
  total_vendors: number;
  active_bookings: number;
  pending_payments: number;
  revenue_collected: number;
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

export interface BookingCreatePayload {
  crane_id: string;
  customer_name: string;
  customer_phone?: string;
  site_address?: string;
  start_date: string;
  end_date: string;
}

export interface VendorCreatePayload {
  name: string;
  phone: string;
  email: string;
  company: string;
}
