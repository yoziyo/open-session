import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.OPEN_SESSION_VIEWER_BASE || "/",
  plugins: [react(), tailwindcss()],
  server: { host: "0.0.0.0", port: 5173 },
});
