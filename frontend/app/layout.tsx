import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "FleetTrack - Equipment Tracking",
  description: "Real-time fleet and equipment tracking dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="ml-64 flex-1">
            <div className="p-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
