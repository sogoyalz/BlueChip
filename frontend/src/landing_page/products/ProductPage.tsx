import React from "react";
import { Link } from "react-router-dom";

import Hero from "./Hero";
import LeftSection from "./LeftSection";
import RightSection from "./RightSection";
import Universe from "./Universe";

function ProductPage() {
  return (
    <>
      <Hero />
      <LeftSection
        imageURL="/media/images/productTerminal.svg"
        productName="Terminal"
        productDescription="The live trading dashboard: streaming crypto prices, a watchlist of major coins, market and limit orders, and honest P&L on every position — all in an elegant dark UI that runs wherever your browser does."
        tryDemo="/signup"
        learnMore="/support"
      />
      <RightSection
        imageURL="/media/images/productReports.svg"
        productName="Reports"
        productDescription="Your portfolio's story over time. Value snapshots are recorded after every fill and around the clock, so the performance chart shows what actually happened — not a mock curve."
        learnMore="/support"
      />
      <LeftSection
        imageURL="/media/images/productVault.svg"
        productName="Holdings"
        productDescription="Positions accounted for properly: quantities to eight decimal places, live valuation against the current market, and the shared sandbox balance behind them — the same bookkeeping a real exchange runs."
        tryDemo="/signup"
        learnMore="/support"
      />
      <RightSection
        imageURL="/media/images/productApi.svg"
        productName="BlueChip API"
        productDescription="Open market-data endpoints, no key and no account required: live prices, the supported symbol list, and OHLC candle history over plain HTTP/JSON — the same feed that powers the Terminal."
        learnMore="/support"
      />
      <p className="text-center mb-5">
        Want to know how it's built? Read the{" "}
        <Link to="/about">engineering story</Link>.
      </p>
      <Universe />
    </>
  );
}

export default ProductPage;
