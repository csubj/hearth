import type { Metadata } from "next";
import { DM_Sans, Lora } from "next/font/google";
import { Suspense } from "react";
import { FlashToast } from "@/components/FlashToast";
import { ToastProvider } from "@/components/ui/ToastProvider";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const dmSerif = Lora({
  subsets: ["latin"],
  variable: "--font-dm-serif",
});

export const metadata: Metadata = {
  title: "hearth",
  description: "Household coordination",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmSerif.variable}`}>
      <body>
        <ToastProvider>
          {children}
          <Suspense fallback={null}>
            <FlashToast />
          </Suspense>
        </ToastProvider>
      </body>
    </html>
  );
}
