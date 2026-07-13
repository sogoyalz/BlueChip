import React from "react";
import { Link } from "react-router-dom";

const features = [
  {
    title: "Live prices",
    text: "Streaming from Gemini over WebSocket, with REST fallback",
  },
  {
    title: "Market & limit orders",
    text: "Instant fills at market, or rest in the book at your price",
  },
  {
    title: "Real sandbox fills",
    text: "Orders place for real on Gemini's sandbox exchange and matching engine",
  },
  {
    title: "Candlestick charts",
    text: "Real OHLC history for every coin, from 15 minutes to daily",
  },
  {
    title: "Live order book",
    text: "Real bids and asks from Gemini's order book depth feed",
  },
  {
    title: "Market-data API",
    text: "Public prices, symbols, and candles over simple HTTP/JSON",
  },
];

function Universe() {
  return (
    <div className="section section--band">
      <div className="container text-center">
        <span className="eyebrow">Everything under one roof</span>
        <h2 className="section-title mb-3">The BlueChip platform</h2>
        <p className="section-lede mx-auto mb-4">
          One shared sandbox account and eight major cryptocurrencies at live
          market prices
        </p>

        <div className="row gy-4 mb-5">
          {features.map((feature) => (
            <div className="col-md-4 col-sm-6" key={feature.title}>
              <div className="panel h-100 text-start">
                <h3 className="fs-6 mb-2">{feature.title}</h3>
                <p className="text-muted mb-0">{feature.text}</p>
              </div>
            </div>
          ))}
        </div>
        <Link className="btn btn-primary btn-lg" to="/signup">
          Sign up now
        </Link>
      </div>
    </div>
  );
}

export default Universe;
