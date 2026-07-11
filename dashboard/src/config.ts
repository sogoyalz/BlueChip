// Backend origins, overridable per environment (e.g. on Netlify set
// REACT_APP_API_URL / REACT_APP_LOGIN_URL in the build settings).
export const API_URL =
  process.env.REACT_APP_API_URL || "http://localhost:3002";

// Where to send the user when they are not (or no longer) logged in.
export const LOGIN_URL =
  process.env.REACT_APP_LOGIN_URL || "http://localhost:3000/login";
