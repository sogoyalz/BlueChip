import { createTheme } from "@mui/material/styles";

// Mirrors the CSS design tokens defined in index.css :root.
// Keep the two in sync — CSS owns the tokens, this maps them for MUI components.
const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#0f0f0f", // --bg
      paper: "#1a1a1a", // --surface
    },
    primary: {
      main: "#e50914", // --accent
      light: "#ff1f2e", // --accent-hover
      contrastText: "#ffffff",
    },
    success: {
      main: "#00c853", // --gain
    },
    error: {
      main: "#ff5252", // --loss
    },
    divider: "#2a2a2a", // --border
    text: {
      primary: "#f5f5f5", // --ink
      secondary: "#a0a0a0", // --ink-2
      disabled: "#666666", // --ink-3
    },
  },
  typography: {
    fontFamily:
      '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", sans-serif',
    fontSize: 14,
  },
  shape: {
    borderRadius: 8, // --radius
  },
  components: {
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "#242424", // --surface-hover
          border: "1px solid #2a2a2a",
          color: "#f5f5f5",
          fontSize: 12,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        // MUI dark mode adds a translucent elevation overlay; the design
        // system separates surfaces with borders instead.
        root: { backgroundImage: "none" },
      },
    },
  },
});

export default theme;
