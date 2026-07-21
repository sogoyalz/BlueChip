import React from "react";
import Hero from "./Hero";
import LiveTicker from "./LiveTicker";
import Awards from "./Awards";
import Education from "./Education";
import Pricing from "./Pricing";
import Stats from "./Stats";
import OpenAccount from "../OpenAccount";
import Reveal from "../Reveal";

function HomePage() {
  return (
    <>
      <Hero />
      <LiveTicker />
      <Reveal>
        <Awards />
      </Reveal>
      <Reveal>
        <Stats />
      </Reveal>
      <Reveal>
        <Pricing />
      </Reveal>
      <Reveal>
        <Education />
      </Reveal>
      <Reveal>
        <OpenAccount />
      </Reveal>
    </>
  );
}
export default HomePage;
