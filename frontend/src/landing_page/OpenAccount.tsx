import React from "react";
import { Link } from "react-router-dom";

function OpenAccount() {
  return (
    <div className="section section--band text-center">
      <div className="container">
        <span className="eyebrow">Get started</span>
        <h2 className="section-title mb-3">Open a BlueChip account</h2>
        <p className="section-lede mx-auto mb-4">
          Sign up in seconds, get $100,000 in practice funds, and trade
          crypto at live Gemini prices.
        </p>
        <Link className="btn btn-primary btn-lg" to="/signup">
          Sign up for free
        </Link>
      </div>
    </div>
  );
}
export default OpenAccount;
