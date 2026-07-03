import React from "react";

function Hero() {
  return (
    <div className="container">
      <div className="section text-center">
        <span className="eyebrow">About BlueChip</span>
        <h1 className="about-statement mx-auto">
          We believe investing should be simple, transparent, and fair.
          <br />
          So we built the platform we always wanted to use.
        </h1>
      </div>
      <div className="row section border-top gy-4">
        <div className="col-md-6 pe-md-5">
          <div className="prose">
            <p>
              BlueChip started with a simple frustration: trading platforms
              that were slow, cluttered, and full of hidden charges. We set out
              to build something better — a fast, honest platform for everyone
              from first-time investors to full-time traders.
            </p>
            <p>
              We named the company BlueChip, after the "blue chip" stocks that
              stand for stability, trust, and long-term value.
            </p>
            <p>
              Every feature we ship is measured against one question: does this
              help our customers do better with their money?
            </p>
          </div>
        </div>
        <div className="col-md-6 ps-md-5">
          <div className="prose">
            <p>
              We are a technology company at heart. Our entire platform — from
              the trading terminal to the reporting engine — is built in-house,
              so we can keep it fast, reliable, and free of bloat.
            </p>
            <p>
              Beyond the product, we run free and open market education through
              BlueChip Learn and an active community forum, because informed
              investors make better decisions.
            </p>
            <p>
              And yet, we are always up to something new every day. Catch up on
              the latest updates on our engineering blog, or learn more about
              our product philosophies.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
export default Hero;
