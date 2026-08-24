"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Truck,
  MapPin,
  Activity,
  BarChart3,
  Radio,
  Bell,
  Moon,
  Sun,
} from "lucide-react";
import { useAlerts } from "@/lib/hooks/useAlerts";
import { useTheme } from "@/components/layout/ThemeProvider";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Equipment", href: "/equipment", icon: Truck },
  { name: "Live Tracking", href: "/tracking", icon: MapPin },
  { name: "Telemetry", href: "/telemetry", icon: Activity },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Alerts", href: "/alerts", icon: Bell },
  { name: "Devices", href: "/devices", icon: Radio },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { count } = useAlerts(10000);
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-64 border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      {/* Logo / Brand */}
      <div className="flex h-16 items-center gap-2 border-b border-gray-200 dark:border-gray-700 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
          <Truck className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-semibold text-gray-900 dark:text-white">FleetTrack</span>
      </div>

      {/* Navigation */}
      <nav className="mt-4 space-y-1 px-3">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
              }`}
            >
              <item.icon
                className={`h-5 w-5 ${
                  isActive ? "text-blue-700 dark:text-blue-300" : "text-gray-400 dark:text-gray-500"
                }`}
              />
              {item.name}
              {item.name === "Alerts" && count.unacknowledged > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-medium text-white">
                  {count.unacknowledged > 99 ? "99+" : count.unacknowledged}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer with theme toggle */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Equipment Tracking POC
            <br />
            <span className="text-gray-400 dark:text-gray-500">v0.3.0</span>
          </div>
          <button
            onClick={toggleTheme}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white transition-colors"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
