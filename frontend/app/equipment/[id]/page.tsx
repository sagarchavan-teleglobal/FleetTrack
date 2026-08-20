"use client";

import { use } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import StatusBadge from "@/components/ui/StatusBadge";

export default function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/equipment"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Equipment
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-gray-900">
          Equipment: {id}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Detailed equipment view with telemetry and utilization
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <p className="text-sm text-gray-500">
          Equipment detail page will be fully implemented in Phase 4.
        </p>
      </div>
    </div>
  );
}
