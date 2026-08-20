import type { EquipmentStatus } from "@/lib/types";

interface StatusBadgeProps {
  status: EquipmentStatus | string;
  size?: "sm" | "md";
}

const statusConfig: Record<string, { label: string; className: string }> = {
  working: {
    label: "Working",
    className: "bg-green-50 text-green-700 border-green-200",
  },
  idle: {
    label: "Idle",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  stopped: {
    label: "Stopped",
    className: "bg-red-50 text-red-700 border-red-200",
  },
  connected: {
    label: "Connected",
    className: "bg-green-50 text-green-700 border-green-200",
  },
  disconnected: {
    label: "Disconnected",
    className: "bg-gray-50 text-gray-500 border-gray-200",
  },
};

export default function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status,
    className: "bg-gray-50 text-gray-600 border-gray-200",
  };

  const sizeClass = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${config.className} ${sizeClass}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "working" || status === "connected"
            ? "bg-green-500"
            : status === "idle"
            ? "bg-amber-500"
            : status === "stopped"
            ? "bg-red-500"
            : "bg-gray-400"
        }`}
      />
      {config.label}
    </span>
  );
}
