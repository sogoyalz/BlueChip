import { useEffect } from "react";
import { useCookies } from "react-cookie";
import axios from "axios";

import TopBar from "./TopBar";
import Dashboard from "./Dashboard";
import { PricesProvider } from "./PricesContext";
import { API_URL, LOGIN_URL } from "../config";

const Home = () => {
  const [cookies, setCookie, removeCookie] = useCookies(["token"]);

  // The frontend (:3000) sets the cookie for its own origin, which the dashboard
  // (:3001) cannot read. So login/signup hand the token over in the URL
  // (?token=...). Pick it up here and store it as our own cookie. The URL is
  // only scrubbed below once the cookie state has landed — cleaning it here
  // would race the verify effect, which still needs ?token= as its "login in
  // progress" signal.
  useEffect(() => {
    const urlToken = new URLSearchParams(window.location.search).get("token");
    if (urlToken && !cookies.token) {
      setCookie("token", urlToken, { path: "/" });
    }
  }, [cookies.token, setCookie]);

  useEffect(() => {
    const verifyUser = async () => {
      const urlToken = new URLSearchParams(window.location.search).get("token");
      if (!cookies.token) {
        // A token arriving via ?token= is stored by the effect above; don't
        // bounce to login before that cookie-state update lands.
        if (!urlToken) {
          window.location.href = LOGIN_URL; // not logged in
        }
        return;
      }
      if (urlToken) {
        // Cookie state has landed — safe to scrub the token from the URL now.
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      try {
        // Send the token in the body too — in production the dashboard and
        // backend are different sites, so the backend-domain cookie never
        // arrives cross-origin.
        const { data } = await axios.post(
          `${API_URL}/`,
          { token: cookies.token },
          { withCredentials: true }
        );
        if (!data.status) {
          removeCookie("token");
          window.location.href = LOGIN_URL; // token invalid
        }
      } catch (err) {
        console.error(err);
        window.location.href = LOGIN_URL;
      }
    };
    verifyUser();
  }, [cookies, removeCookie]);

  return (
    <PricesProvider>
      <TopBar />
      <Dashboard />
    </PricesProvider>
  );
};

export default Home;
