import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const title = "Enske Park – Parkeerzones en tarieven Enschede";
const description =
  "Zie waar de parkeerzones in Enschede zitten en wat parkeren daar kost. Kaart met betaald parkeren, vergunningzones en garages.";

export const metadata: Metadata = {
  title,
  description,
  applicationName: "Enske Park",
  metadataBase: new URL("https://enske-park.vercel.app"),
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title,
    description,
    type: "website",
    locale: "nl_NL",
    siteName: "Enske Park",
    url: "/",
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050608",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nl" className={`${dmSans.variable} h-full`}>
      <body className="h-full overflow-hidden bg-[var(--background)] font-sans antialiased text-[var(--foreground)]">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Enske Park",
              url: "https://enske-park.vercel.app",
              inLanguage: "nl-NL",
              applicationCategory: "TravelApplication",
              operatingSystem: "Web",
              description,
              areaServed: { "@type": "City", name: "Enschede" },
            }),
          }}
        />
        {children}
      </body>
    </html>
  );
}
