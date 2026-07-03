import React from "react";
import { Link } from "react-router-dom";

function Hero() {
  return (
    <section className="container-fluid" id="supportHero">
      <div className="p-5" id="supportWrapper">
        <h4>Support Portal</h4>
        <Link className="btn btn-ghost btn-sm" to="/support">
          Track Tickets
        </Link>
      </div>
      <div className="row p-5 m-3 gy-4">
        <div className="col-md-6 p-3">
          <h1 className="fs-3 mb-4">
            Search for an answer or browse help topics to create a ticket
          </h1>
          <input placeholder="Eg. how do I activate F&O" className="mb-4" />
          <div className="chip-row">
            <a href="#createTicket">Track account opening</a>
            <a href="#createTicket">Track segment activation</a>
            <a href="#createTicket">Intraday margins</a>
            <a href="#createTicket">Terminal user guide</a>
          </div>
        </div>
        <div className="col-md-6 p-3">
          <h1 className="fs-3 mb-4">Featured</h1>
          <ol>
            <li className="mb-2">
              <a href="#createTicket">
                Current Takeovers and Delisting - July 2026
              </a>
            </li>
            <li>
              <a href="#createTicket">Latest Intraday leverages - MIS &amp; CO</a>
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}

export default Hero;
