"use client";

import { useState } from "react";
import { Calendar, MapPin, Phone, CreditCard, Construction } from "lucide-react";
import type { BookingWithCrane, BookingStatus, PaymentStatus } from "@/lib/types";
import { createPaymentOrder, verifyPayment, updateBookingStatus } from "@/lib/api";

const BOOKING_STATUS_STYLES: Record<BookingStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  completed: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800",
  paid: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800",
  failed: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
  refunded: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800",
};

interface BookingCardProps {
  booking: BookingWithCrane;
  onStatusChange: () => void;
}

export default function BookingCard({ booking, onStatusChange }: BookingCardProps) {
  const [processing, setProcessing] = useState(false);

  const handlePay = async () => {
    setProcessing(true);
    try {
      const order = await createPaymentOrder(booking.id);

      if (order.mode === "demo") {
        // Demo mode — simulate payment without Razorpay popup
        const demoPaymentId = `pay_demo_${Date.now().toString(36)}`;
        await verifyPayment({
          booking_id: booking.id,
          razorpay_order_id: order.order_id,
          razorpay_payment_id: demoPaymentId,
          razorpay_signature: "demo_signature",
        });
        onStatusChange();
      } else {
        // Live mode — open Razorpay checkout popup
        const options = {
          key: order.key_id,
          amount: order.amount,
          currency: order.currency,
          name: "FleetTrack",
          description: order.description,
          order_id: order.order_id,
          prefill: {
            name: order.customer_name,
            contact: order.customer_phone,
          },
          theme: { color: "#2563eb" },
          handler: async (response: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            try {
              await verifyPayment({
                booking_id: booking.id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              onStatusChange();
            } catch {
              alert("Payment verification failed. Please contact support.");
            } finally {
              setProcessing(false);
            }
          },
          modal: {
            ondismiss: () => {
              setProcessing(false);
            },
          },
        };

        // Load Razorpay script if needed
        if (!(window as unknown as Record<string, unknown>).Razorpay) {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => {
            const rzp = new ((window as unknown as Record<string, unknown>).Razorpay as new (opts: unknown) => { open: () => void })(options);
            rzp.open();
          };
          document.body.appendChild(script);
        } else {
          const rzp = new ((window as unknown as Record<string, unknown>).Razorpay as new (opts: unknown) => { open: () => void })(options);
          rzp.open();
        }
        return; // Don't setProcessing(false) — modal handles it
      }
    } catch {
      alert("Payment failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setProcessing(true);
    try {
      await updateBookingStatus(booking.id, newStatus);
      onStatusChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: Info */}
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <h3 className="font-medium text-gray-900 dark:text-white">
              {booking.customer_name}
            </h3>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${BOOKING_STATUS_STYLES[booking.booking_status]}`}>
              {booking.booking_status}
            </span>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PAYMENT_STATUS_STYLES[booking.payment_status]}`}>
              <CreditCard className="mr-1 h-3 w-3" />
              {booking.payment_status}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1">
              <Construction className="h-3.5 w-3.5" />
              {booking.crane_name || booking.crane_id}
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(booking.start_date)} - {formatDate(booking.end_date)}
            </span>
            {booking.site_address && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {booking.site_address}
              </span>
            )}
            {booking.customer_phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                {booking.customer_phone}
              </span>
            )}
          </div>

          {booking.vendor_name && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Vendor: {booking.vendor_name}
            </p>
          )}
        </div>

        {/* Right: Amount + Actions */}
        <div className="flex flex-col items-end gap-2">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            ₹{booking.amount.toLocaleString("en-IN")}
          </p>

          {booking.payment_reference && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Ref: {booking.payment_reference}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            {booking.booking_status === "pending" && booking.payment_status === "pending" && (
              <button
                onClick={handlePay}
                disabled={processing}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {processing ? "Processing..." : "Pay Now"}
              </button>
            )}
            {booking.booking_status === "confirmed" && (
              <button
                onClick={() => handleStatusChange("active")}
                disabled={processing}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                Start Work
              </button>
            )}
            {booking.booking_status === "active" && (
              <button
                onClick={() => handleStatusChange("completed")}
                disabled={processing}
                className="rounded-lg bg-gray-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                Complete
              </button>
            )}
            {["pending", "confirmed", "active"].includes(booking.booking_status) && (
              <button
                onClick={() => handleStatusChange("cancelled")}
                disabled={processing}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
