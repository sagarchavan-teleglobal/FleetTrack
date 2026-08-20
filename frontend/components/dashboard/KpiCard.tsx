import { type LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color: "blue" | "green" | "amber" | "red" | "gray" | "purple";
  subtitle?: string;
}

const colorMap = {
  blue: {
    bg: "bg-blue-50",
    icon: "text-blue-600",
    border: "border-blue-100",
  },
  green: {
    bg: "bg-green-50",
    icon: "text-green-600",
    border: "border-green-100",
  },
  amber: {
    bg: "bg-amber-50",
    icon: "text-amber-600",
    border: "border-amber-100",
  },
  red: {
    bg: "bg-red-50",
    icon: "text-red-600",
    border: "border-red-100",
  },
  gray: {
    bg: "bg-gray-50",
    icon: "text-gray-600",
    border: "border-gray-100",
  },
  purple: {
    bg: "bg-purple-50",
    icon: "text-purple-600",
    border: "border-purple-100",
  },
};

export default function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
}: KpiCardProps) {
  const colors = colorMap[color];

  return (
    <div className={`rounded-xl border ${colors.border} bg-white p-5 shadow-sm`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>
          )}
        </div>
        <div className={`rounded-lg ${colors.bg} p-2.5`}>
          <Icon className={`h-5 w-5 ${colors.icon}`} />
        </div>
      </div>
    </div>
  );
}
