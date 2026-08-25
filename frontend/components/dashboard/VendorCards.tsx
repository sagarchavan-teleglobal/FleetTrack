"use client";

import { useState, useEffect } from "react";
import { Phone, Mail, Building2 } from "lucide-react";
import { getVendors } from "@/lib/api";
import type { Vendor } from "@/lib/types";

export default function VendorCards() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getVendors()
      .then(setVendors)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
        ))}
      </div>
    );
  }

  if (vendors.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
        No vendors registered yet
      </p>
    );
  }

  return (
    <div className="space-y-3 max-h-72 overflow-y-auto">
      {vendors.map((vendor) => (
        <div
          key={vendor.id}
          className="rounded-lg border border-gray-100 dark:border-gray-700 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <p className="font-medium text-sm text-gray-900 dark:text-white">
            {vendor.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {vendor.company}
            </span>
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {vendor.phone}
            </span>
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {vendor.email}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
