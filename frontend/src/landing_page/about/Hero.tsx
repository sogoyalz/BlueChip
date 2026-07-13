import React from "react";

function Hero() {
  return (
    <div className="container">
      <div className="section text-center">
        <span className="eyebrow">About BlueChip</span>
        <h1 className="about-statement mx-auto">
          We believe the best way to learn trading is to trade.
          <br />
          So we built a real exchange where the money isn't.
        </h1>
      </div>
      <div className="row section border-top gy-4">
        <div className="col-md-6 pe-md-5">
          <div className="prose">
            <p>
              BlueChip started with a simple frustration: you can read a
              hundred articles about limit orders and still freeze the first
              time real prices are moving against you. Trading is a skill,
              and skills need practice — but practicing with real money is an
              expensive way to learn.
            </p>
            <p>
              The name is a nod to "blue chip" assets — the ones that stand
              for stability, trust, and long-term value. Today BlueChip is a
              crypto trading platform: live market data from the Gemini
              exchange, and orders that place for real on Gemini's sandbox
              exchange with test funds.
            </p>
            <p>
              Every feature is measured against one question: does this teach
              you something true about how markets actually work?
            </p>
          </div>
        </div>
        <div className="col-md-6 ps-md-5">
          <div className="prose">
            <p>
              We are a technology project at heart. The entire platform is
              built end-to-end in TypeScript — the streaming price feed, the
              signed order client, the portfolio accounting, and the
              terminal you trade in — as an open learning project.
            </p>
            <p>
              Prices stream in over Gemini's public WebSocket market-data
              feed. Orders place for real against Gemini's sandbox exchange —
              HMAC-signed requests, real matching, real fills — on a shared
              test account so nobody's real money is ever on the line.
            </p>
            <p>
              BlueChip is an educational portfolio project. It is not a real
              broker, holds no real assets, and is not affiliated with
              Gemini.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
export default Hero;
