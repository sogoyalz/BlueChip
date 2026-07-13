import { useEffect, useState } from "react";
import axios from "axios";

import TopBar from "./TopBar";
import Dashboard from "./Dashboard";
import { PricesProvider } from "./PricesContext";
import { API_URL, LOGIN_URL } from "../config";

const Home = () => {
  // null = still checking, true = verified. On failure we redirect to login,
  // so `false` never renders anything.
  const [authed, setAuthed] = useState<boolean | null>(null);

  // Auth lives entirely in an httpOnly cookie the browser sends automatically
  // (sameSite:none in production, shared localhost domain in dev). We never see
  // the token in JS and it's never in the URL — we just ask the backend "is
  // this cookie still valid?" and render the dashboard only once it says yes.
  useEffect(() => {
    let cancelled = false;
    axios
      .post(`${API_URL}/`, {}, { withCredentials: true })
      .then(({ data }) => {
        if (cancelled) return;
        if (data.status) setAuthed(true);
        else window.location.href = LOGIN_URL; // no / invalid session
      })
      .catch(() => {
        if (!cancelled) window.location.href = LOGIN_URL;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!authed) return null; // brief blank while the session check runs

  return (
    <PricesProvider>
      <TopBar />
      <Dashboard />
    </PricesProvider>
  );
};

export default Home;
