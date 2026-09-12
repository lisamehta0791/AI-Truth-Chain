import type { Config } from "tailwindcss";

// "Obsidian Hologram" palette — obsidian ground, violet / magenta / mint light.
// Semantic names are kept from the original design system so existing
// classes keep working; only the values changed. See src/index.css for the
// CSS-variable form of the same palette.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#07060f",
        "surface-dim": "#07060f",
        "surface-bright": "#2a1f52",
        "surface-container-lowest": "#050410",
        "surface-container-low": "#0e0b1f",
        "surface-container": "#15102b",
        "surface-container-high": "#1c1538",
        "surface-container-highest": "#251c48",
        "on-surface": "#f3eefc",
        "on-surface-variant": "#b9b0d6",
        outline: "#6d5cb8",
        "outline-variant": "#3b2f6b",

        // Primary (Violet) — interactive elements, primary actions, active nav
        primary: "#e9d5ff",
        "on-primary": "#140a2e",
        "primary-container": "#a78bfa",

        // AI / Analysis (Magenta) — AI-extracted, unverified, hypothesis states
        "ai-secondary": "#f472b6",
        "on-ai-secondary": "#4a0b2c",
        "ai-secondary-container": "#be185d",

        // Verification (goal state — human-confirmed truth)
        verified: "#06ffa5",
        "on-verified": "#053d2a",

        // Warnings / contradictions
        tertiary: "#ffe6c2",
        "on-tertiary": "#3e2600",
        "tertiary-container": "#ffb547",
        error: "#ff8fb0",
        "on-error": "#4a0018",
        "error-container": "#ff3d71",

        background: "#07060f",
        "on-background": "#f3eefc",

        // Named palette for arbitrary use
        cot: {
          bg: "#07060f",
          bg2: "#0e0b1f",
          bg3: "#15102b",
          violet: "#a78bfa",
          "violet-deep": "#7c3aed",
          indigo: "#6366f1",
          magenta: "#f472b6",
          "magenta-deep": "#ec4899",
          mint: "#06ffa5",
          amber: "#ffb547",
          red: "#ff3d71",
          ice: "#9ad8ff",
          text: "#f3eefc",
          text2: "#b9b0d6",
          text3: "#7d739e",
          text4: "#55497a",
        },
      },
      fontFamily: {
        display: ["Orbitron", "Rajdhani", "sans-serif"],
        sans: ["Rajdhani", "Segoe UI", "sans-serif"],
        mono: ["Share Tech Mono", "JetBrains Mono", "monospace"],
      },
      borderRadius: {
        sm: "0.25rem",
        DEFAULT: "0.5rem",
        md: "0.625rem",
        lg: "0.875rem",
        xl: "1rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        glow: "0 0 24px rgba(167,139,250,.35), 0 0 60px rgba(236,72,153,.16)",
        "glow-mint": "0 0 24px rgba(6,255,165,.35)",
        "glow-magenta": "0 0 24px rgba(244,114,182,.4)",
      },
      spacing: {
        gutter: "16px",
        margin: "24px",
      },
      maxWidth: {
        container: "1440px",
      },
    },
  },
  plugins: [],
} satisfies Config;
