import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import "./globals.css";
import { LangProvider } from "@/components/LangProvider";

export const metadata: Metadata = {
  title: "Afridi Fabrics — Wholesale ERP",
  description: "Production-grade wholesale fabric business ERP: billing, khata, ograi, inventory, accounting.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const stored = jar.get("faberp_lang")?.value || "";
  const code = stored === "ur" || stored === "ps" ? stored : "en";
  const rtl = code !== "en";
  return (
    <html lang={code} dir={rtl ? "rtl" : "ltr"}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&family=Noto+Naskh+Arabic:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-paper text-ink antialiased">
        <LangProvider code={code}>{children}</LangProvider>
      </body>
    </html>
  );
}
