import React from "react";
import { Link } from "react-router-dom";

function Hero() {
  return (
    <section className="container-fluid" id="supportHero">
      <div className="p-5" id="supportWrapper">
        <h4>Help centre</h4>
        <Link className="btn btn-ghost btn-sm" to="/signup">
          Open an account
        </Link>
      </div>
      <div className="row p-5 m-3 gy-4">
        <div className="col-md-6 p-3">
          <h1 className="fs-3 mb-4">
            How BlueChip works, from prices to fills
          </h1>
          <p className="section-lede mb-4">
            Everything here is about one shared sandbox account trading at live
            Gemini prices. Start with a topic below.
          </p>
          <div className="chip-row">
            <a href="#helpTopics">Where prices come from</a>
            <a href="#helpTopics">Limit orders</a>
            <a href="#helpTopics">Terminal user guide</a>
          </div>
        </div>
        <div className="col-md-6 p-3">
          <h1 className="fs-3 mb-4">Start here</h1>
          <ol>
            <li className="mb-2">
              <a href="#helpTopics">
                How limit orders rest and fill on Gemini's sandbox exchange
              </a>
            </li>
            <li>
              <a href="#helpTopics">
                Why every trader shares the same sandbox account
              </a>
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}

export default Hero;
