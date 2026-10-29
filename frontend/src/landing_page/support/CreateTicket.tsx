import React from "react";
import { Link } from "react-router-dom";

const topics = [
  { title: "The shared sandbox account", text: "Everyone uses the same Gemini sandbox funds and holdings. Your orders are attributed to your login, but another trader can change the shared balance. Signing up does not create a new funded exchange account." },
  { title: "Market and limit orders", text: "A market order uses an immediate-or-cancel limit with a one-percent price cap. It can fill partially or not at all. A limit order may rest on the sandbox book until filled or cancelled. Displayed public prices can differ from the sandbox book." },
  { title: "Awaiting exchange confirmation", text: "If an exchange response is lost, the order stays tracked while the server checks its status. Open Orders and choose Awaiting confirmation. Do not place a replacement while the outcome is unresolved." },
  { title: "Cancelling an order", text: "Open Orders, choose Open orders, and select Cancel. An order can fill before the cancellation reaches Gemini; the resulting status tells you what actually happened. Use Older orders to reach earlier history." },
  { title: "Prices and delayed data", text: "Prices arrive from Gemini through the server. The Live / Delayed indicator tracks price age. Order placement pauses when its market price is stale. An unavailable chart or order book is labelled rather than presented as fresh." },
  { title: "Balances and buying power", text: "Cash balance includes money held for open buy orders. Buying power is the amount available for another trade. Portfolio value includes cash and priced holdings; it is unavailable when a position cannot be valued reliably." },
  { title: "Portfolio history and market movement", text: "The chart uses recorded shared-account snapshots. A new account may have no history yet. The estimated 24-hour move applies market changes to current holdings; it is not realized profit or purchase-cost performance." },
  { title: "Account access", text: "Log in with your registered email and password. Logging out revokes existing sessions. Self-service password recovery is not available yet. Never reuse a password from a real financial account." },
  { title: "Developer access", text: "Prices, symbols, candles, and depth are public market-data endpoints. Account data and order history require authentication. Requests are rate limited; order submissions must include the CSRF header and should use a stable request ID for retries." },
];

function CreateTicket() {
  return (
    <section className="container section" id="helpTopics" aria-labelledby="help-topics-title">
      <h2 className="section-title mb-4" id="help-topics-title">Browse help by topic</h2>
      <div className="row gy-4">
        {topics.map(topic => (
          <div className="col-md-6" key={topic.title}>
            <details className="panel h-100">
              <summary>{topic.title}</summary>
              <p className="mt-3 mb-0">{topic.text}</p>
            </details>
          </div>
        ))}
      </div>
      <p className="mt-4"><Link to="/login">Log in to the trading dashboard</Link></p>
    </section>
  );
}
export default CreateTicket;
