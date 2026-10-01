import fs from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// All files live in one flat folder, so the two app icons are copied into the build here.
const copyIcons = () => ({
  name: "copy-icons",
  generateBundle() {
    for (const f of ["icon-192.png", "icon-512.png"]) {
      this.emitFile({ type: "asset", fileName: f, source: fs.readFileSync(f) });
    }
  },
});

export default defineConfig({
  publicDir: false,
  plugins: [
    react(),
    copyIcons(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "ChinaLink Sri Lanka",
        short_name: "ChinaLink",
        description: "Chinese-language visa, housing, vehicle and business help in Sri Lanka",
        theme_color: "#1A5CFF",
        background_color: "#0B1F4D",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
