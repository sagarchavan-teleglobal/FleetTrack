"use client";

import { Activity } from "lucide-react";

export default function TelemetryPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Telemetry</h1>
        <p className="mt-1 text-sm text-gray-500">
          Historical GPS and IoT telemetry data
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex h-96 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
          <div className="text-center">
            <Activity className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">
              Telemetry history with filters will be implemented in Phase 4
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
