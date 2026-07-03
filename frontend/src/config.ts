// Backend origins, overridable per environment (e.g. on Netlify set
// REACT_APP_API_URL / REACT_APP_DASHBOARD_URL in the build settings).
export const API_URL =
  process.env.REACT_APP_API_URL || "http://localhost:3002";

export const DASHBOARD_URL =
  process.env.REACT_APP_DASHBOARD_URL || "http://localhost:3001";
