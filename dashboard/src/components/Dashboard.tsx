import React, { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";

import Funds from "./Funds";
import Holdings from "./Holdings";
import Orders from "./Orders";
import Summary from "./Summary";
import WatchList from "./WatchList";
import Skeleton from "./shared/Skeleton";
import { GeneralContextProvider } from "./GeneralContext";

// The market page is the only thing that needs the candlestick chart, which
// brings chartjs-chart-financial and the date-fns time adapter with it. Loading
// that on first paint costs every visitor for a route most never open, so it is
// split into its own chunk and fetched when the route is actually visited.
const MarketDetail = lazy(() => import("./MarketDetail"));

const Dashboard = () => {
  return (
    // GeneralContextProvider wraps the whole dashboard (not just the
    // watchlist) so any page — charts, holdings — can open the trade modal.
    <GeneralContextProvider>
      <div className="dashboard-container">
        {/* Landmarks: without these the whole dashboard is anonymous <div>s and
            a screen reader can only read it linearly from the top. */}
        <aside aria-label="Watchlist">
          <WatchList />
        </aside>
        {/* tabIndex=0 because .content is the page's scroll container: a
            scrollable region that nothing can focus cannot be scrolled by
            keyboard alone. */}
        <main className="content" tabIndex={0}>
          <Suspense fallback={<Skeleton label="Loading…" />}>
            <Routes>
              <Route path="/" element={<Summary />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/holdings" element={<Holdings />} />
              <Route path="/funds" element={<Funds />} />
              <Route path="/market/:symbol" element={<MarketDetail />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </GeneralContextProvider>
  );
};

export default Dashboard;
