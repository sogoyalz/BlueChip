import React, { useState } from "react";

import BuySellModal from "./shared/BuySellModal";
import { TradeMode } from "../types";

interface GeneralContextValue {
  openTradeWindow: (uid: string, mode?: TradeMode) => void;
  closeTradeWindow: () => void;
  // legacy aliases
  openBuyWindow: (uid: string) => void;
  closeBuyWindow: () => void;
}

const GeneralContext = React.createContext<GeneralContextValue>({
  openTradeWindow: () => {},
  closeTradeWindow: () => {},
  // legacy aliases
  openBuyWindow: () => {},
  closeBuyWindow: () => {},
});

interface TradeWindowState {
  uid: string;
  mode: TradeMode;
}

export const GeneralContextProvider = (props: { children: React.ReactNode }) => {
  const [tradeWindow, setTradeWindow] = useState<TradeWindowState | null>(null);

  const handleOpenTradeWindow = (uid: string, mode: TradeMode = "BUY") => {
    setTradeWindow({ uid, mode });
  };

  const handleCloseTradeWindow = () => {
    setTradeWindow(null);
  };

  return (
    <GeneralContext.Provider
      value={{
        openTradeWindow: handleOpenTradeWindow,
        closeTradeWindow: handleCloseTradeWindow,
        // legacy aliases kept until all callers migrate
        openBuyWindow: handleOpenTradeWindow,
        closeBuyWindow: handleCloseTradeWindow,
      }}
    >
      {props.children}
      {tradeWindow && (
        <BuySellModal uid={tradeWindow.uid} initialMode={tradeWindow.mode} />
      )}
    </GeneralContext.Provider>
  );
};

export default GeneralContext;
