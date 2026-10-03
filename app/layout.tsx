import type { Metadata } from "next";
import { Instrument_Serif, Spectral } from "next/font/google";
import { Suspense } from "react";
import { FlashToast } from "@/components/FlashToast";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { validateRequest } from "@/lib/auth/session";
import "./globals.css";

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
});

const spectral = Spectral({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-spectral",
});

export const metadata: Metadata = {
  title: "hearth",
  description: "Household coordination",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { user } = await validateRequest();
  const theme = user?.theme ?? "default";
  return (
    <html lang="en" data-theme={theme} className={`${instrument.variable} ${spectral.variable}`}>
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
