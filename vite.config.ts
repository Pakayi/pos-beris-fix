import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Kita beri tahu Vite bahwa library ini ada di luar (diambil via importmap/CDN)
      // Jadi Vite tidak akan mencarinya di node_modules saat build
      external: ["react", "react-dom", "react-router-dom", "recharts", "jspdf", "html5-qrcode", "xlsx", "firebase/app", "firebase/auth", "firebase/firestore", "@google/genai"],
    },
  },
});
