/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/**/*.{js,ts,jsx,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        hairline: "hsl(var(--hairline))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-bg))",
          active: "hsl(var(--sidebar-active))",
          hover: "hsl(var(--sidebar-hover))",
        },
        surface: {
          1: "hsl(var(--surface-1))",
          2: "hsl(var(--surface-2))",
          3: "hsl(var(--surface-3))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        "input-background": "hsl(var(--input-background))",
        ring: "hsl(var(--ring))",
        status: {
          success: "hsl(var(--status-success))",
          warning: "hsl(var(--status-warning))",
          danger: "hsl(var(--status-danger))",
          info: "hsl(var(--status-info))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        "foreground-subtle": "hsl(var(--foreground) / 0.8)",
        disabled: "hsl(var(--foreground) / 0.75)",
      },
      borderRadius: {
        lg: "var(--radius-container)",
        md: "var(--radius-control)",
        sm: "calc(var(--radius-control) - 2px)",
      },
      boxShadow: {
        "inset-highlight": "inset 0 1px 0 var(--inset-highlight)",
        "inset-highlight-subtle":
          "inset 0 1px 0 var(--inset-highlight-subtle, var(--inset-highlight))",
      },
      spacing: {
        "space-1": "var(--space-1)",
        "space-2": "var(--space-2)",
        "space-3": "var(--space-3)",
        "space-4": "var(--space-4)",
        "space-5": "var(--space-5)",
        "space-6": "var(--space-6)",
        "space-7": "var(--space-7)",
        "space-8": "var(--space-8)",
      },
      height: {
        "control-xs": "var(--control-xs)",
        "control-sm": "var(--control-sm)",
        "control-md": "var(--control-md)",
        "control-lg": "var(--control-lg)",
      },
      minHeight: {
        "control-xs": "var(--control-xs)",
        "control-sm": "var(--control-sm)",
        "control-md": "var(--control-md)",
        "control-lg": "var(--control-lg)",
      },
      width: {
        "control-xs": "var(--control-xs)",
        "control-sm": "var(--control-sm)",
        "control-md": "var(--control-md)",
        "control-lg": "var(--control-lg)",
      },
      fontSize: {
        "title-lg": ["1.75rem", { lineHeight: "2.125rem", fontWeight: "600" }],
        "label-xs": ["0.75rem", { lineHeight: "1rem", fontWeight: "600" }],
        "body-xs": ["0.75rem", { lineHeight: "1rem" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.125rem" }],
        "body-md": ["0.875rem", { lineHeight: "1.25rem" }],
        "body-lg": ["0.9375rem", { lineHeight: "1.5rem" }],
        "title-sm": ["1rem", { lineHeight: "1.375rem", fontWeight: "600" }],
        "title-md": ["1.125rem", { lineHeight: "1.5rem", fontWeight: "600" }],
        "sidebar-meta": ["0.625rem", { lineHeight: "0.875rem" }],
        "sidebar-label": [
          "0.6875rem",
          { lineHeight: "1rem", fontWeight: "500" },
        ],
        "sidebar-item": ["0.8125rem", { lineHeight: "1rem" }],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
