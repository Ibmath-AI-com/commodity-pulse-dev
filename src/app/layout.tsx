// FILE: src/app/layout.tsx
import "./globals.css";
import { Roboto, Roboto_Condensed } from "next/font/google";
import AppSuspense from "@/components/app-suspense";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-roboto",
  display: "swap",
});

const robotoCondensed = Roboto_Condensed({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-roboto-condensed",
  display: "swap",
});

export const metadata = {
  title: "AI Commodity App",
  description: "Commodity prediction and reports",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${roboto.variable} ${robotoCondensed.variable}`}>
      <body className="tt-body">
        <AppSuspense fallback={null}>{children}</AppSuspense>
      </body>
    </html>
  );
}
