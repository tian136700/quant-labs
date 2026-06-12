import type { Config } from "tailwindcss";

/**
 * 与原系统 theme.css / app.css 保持一致的设计令牌
 * 响应式断点：Mobile First（xs → 2xl）
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    screens: {
      xs: "320px",
      sm: "480px",
      md: "768px",
      lg: "1024px",
      xl: "1440px",
      "2xl": "1920px",
    },
    extend: {
      colors: {
        bg: "#0f1419",
        panel: "#1a2332",
        text: "#e7ecf3",
        muted: "#8b9cb3",
        accent: "#3d8bfd",
        border: "#2d3a4d",
        rise: "#e85d6f",
        fall: "#3fb983",
        thead: "#243044",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "Segoe UI",
          "Roboto",
          "PingFang SC",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "10px",
        input: "8px",
      },
      maxWidth: {
        content: "1440px",
        readable: "1280px",
      },
    },
  },
  plugins: [],
};

export default config;
