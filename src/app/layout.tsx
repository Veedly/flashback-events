import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Flashback — общая камера события",
    template: "%s · Flashback",
  },
  description:
    "Создайте событие, поделитесь QR-кодом и соберите живые фотографии гостей в одном месте.",
  applicationName: "Flashback",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Flashback",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#171512",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
