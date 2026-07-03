import { useEffect } from "react";
import { useCookies } from "react-cookie";
import axios from "axios";

import TopBar from "./TopBar";
import Dashboard from "./Dashboard";

const Home = () => {
  const [cookies, setCookie, removeCookie] = useCookies(["token"]);

  // The frontend (:3000) sets the cookie for its own origin, which the dashboard
  // (:3001) cannot read. So login/signup hand the token over in the URL
  // (?token=...). Pick it up here, store it as our own cookie, then clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      setCookie("token", urlToken, { path: "/" });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [setCookie]);

  useEffect(() => {
    const verifyUser = async () => {
      if (!cookies.token) {
        // A token arriving via ?token= is stored by the effect above; don't
        // bounce to login before that cookie-state update lands.
        const urlToken = new URLSearchParams(window.location.search).get("token");
        if (!urlToken) {
          window.location.href = "http://localhost:3000/login"; // not logged in
        }
        return;
      }
      try {
        const { data } = await axios.post(
          "http://localhost:3002/",
          {},
          { withCredentials: true }
        );
        if (!data.status) {
          removeCookie("token");
          window.location.href = "http://localhost:3000/login"; // token invalid
        }
      } catch (err) {
        console.error(err);
        window.location.href = "http://localhost:3000/login";
      }
    };
    verifyUser();
  }, [cookies, removeCookie]);

  return (
    <>
      <TopBar />
      <Dashboard />
    </>
  );
};

export default Home;
