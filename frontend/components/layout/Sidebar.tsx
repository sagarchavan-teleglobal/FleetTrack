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
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Equipment", href: "/equipment", icon: Truck },
  { name: "Live Tracking", href: "/tracking", icon: MapPin },
  { name: "Telemetry", href: "/telemetry", icon: Activity },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Devices", href: "/devices", icon: Radio },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-64 border-r border-gray-200 bg-white">
      {/* Logo / Brand */}
      <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
          <Truck className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-semibold text-gray-900">FleetTrack</span>
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
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <item.icon
                className={`h-5 w-5 ${
                  isActive ? "text-blue-700" : "text-gray-400"
                }`}
              />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-gray-200 p-4">
        <div className="text-xs text-gray-500">
          Equipment Tracking POC
          <br />
          <span className="text-gray-400">v0.1.0</span>
        </div>
      </div>
    </aside>
  );
}
