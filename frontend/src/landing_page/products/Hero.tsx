import React from "react";
import { Link } from "react-router-dom";

function Hero() {
  return (
    <div className="container border-bottom">
      <div className="section text-center">
        <span className="eyebrow">Products</span>
        <h1 className="section-title mb-3">One terminal, and the feed behind it</h1>
        <p className="section-lede mx-auto mb-4">
          A live trading dashboard on Gemini's sandbox exchange, and the open
          market-data API that powers it
        </p>
        <Link className="link-arrow" to="/pricing">
          What it costs (nothing)
        </Link>
      </div>
    </div>
  );
}

export default Hero;
