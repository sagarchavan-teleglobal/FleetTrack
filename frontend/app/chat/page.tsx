"use client";

import { useState, useEffect, useRef } from "react";
import {
  Send,
  Phone,
  MessageSquare,
  Zap,
  User,
  Building2,
  PhoneCall,
  Clock,
  FileText,
} from "lucide-react";
import {
  getVendors,
  getChatHistory,
  sendChatMessage,
  sendQuickAction,
  callVendor,
  getVoiceCalls,
} from "@/lib/api";
import type { Vendor } from "@/lib/types";
import type { ChatMessage, VoiceCall } from "@/lib/api";
import LoadingState from "@/components/ui/LoadingState";

const QUICK_ACTIONS = [
  { id: "status_update", label: "Ask for Status", icon: Zap },
  { id: "eta", label: "Ask ETA", icon: Clock },
  { id: "maintenance", label: "Schedule Maintenance", icon: FileText },
  { id: "payment_reminder", label: "Payment Reminder", icon: FileText },
];

export default function ChatPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [calling, setCalling] = useState(false);
  const [callResult, setCallResult] = useState<VoiceCall | null>(null);
  const [callHistory, setCallHistory] = useState<VoiceCall[]>([]);
  const [showCallPanel, setShowCallPanel] = useState(false);
  const [loading, setLoading] = useState(true);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load vendors
  useEffect(() => {
    getVendors()
      .then(setVendors)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load chat when vendor changes
  useEffect(() => {
    if (!selectedVendor) return;
    getChatHistory(selectedVendor.id)
      .then(setMessages)
      .catch(() => setMessages([]));
    getVoiceCalls(selectedVendor.id)
      .then(setCallHistory)
      .catch(() => setCallHistory([]));
    setCallResult(null);
    setShowCallPanel(false);
  }, [selectedVendor]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!inputMessage.trim() || !selectedVendor) return;

    setSending(true);
    try {
      const result = await sendChatMessage(selectedVendor.id, inputMessage);
      setMessages((prev) => [...prev, result.user_message, result.vendor_reply]);
      setInputMessage("");
    } catch {}
    setSending(false);
  };

  const handleQuickAction = async (action: string) => {
    if (!selectedVendor) return;

    setSending(true);
    try {
      const result = await sendQuickAction(selectedVendor.id, action);
      setMessages((prev) => [...prev, result.user_message, result.vendor_reply]);
    } catch {}
    setSending(false);
  };

  const handleCall = async () => {
    if (!selectedVendor) return;

    setCalling(true);
    setShowCallPanel(true);
    setCallResult(null);

    try {
      // Simulate ringing delay
      await new Promise((r) => setTimeout(r, 2000));
      const result = await callVendor(selectedVendor.id);
      setCallResult(result);
      setCallHistory((prev) => [result, ...prev]);
    } catch {}
    setCalling(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) return <LoadingState message="Loading vendors..." />;

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-4">
      {/* Vendor List */}
      <div className="w-64 shrink-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-medium text-gray-900 dark:text-white">Vendors</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Select a vendor to chat
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {vendors.map((vendor) => (
            <button
              key={vendor.id}
              onClick={() => setSelectedVendor(vendor)}
              className={`w-full p-3 text-left border-b border-gray-100 dark:border-gray-700 transition-colors ${
                selectedVendor?.id === vendor.id
                  ? "bg-blue-50 dark:bg-blue-900/20"
                  : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
              }`}
            >
              <p className="text-sm font-medium text-gray-900 dark:text-white">{vendor.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{vendor.company}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden flex flex-col">
        {!selectedVendor ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                Select a vendor to start chatting
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">{selectedVendor.name}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedVendor.phone} • {selectedVendor.company}
                </p>
              </div>
              <button
                onClick={handleCall}
                disabled={calling}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <Phone className="h-4 w-4" />
                {calling ? "Calling..." : "Call Vendor"}
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 px-4 py-2 border-b border-gray-100 dark:border-gray-700 overflow-x-auto">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleQuickAction(action.id)}
                  disabled={sending}
                  className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 whitespace-nowrap transition-colors"
                >
                  <action.icon className="h-3 w-3" />
                  {action.label}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
                  No messages yet. Send a message or use a quick action.
                </p>
              )}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 ${
                      msg.sender === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white"
                    }`}
                  >
                    <p className="text-sm">{msg.message}</p>
                    <div className={`mt-1 flex items-center gap-2 text-xs ${
                      msg.sender === "user" ? "text-blue-200" : "text-gray-400 dark:text-gray-500"
                    }`}>
                      <span>{new Date(msg.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                      {msg.channel !== "in_app" && (
                        <span className="uppercase">{msg.channel}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !inputMessage.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Voice Call Panel (Right side) */}
      {showCallPanel && (
        <div className="w-80 shrink-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">Voice Call</h3>
              <button
                onClick={() => setShowCallPanel(false)}
                className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Close
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {calling && !callResult && (
              <div className="text-center py-8">
                <PhoneCall className="mx-auto h-10 w-10 text-green-500 animate-pulse" />
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                  Calling {selectedVendor?.name}...
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {selectedVendor?.phone}
                </p>
              </div>
            )}

            {callResult && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 rounded-full bg-green-100 dark:bg-green-900/30 px-3 py-1 text-sm text-green-700 dark:text-green-300">
                    <Phone className="h-3.5 w-3.5" />
                    Call Completed
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Duration: {callResult.duration_seconds}s • ID: {callResult.external_call_id}
                  </p>
                </div>

                {callResult.summary && (
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">Summary</p>
                    <p className="text-sm text-blue-800 dark:text-blue-200">{callResult.summary}</p>
                  </div>
                )}

                {callResult.transcript && (
                  <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Transcript</p>
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                      {callResult.transcript}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Call History */}
            {callHistory.length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Previous Calls</p>
                <div className="space-y-2">
                  {callHistory.slice(0, 5).map((call) => (
                    <div
                      key={call.id}
                      className="rounded-lg border border-gray-100 dark:border-gray-700 p-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 dark:text-gray-400">
                          {new Date(call.initiated_at).toLocaleDateString("en-IN")}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {call.duration_seconds}s
                        </span>
                      </div>
                      {call.summary && (
                        <p className="mt-1 text-gray-600 dark:text-gray-300 line-clamp-2">
                          {call.summary}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
