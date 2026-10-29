import React from "react";
import { Link } from "react-router-dom";

function Hero() {
  return (
    <section className="container landing-hero" aria-labelledby="home-title">
      <div className="hero-copy hero-animate">
        <span className="eyebrow eyebrow--accent hero-kicker">Gemini sandbox trading</span>
        <h1 className="hero-title" id="home-title">
          Real trades.<br /><span>Room to learn.</span>
        </h1>
        <p className="section-lede">
          Find your footing in crypto. Explore live markets, place real sandbox
          orders, and build confidence without putting real money on the line.
        </p>
        <div className="cta-row d-flex gap-3 flex-wrap">
          <Link className="btn btn-primary btn-lg" to="/signup">
            Start trading free <span aria-hidden="true">&rarr;</span>
          </Link>
          <Link className="btn btn-ghost btn-lg" to="/product">
            Explore the platform
          </Link>
        </div>
        <p className="hero-assurance">No deposits. No real money. One shared practice account.</p>
      </div>
      <div className="hero-preview">
        <div className="preview-caption">
          <span><span className="preview-dot" aria-hidden="true" /> BlueChip Terminal</span>
          <span className="preview-tag">SANDBOX</span>
        </div>
        <img
          src="/media/images/heroTerminal.svg"
          alt="Illustration of the BlueChip trading terminal with a price chart and order controls"
          width="1200"
          height="520"
        />
        <div className="preview-footer">
          <span>Interface preview. Explore your next move.</span>
          <Link to="/product" aria-label="Explore BlueChip Terminal">Explore <span aria-hidden="true">&rarr;</span></Link>
        </div>
      </div>
      <div className="hero-capabilities" aria-label="Platform capabilities">
        <div><span className="capability-number">01</span><span>Live market data<small>Follow the market as it moves</small></span></div>
        <div><span className="capability-number">02</span><span>Real order mechanics<small>Practice market and limit orders</small></span></div>
        <div><span className="capability-number">03</span><span>Zero real money<small>Learn in Gemini's sandbox</small></span></div>
      </div>
    </section>
  );
}
export default Hero;
