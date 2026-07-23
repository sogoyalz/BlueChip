import React from "react";
import { Route, Routes } from "react-router-dom";

import Apps from "./App";
import Funds from "./Funds";
import Holdings from "./Holdings";
import MarketDetail from "./MarketDetail";
import Orders from "./Orders";
import Summary from "./Summary";
import WatchList from "./WatchList";
import { GeneralContextProvider } from "./GeneralContext";

const Dashboard = () => {
  return (
    // GeneralContextProvider wraps the whole dashboard (not just the
    // watchlist) so any page — charts, holdings — can open the trade modal.
    <GeneralContextProvider>
      <div className="dashboard-container">
        <WatchList />
        <div className="content">
          <Routes>
            <Route path="/" element={<Summary />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/holdings" element={<Holdings />} />
            <Route path="/funds" element={<Funds />} />
            <Route path="/market/:symbol" element={<MarketDetail />} />
            <Route path="/apps" element={<Apps />} />
          </Routes>
        </div>
      </div>
    </GeneralContextProvider>
  );
};

export default Dashboard;
