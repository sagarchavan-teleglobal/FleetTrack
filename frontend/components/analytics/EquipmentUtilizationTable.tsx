"use client";

import { formatDuration, formatPercent } from "@/lib/utils";
import type { Equipment, UtilizationResponse } from "@/lib/types";
import Link from "next/link";

interface EquipmentUtilizationTableProps {
  utilizations: UtilizationResponse[];
  equipment: Equipment[];
}

export default function EquipmentUtilizationTable({
  utilizations,
  equipment,
}: EquipmentUtilizationTableProps) {
  const eqMap = new Map(equipment.map((eq) => [eq.id, eq]));

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr>
            <th className="pb-2 text-left text-xs font-medium uppercase text-gray-500">
              Equipment
            </th>
            <th className="pb-2 text-left text-xs font-medium uppercase text-gray-500">
              Utilization
            </th>
            <th className="pb-2 text-left text-xs font-medium uppercase text-gray-500">
              Uptime
            </th>
            <th className="pb-2 text-left text-xs font-medium uppercase text-gray-500">
              Working
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {utilizations.map((u) => {
            const eq = eqMap.get(u.equipment_id);
            return (
              <tr key={u.equipment_id} className="hover:bg-gray-50">
                <td className="py-2.5">
                  <Link
                    href={`/equipment/${u.equipment_id}`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    {eq?.name || u.equipment_id}
                  </Link>
                  <p className="text-xs text-gray-500">{u.equipment_id}</p>
                </td>
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-16 rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full bg-green-500"
                        style={{
                          width: `${Math.min(u.utilization.utilization_percentage, 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-700">
                      {formatPercent(u.utilization.utilization_percentage)}
                    </span>
                  </div>
                </td>
                <td className="py-2.5">
                  <span className="text-xs text-gray-700">
                    {formatPercent(u.utilization.uptime_percentage)}
                  </span>
                </td>
                <td className="py-2.5">
                  <span className="text-xs text-gray-600">
                    {formatDuration(u.utilization.working_seconds)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
