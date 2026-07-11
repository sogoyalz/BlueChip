import { createTheme } from "@mui/material/styles";

// Mirrors the CSS design tokens defined in index.css :root.
// Keep the two in sync — CSS owns the tokens, this maps them for MUI components.
const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#0a0a0c", // --bg
      paper: "#131316", // --surface
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
    divider: "#222228", // --border
    text: {
      primary: "#f0f0f2", // --ink
      secondary: "#a0a0a8", // --ink-2
      disabled: "#6c6c74", // --ink-3
    },
  },
  typography: {
    fontFamily:
      '"Manrope", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", sans-serif',
    fontSize: 14,
  },
  shape: {
    borderRadius: 8, // --radius-sm
  },
  components: {
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "#1c1c21", // --surface-hover
          border: "1px solid #222228",
          color: "#f0f0f2",
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
