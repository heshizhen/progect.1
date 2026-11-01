import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        once: {
          canvas: "#0B0D13",
          surface: "#121621",
          elevated: "#1A2030",
          border: "#232B3E",
          primary: "#F3F4F6",
          secondary: "#9CA3AF",
          muted: "#6B7280",
          accent: "#818CF8",
          accentHover: "#6366F1",
          calm: "#34D399",
          warn: "#FBBF24",
          critical: "#F87171",
        },
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans SC", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
