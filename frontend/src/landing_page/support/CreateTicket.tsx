import React from "react";

const topics = [
  {
    icon: "fa-plus-circle",
    title: "Account & Login",
    links: [
      "Creating your account",
      "Your $100,000 starting balance",
      "Logging in to the Terminal",
      "Resetting your password",
      "Getting started",
    ],
  },
  {
    icon: "fa-bar-chart",
    title: "Orders & Fills",
    links: [
      "Market vs limit orders",
      "How limit orders rest and fill",
      "Why an order was rejected",
      "Cancelling an open order",
      "Fractional quantities",
    ],
  },
  {
    icon: "fa-line-chart",
    title: "Prices & Market Data",
    links: [
      "Where prices come from (Gemini)",
      "The Live / Delayed indicator",
      "Candlestick charts and timeframes",
      "24h change explained",
      "Supported cryptocurrencies",
    ],
  },
  {
    icon: "fa-user",
    title: "Portfolio & Leaderboard",
    links: [
      "Holdings and weighted-average cost",
      "Unrealized P&L",
      "Portfolio value history",
      "How the leaderboard is ranked",
    ],
  },
  {
    icon: "fa-credit-card",
    title: "Simulated Funds",
    links: [
      "Why there are no deposits",
      "Resetting to $100,000",
      "Buying power explained",
      "Nothing here is real money",
    ],
  },
  {
    icon: "fa-code",
    title: "API and Developers",
    links: [
      "Public market-data endpoints",
      "Live prices over HTTP",
      "Candle history API",
      "Rate limits",
    ],
  },
];

function CreateTicket() {
  return (
    <div className="container section" id="createTicket">
      <h2 className="section-title mb-4">
        To create a ticket, select a relevant topic
      </h2>
      <div className="row gy-4">
        {topics.map((topic) => (
          <div className="col-md-4 col-sm-6" key={topic.title}>
            <div className="panel h-100">
              <span className="icon-chip">
                <i className={`fa ${topic.icon}`} aria-hidden="true"></i>
              </span>
              <h3 className="fs-6 mb-3">{topic.title}</h3>
              <ul className="topic-links">
                {topic.links.map((link) => (
                  <li key={link}>{link}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CreateTicket;
