import React from "react";

import Menu from "./Menu";
import PnLValue from "./shared/PnLValue";

const TopBar = () => {
  return (
    <div className="topbar-container">
      <div className="indices-container">
        <div className="nifty">
          <p className="index">NIFTY 50</p>
          <p className="index-points">21,482.10</p>
          <p className="percent">
            <PnLValue text="+0.84%" showArrow />
          </p>
        </div>
        <div className="sensex">
          <p className="index">SENSEX</p>
          <p className="index-points">71,210.55</p>
          <p className="percent">
            <PnLValue text="-0.31%" showArrow />
          </p>
        </div>
      </div>

      <Menu />
    </div>
  );
};

export default TopBar;
