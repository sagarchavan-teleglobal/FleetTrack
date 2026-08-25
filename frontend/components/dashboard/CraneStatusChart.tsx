"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { FleetStatusCount } from "@/lib/types";

const LIFECYCLE_COLORS: Record<string, string> = {
  available: "#22c55e",
  booked: "#8b5cf6",
  working: "#3b82f6",
  repair: "#f59e0b",
  deceased: "#6b7280",
};

const LIFECYCLE_LABELS: Record<string, string> = {
  available: "Available",
  booked: "Booked",
  working: "Working",
  repair: "In Repair",
  deceased: "Retired",
};

interface CraneStatusChartProps {
  breakdown: FleetStatusCount[];
}

export default function CraneStatusChart({ breakdown }: CraneStatusChartProps) {
  const data = breakdown
    .filter((item) => item.count > 0)
    .map((item) => ({
      name: LIFECYCLE_LABELS[item.lifecycle_status] || item.lifecycle_status,
      value: item.count,
      color: LIFECYCLE_COLORS[item.lifecycle_status] || "#9ca3af",
    }));

  if (data.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
        No crane data available
      </p>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={90}
            dataKey="value"
            paddingAngle={2}
            label={({ name, value }) => `${name}: ${value}`}
            labelLine={false}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(17, 24, 39, 0.9)",
              border: "none",
              borderRadius: "8px",
              color: "#f9fafb",
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
