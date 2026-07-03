import React from "react";
import { Link } from "react-router-dom";

import Hero from "./Hero";
import LeftSection from "./LeftSection";
import RightSection from "./RightSection";
import Universe from "./Universe";

function ProductPage() {
  return (
    <>
      <Hero />
      <LeftSection
        imageURL="/media/images/productTerminal.svg"
        productName="Terminal"
        productDescription="Our ultra-fast flagship trading platform with streaming market data, advanced charts, and an elegant dark UI. Trade seamlessly on the web and on your Android and iOS devices."
        tryDemo="/signup"
        learnMore="/support"
        googlePlay="/signup"
        appStore="/signup"
      />
      <RightSection
        imageURL="/media/images/productReports.svg"
        productName="Reports"
        productDescription="The central dashboard for your BlueChip account. Gain insights into your trades and investments with in-depth reports and visualisations."
        learnMore="/support"
      />
      <LeftSection
        imageURL="/media/images/productVault.svg"
        productName="Vault"
        productDescription="Buy direct mutual funds and build long-term wealth, commission-free, delivered directly to your Demat account. Invest at your own pace from any device."
        tryDemo="/signup"
        learnMore="/support"
        googlePlay="/signup"
        appStore="/signup"
      />
      <RightSection
        imageURL="/media/images/productApi.svg"
        productName="BlueChip API"
        productDescription="Build powerful trading platforms and experiences with our super simple HTTP/JSON APIs. If you are a startup, build your investment app on BlueChip rails."
        learnMore="/support"
      />
      <p className="text-center mb-5">
        Want to know more about our technology stack? Check out the{" "}
        <Link to="/about">BlueChip engineering blog</Link>.
      </p>
      <Universe />
    </>
  );
}

export default ProductPage;
