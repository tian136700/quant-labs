import type { Config } from "tailwindcss";

/**
 * 与原系统 theme.css / app.css 保持一致的设计令牌
 * 对应 web/static/css/theme.css 中的 CSS 变量
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
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
    },
  },
  plugins: [],
};

export default config;
