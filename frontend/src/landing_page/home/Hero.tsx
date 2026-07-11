import React from "react";
import { Link } from "react-router-dom";

function Hero() {
  return (
    <div className="container section text-center">
      <span className="eyebrow eyebrow--accent">BlueChip</span>
      <h1 className="hero-title mb-3">
        Learn to trade crypto with $100,000 — none of it real.
      </h1>
      <p className="section-lede mx-auto mb-4">
        Live Bitcoin, Ethereum, and Solana prices from Gemini. Real order
        mechanics. Zero risk.
      </p>
      <div className="cta-row d-flex justify-content-center gap-3 flex-wrap mb-5">
        <Link className="btn btn-primary btn-lg" to="/signup">
          Start trading free
        </Link>
        <Link className="btn btn-ghost btn-lg" to="/product">
          See how it works
        </Link>
      </div>
      <div className="img-frame hero-media mx-auto">
        <img
          src="/media/images/heroTerminal.svg"
          alt="BlueChip Terminal trading interface"
        />
      </div>
    </div>
  );
}
export default Hero;
