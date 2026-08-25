"use client";

import { useState, useRef } from "react";
import { FileDown, BarChart3, Search } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ValueType, NameType } from "recharts/types/component/DefaultTooltipContent";
import { getCranes, getUtilizationReport, getFleetUtilizationReport } from "@/lib/api";

// Recharts Tooltip formatter type helper
const formatHoursTooltip = (value: ValueType | undefined) => `${(Number(value ?? 0) / 3600).toFixed(1)}h`;
const formatPercentTooltip = (value: ValueType | undefined) => `${Number(value ?? 0).toFixed(1)}%`;
import type { CraneSummary } from "@/lib/types";
import type { UtilizationReport, FleetUtilizationReport } from "@/lib/api";
import LoadingState from "@/components/ui/LoadingState";

export default function ReportsPage() {
  const [cranes, setCranes] = useState<CraneSummary[]>([]);
  const [selectedCrane, setSelectedCrane] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cranesLoaded, setCranesLoaded] = useState(false);

  const [report, setReport] = useState<UtilizationReport | null>(null);
  const [fleetReport, setFleetReport] = useState<FleetUtilizationReport | null>(null);

  const reportRef = useRef<HTMLDivElement>(null);

  // Load cranes list on first interaction
  const loadCranes = async () => {
    if (cranesLoaded) return;
    try {
      const data = await getCranes();
      setCranes(data);
      setCranesLoaded(true);
    } catch {}
  };

  const handleGenerate = async () => {
    if (!startDate || !endDate) {
      setError("Please select both start and end dates");
      return;
    }

    setLoading(true);
    setError("");
    setReport(null);
    setFleetReport(null);

    try {
      const start = new Date(startDate).toISOString();
      const end = new Date(endDate).toISOString();

      if (selectedCrane) {
        const data = await getUtilizationReport(selectedCrane, start, end);
        setReport(data);
      } else {
        const data = await getFleetUtilizationReport(start, end);
        setFleetReport(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = async () => {
    if (!reportRef.current) return;

    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");

    const canvas = await html2canvas(reportRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("landscape", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);

    const filename = selectedCrane
      ? `${selectedCrane}_utilization_report.pdf`
      : "fleet_utilization_report.pdf";

    pdf.save(filename);
  };

  const formatHours = (seconds: number) => (seconds / 3600).toFixed(1);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Utilization Reports</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Per-crane or fleet-wide usage reports with date range filtering
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm mb-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Crane (optional — leave empty for fleet report)
            </label>
            <select
              value={selectedCrane}
              onChange={(e) => setSelectedCrane(e.target.value)}
              onFocus={loadCranes}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Cranes (Fleet)</option>
              {cranes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Search className="h-4 w-4" />
              {loading ? "Generating..." : "Generate Report"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      {loading && <LoadingState message="Generating report..." />}

      {/* Report Output */}
      {(report || fleetReport) && (
        <div>
          {/* Export button */}
          <div className="mb-4 flex justify-end">
            <button
              onClick={handleExportPdf}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
            >
              <FileDown className="h-4 w-4" />
              Export PDF
            </button>
          </div>

          <div ref={reportRef} className="space-y-6 bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
            {/* Single Crane Report */}
            {report && (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {report.equipment_name} — Utilization Report
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(report.start_date).toLocaleDateString()} - {new Date(report.end_date).toLocaleDateString()}
                    {" • "}{report.total_records} telemetry records
                  </p>
                </div>

                {/* Overall Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatBox label="Working Hours" value={`${formatHours(report.overall.working_seconds)}h`} color="green" />
                  <StatBox label="Idle Hours" value={`${formatHours(report.overall.idle_seconds)}h`} color="amber" />
                  <StatBox label="Uptime" value={`${report.overall.uptime_percentage}%`} color="blue" />
                  <StatBox label="Utilization" value={`${report.overall.utilization_percentage}%`} color="purple" />
                </div>

                {/* Daily Bar Chart */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Daily Working vs Idle Hours</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={report.daily}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis
                          tickFormatter={(v) => `${(v / 3600).toFixed(0)}h`}
                          tick={{ fontSize: 11 }}
                        />
                        <Tooltip
                          formatter={formatHoursTooltip}
                          contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#f9fafb" }}
                        />
                        <Legend />
                        <Bar dataKey="working_seconds" name="Working" fill="#22c55e" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="idle_seconds" name="Idle" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Utilization Line Chart */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Daily Utilization %</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={report.daily}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                        <Tooltip
                          formatter={formatPercentTooltip}
                          contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#f9fafb" }}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="utilization_percentage" name="Utilization" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="uptime_percentage" name="Uptime" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}

            {/* Fleet Report */}
            {fleetReport && (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Fleet Utilization Report
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(fleetReport.start_date).toLocaleDateString()} - {new Date(fleetReport.end_date).toLocaleDateString()}
                    {" • "}{fleetReport.cranes.length} cranes
                  </p>
                </div>

                {/* Bar Chart: Crane comparison */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Utilization Comparison
                  </h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={fleetReport.cranes}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="equipment_name" tick={{ fontSize: 10 }} angle={-15} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                        <Tooltip
                          formatter={formatPercentTooltip}
                          contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#f9fafb" }}
                        />
                        <Legend />
                        <Bar dataKey="utilization_percentage" name="Utilization %" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="uptime_percentage" name="Uptime %" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="py-2 px-3 text-left font-medium text-gray-700 dark:text-gray-300">Crane</th>
                        <th className="py-2 px-3 text-left font-medium text-gray-700 dark:text-gray-300">Status</th>
                        <th className="py-2 px-3 text-right font-medium text-gray-700 dark:text-gray-300">Working</th>
                        <th className="py-2 px-3 text-right font-medium text-gray-700 dark:text-gray-300">Idle</th>
                        <th className="py-2 px-3 text-right font-medium text-gray-700 dark:text-gray-300">Uptime %</th>
                        <th className="py-2 px-3 text-right font-medium text-gray-700 dark:text-gray-300">Utilization %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fleetReport.cranes.map((c) => (
                        <tr key={c.equipment_id} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-2 px-3 text-gray-900 dark:text-white">{c.equipment_name}</td>
                          <td className="py-2 px-3">
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                              {c.lifecycle_status}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-gray-600 dark:text-gray-400">{formatHours(c.working_seconds)}h</td>
                          <td className="py-2 px-3 text-right text-gray-600 dark:text-gray-400">{formatHours(c.idle_seconds)}h</td>
                          <td className="py-2 px-3 text-right text-gray-600 dark:text-gray-400">{c.uptime_percentage}%</td>
                          <td className="py-2 px-3 text-right font-medium text-gray-900 dark:text-white">{c.utilization_percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  const colorClasses: Record<string, string> = {
    green: "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800",
    amber: "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800",
    blue: "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800",
    purple: "bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800",
  };

  return (
    <div className={`rounded-lg border p-3 ${colorClasses[color] || colorClasses.blue}`}>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-xl font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
