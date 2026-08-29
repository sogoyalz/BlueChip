import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { ThemeProvider } from "@mui/material/styles";
import "react-toastify/dist/ReactToastify.css";
import "./index.css";
import theme from "./theme";
import Home from "./components/Home";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <BrowserRouter>
        <Home />
        {/* bottom-center on narrow screens: top-right spans the full width on a
          phone and covered the page heading and first stat card. */}
      <ToastContainer
        position={
          typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches
            ? "bottom-center"
            : "top-right"
        }
        autoClose={2500}
      />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
