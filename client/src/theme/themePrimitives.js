/**
 * @module theme/themePrimitives
 * @description Design tokens, color schemes, typography, shadows, and shapes for Material UI.
 */
import { createTheme, alpha } from "@mui/material/styles";

const defaultTheme = createTheme();

/**
 * Brand primary palette shades.
 * @constant
 * @type {Record<number, string>}
 */
export const brand = {
  50: "#eff6ff",
  100: "#dbeafe",
  200: "#bfdbfe",
  300: "#93c5fd",
  400: "#135bec",
  500: "#135bec",
  600: "#2563eb",
  700: "#1d4ed8",
  800: "#1e40af",
  900: "#1e3a8a",
};

/**
 * Neutral gray palette shades.
 * @constant
 * @type {Record<number, string>}
 */
export const gray = {
  50: "#f6f6f8",
  100: "#f1f5f9",
  200: "#e2e8f0",
  300: "#cbd5e1",
  400: "#92a4c9",
  500: "#64748b",
  600: "#475569",
  700: "#324467",
  800: "#1e293b",
  900: "#101622",
};

/**
 * Success green palette shades.
 * @constant
 * @type {Record<number, string>}
 */
export const green = {
  50: "#f0fdf4",
  100: "#dcfce7",
  200: "#bbf7d0",
  300: "#86efac",
  400: "#4ade80",
  500: "#22c55e",
  600: "#16a34a",
  700: "#15803d",
  800: "#166534",
  900: "#14532d",
};

/**
 * Warning orange palette shades.
 * @constant
 * @type {Record<number, string>}
 */
export const orange = {
  50: "#fffbeb",
  100: "#fef3c7",
  200: "#fde68a",
  300: "#fcd34d",
  400: "#fbbf24",
  500: "#f59e0b",
  600: "#d97706",
  700: "#b45309",
  800: "#92400e",
  900: "#78350f",
};

/**
 * Error red palette shades.
 * @constant
 * @type {Record<number, string>}
 */
export const red = {
  50: "#fef2f2",
  100: "#fee2e2",
  200: "#fecaca",
  300: "#fca5a5",
  400: "#f87171",
  500: "#ef4444",
  600: "#dc2626",
  700: "#b91c1c",
  800: "#991b1b",
  900: "#7f1d1d",
};

/**
 * Light and dark mode theme color schemes.
 * @constant
 * @type {object}
 */
export const colorSchemes = {
  light: {
    palette: {
      primary: {
        light: brand[200],
        main: brand[400],
        dark: brand[700],
        contrastText: "#ffffff",
      },
      info: {
        light: brand[100],
        main: brand[300],
        dark: brand[600],
        contrastText: gray[50],
      },
      warning: {
        light: orange[300],
        main: orange[500],
        dark: orange[700],
      },
      error: {
        light: red[300],
        main: red[500],
        dark: red[700],
      },
      success: {
        light: green[300],
        main: green[500],
        dark: green[700],
      },
      grey: {
        ...gray,
      },
      divider: alpha(gray[200], 0.8),
      background: {
        default: "#f6f6f8",
        paper: "#ffffff",
      },
      text: {
        primary: "#0f172a",
        secondary: gray[600],
        warning: orange[500],
        disabled: alpha("#0f172a", 0.6),
      },
      action: {
        hover: alpha(gray[200], 0.5),
        selected: alpha(gray[200], 0.6),
        disabled: alpha("#0f172a", 0.6),
        disabledBackground: alpha(gray[300], 0.6),
        disabledOpacity: 0.65,
      },
      baseShadow:
        "rgba(0, 0, 0, 0.05) 0px 4px 16px 0px, rgba(0, 0, 0, 0.05) 0px 8px 16px -5px",
    },
  },
  dark: {
    palette: {
      primary: {
        contrastText: "#ffffff",
        light: brand[300],
        main: brand[400],
        dark: brand[700],
      },
      info: {
        contrastText: brand[300],
        light: brand[500],
        main: brand[700],
        dark: brand[900],
      },
      warning: {
        light: orange[400],
        main: orange[500],
        dark: orange[700],
      },
      error: {
        light: red[400],
        main: red[500],
        dark: red[700],
      },
      success: {
        light: green[400],
        main: green[500],
        dark: green[700],
      },
      grey: {
        ...gray,
      },
      divider: alpha(gray[700], 0.6),
      background: {
        default: "#101622",
        paper: "#1c2533",
      },
      text: {
        primary: "#ffffff",
        secondary: "#92a4c9",
        disabled: alpha("#ffffff", 0.65),
      },
      action: {
        hover: alpha(gray[700], 0.4),
        selected: alpha(gray[700], 0.5),
        disabled: alpha("#ffffff", 0.65),
        disabledBackground: alpha(gray[700], 0.6),
        disabledOpacity: 0.65,
      },
      baseShadow:
        "rgba(0, 0, 0, 0.4) 0px 4px 16px 0px, rgba(0, 0, 0, 0.5) 0px 8px 16px -5px",
    },
  },
};

/**
 * Application typography variants and font family definitions.
 * @constant
 * @type {object}
 */
export const typography = {
  fontFamily: "'Inter', 'Noto Sans Ethiopic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  h1: {
    fontSize: defaultTheme.typography.pxToRem(48),
    fontWeight: 600,
    lineHeight: 1.2,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: defaultTheme.typography.pxToRem(36),
    fontWeight: 600,
    lineHeight: 1.2,
  },
  h3: {
    fontSize: defaultTheme.typography.pxToRem(30),
    lineHeight: 1.2,
  },
  h4: {
    fontSize: defaultTheme.typography.pxToRem(24),
    fontWeight: 600,
    lineHeight: 1.5,
  },
  h5: {
    fontSize: defaultTheme.typography.pxToRem(20),
    fontWeight: 600,
  },
  h6: {
    fontSize: defaultTheme.typography.pxToRem(18),
    fontWeight: 600,
  },
  subtitle1: {
    fontSize: defaultTheme.typography.pxToRem(18),
  },
  subtitle2: {
    fontSize: defaultTheme.typography.pxToRem(14),
    fontWeight: 500,
  },
  body1: {
    fontSize: defaultTheme.typography.pxToRem(14),
  },
  body2: {
    fontSize: defaultTheme.typography.pxToRem(14),
    fontWeight: 400,
  },
  caption: {
    fontSize: defaultTheme.typography.pxToRem(12),
    fontWeight: 400,
  },
};

/**
 * Global component border radius geometry.
 * @constant
 * @type {{ borderRadius: number }}
 */
export const shape = {
  borderRadius: 8,
};

const defaultShadows = [
  "none",
  "var(--template-palette-baseShadow)",
  ...defaultTheme.shadows.slice(2),
];

/**
 * Application elevation shadow definitions.
 * @constant
 * @type {Array<string>}
 */
export const shadows = defaultShadows;
