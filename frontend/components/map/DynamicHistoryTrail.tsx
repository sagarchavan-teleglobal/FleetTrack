"use client";

import dynamic from "next/dynamic";
import type { TelemetryRecord } from "@/lib/types";

const HistoryTrail = dynamic(() => import("./HistoryTrail"), { ssr: false });

interface DynamicHistoryTrailProps {
  telemetry: TelemetryRecord[];
  color?: string;
  equipmentName?: string;
}

export default function DynamicHistoryTrail(props: DynamicHistoryTrailProps) {
  return <HistoryTrail {...props} />;
}
