import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Flashback — общая камера события",
    short_name: "Flashback",
    description: "Снимайте и собирайте фотографии гостей по QR-коду.",
    start_url: "/",
    display: "standalone",
    background_color: "#f2eee6",
    theme_color: "#171512",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
