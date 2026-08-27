"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarCheck, CreditCard, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { getAvailableCranes, createBooking, createPaymentOrder, verifyPayment } from "@/lib/api";
import type { Equipment, Booking } from "@/lib/types";
import type { PaymentVerification } from "@/lib/api";

type Step = "dates" | "crane" | "details" | "payment" | "success";

export default function NewBookingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("dates");

  // Form state
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [availableCranes, setAvailableCranes] = useState<Equipment[]>([]);
  const [selectedCrane, setSelectedCrane] = useState<Equipment | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [paymentResult, setPaymentResult] = useState<PaymentVerification | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Find available cranes for date range
  const handleDateSearch = async () => {
    if (!startDate || !endDate) {
      setError("Please select both start and end dates");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const cranes = await getAvailableCranes(
        new Date(startDate).toISOString(),
        new Date(endDate).toISOString()
      );
      setAvailableCranes(cranes);
      setStep("crane");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check availability");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Select a crane
  const handleCraneSelect = (crane: Equipment) => {
    setSelectedCrane(crane);
    setStep("details");
  };

  // Step 3: Submit booking
  const handleCreateBooking = async () => {
    if (!customerName.trim()) {
      setError("Customer name is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await createBooking({
        crane_id: selectedCrane!.id,
        customer_name: customerName,
        customer_phone: customerPhone || undefined,
        site_address: siteAddress || undefined,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
      });
      setBooking(result);
      setStep("payment");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create booking");
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Razorpay checkout
  const handlePayment = async () => {
    if (!booking) return;

    setLoading(true);
    setError("");

    try {
      // Create order on backend
      const order = await createPaymentOrder(booking.id);

      if (order.mode === "demo") {
        // Demo mode: simulate Razorpay checkout without the SDK
        // Generate fake payment credentials that the backend will accept
        const demoPaymentId = `pay_demo_${Date.now().toString(36)}`;

        const result = await verifyPayment({
          booking_id: booking.id,
          razorpay_order_id: order.order_id,
          razorpay_payment_id: demoPaymentId,
          razorpay_signature: "demo_signature",
        });

        setPaymentResult(result);
        setStep("success");
      } else {
        // Live mode: open Razorpay checkout popup
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
            // Verify on backend
            try {
              const result = await verifyPayment({
                booking_id: booking.id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              setPaymentResult(result);
              setStep("success");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Payment verification failed");
            }
          },
          modal: {
            ondismiss: () => {
              setLoading(false);
            },
          },
        };

        // Load Razorpay script if not already loaded
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
        return; // Don't set loading=false — the modal handles it
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/bookings"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Bookings
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Book a Crane</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Select dates, choose an available crane, and confirm your booking
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8 flex items-center gap-2">
        {[
          { key: "dates", label: "Dates" },
          { key: "crane", label: "Select Crane" },
          { key: "details", label: "Details" },
          { key: "payment", label: "Payment" },
          { key: "success", label: "Done" },
        ].map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                step === s.key
                  ? "bg-blue-600 text-white"
                  : ["dates", "crane", "details", "payment", "success"].indexOf(step) >
                    ["dates", "crane", "details", "payment", "success"].indexOf(s.key)
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
              }`}
            >
              {i + 1}
            </div>
            <span className="hidden text-xs text-gray-500 dark:text-gray-400 sm:inline">
              {s.label}
            </span>
            {i < 4 && <div className="h-px w-6 bg-gray-200 dark:bg-gray-700" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Step Content */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
        {/* Step 1: Select Dates */}
        {step === "dates" && (
          <div className="max-w-md space-y-4">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">Select Rental Period</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Start Date
              </label>
              <input
                type="datetime-local"
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
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={handleDateSearch}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Checking..." : "Check Availability"}
            </button>
          </div>
        )}

        {/* Step 2: Select Crane */}
        {step === "crane" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                Available Cranes ({availableCranes.length})
              </h2>
              <button
                onClick={() => setStep("dates")}
                className="text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                Change dates
              </button>
            </div>

            {availableCranes.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                No cranes available for the selected dates. Try different dates.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {availableCranes.map((crane) => (
                  <button
                    key={crane.id}
                    onClick={() => handleCraneSelect(crane)}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-left hover:border-blue-300 hover:bg-blue-50 dark:hover:border-blue-700 dark:hover:bg-blue-900/10 transition-colors"
                  >
                    <p className="font-medium text-gray-900 dark:text-white">{crane.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{crane.id}</p>
                    <p className="mt-2 text-lg font-semibold text-blue-600 dark:text-blue-400">
                      ₹{(crane.hourly_rate || 0).toLocaleString("en-IN")}/hr
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Customer Details */}
        {step === "details" && (
          <div className="max-w-md space-y-4">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">Booking Details</h2>

            {selectedCrane && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3 text-sm">
                <p className="font-medium text-blue-800 dark:text-blue-200">
                  {selectedCrane.name} — ₹{(selectedCrane.hourly_rate || 0).toLocaleString("en-IN")}/hr
                </p>
                <p className="text-blue-600 dark:text-blue-300">
                  {new Date(startDate).toLocaleDateString()} - {new Date(endDate).toLocaleDateString()}
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Customer Name *
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter customer name"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+91-XXXXXXXXXX"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Site Address
              </label>
              <input
                type="text"
                value={siteAddress}
                onChange={(e) => setSiteAddress(e.target.value)}
                placeholder="Construction site address"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("crane")}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCreateBooking}
                disabled={loading}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Creating..." : "Create Booking"}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Payment */}
        {step === "payment" && booking && (
          <div className="max-w-md space-y-4">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">Payment</h2>

            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Booking ID</span>
                <span className="font-medium text-gray-900 dark:text-white">#{booking.id}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Crane</span>
                <span className="font-medium text-gray-900 dark:text-white">{selectedCrane?.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Customer</span>
                <span className="font-medium text-gray-900 dark:text-white">{booking.customer_name}</span>
              </div>
              <hr className="border-gray-200 dark:border-gray-700" />
              <div className="flex justify-between">
                <span className="font-medium text-gray-900 dark:text-white">Total Amount</span>
                <span className="text-xl font-bold text-gray-900 dark:text-white">
                  ₹{booking.amount.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 text-sm text-yellow-700 dark:text-yellow-300">
              <CreditCard className="inline-block h-4 w-4 mr-1" />
              Razorpay integration ready. Currently in demo mode — no real charges. Add API keys to enable live payments.
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => router.push("/bookings")}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Pay Later
              </button>
              <button
                onClick={handlePayment}
                disabled={loading}
                className="flex-1 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Processing..." : `Pay ₹${booking.amount.toLocaleString("en-IN")} via Razorpay`}
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Success */}
        {step === "success" && paymentResult && (
          <div className="max-w-md text-center space-y-4 py-6">
            <CheckCircle2 className="mx-auto h-16 w-16 text-green-500" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Booking Confirmed!</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Payment of ₹{paymentResult.amount.toLocaleString("en-IN")} was successful.
            </p>
            {paymentResult.payment_reference && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Reference: {paymentResult.payment_reference}
              </p>
            )}
            <div className="flex justify-center gap-3 pt-4">
              <Link
                href="/bookings"
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                View All Bookings
              </Link>
              <button
                onClick={() => {
                  setStep("dates");
                  setBooking(null);
                  setPaymentResult(null);
                  setSelectedCrane(null);
                  setCustomerName("");
                  setCustomerPhone("");
                  setSiteAddress("");
                  setStartDate("");
                  setEndDate("");
                }}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                New Booking
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
