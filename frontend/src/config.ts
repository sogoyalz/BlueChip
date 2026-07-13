import axios from "axios";

// Backend origins, overridable per environment (e.g. on Netlify set
// REACT_APP_API_URL / REACT_APP_DASHBOARD_URL in the build settings).
export const API_URL =
  process.env.REACT_APP_API_URL || "http://localhost:3002";

export const DASHBOARD_URL =
  process.env.REACT_APP_DASHBOARD_URL || "http://localhost:3001";

// CSRF: the backend requires this custom header on every state-changing
// request. A browser only lets same-origin/CORS-permitted JS set it, so a
// cross-site request can't forge it. Setting it as a default covers every
// axios call in the app. (Guarded so a test that mocks axios without
// `defaults` doesn't throw at import time.)
if (axios.defaults?.headers?.common) {
  axios.defaults.headers.common["X-Requested-With"] = "XMLHttpRequest";
}
