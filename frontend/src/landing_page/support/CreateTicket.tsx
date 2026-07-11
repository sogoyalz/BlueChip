import React from "react";

const topics = [
  {
    icon: "fa-plus-circle",
    title: "Account Opening",
    links: [
      "Online Account Opening",
      "Joint and LLC Accounts",
      "Retirement Accounts (IRA)",
      "Charges at BlueChip",
      "Getting Started",
    ],
  },
  {
    icon: "fa-user",
    title: "Your BlueChip Account",
    links: [
      "Profile and KYC details",
      "Account modification",
      "Nomination",
      "Transfer and conversion of securities",
      "Closing your account",
    ],
  },
  {
    icon: "fa-bar-chart",
    title: "Trading and Markets",
    links: [
      "Placing and modifying orders",
      "Margins and leverage",
      "Corporate actions",
      "Alerts and nudges",
      "Terminal user guide",
    ],
  },
  {
    icon: "fa-credit-card",
    title: "Funds",
    links: [
      "Adding funds",
      "Withdrawing funds",
      "ACH and wire transfers",
      "Deposit and withdrawal timelines",
    ],
  },
  {
    icon: "fa-envelope",
    title: "Reports and Statements",
    links: [
      "Profit & loss reports",
      "Tax reports",
      "Contract notes",
      "Holdings statements",
    ],
  },
  {
    icon: "fa-code",
    title: "API and Developers",
    links: [
      "Generating API keys",
      "Rate limits",
      "Webhooks",
      "SDKs and sample code",
    ],
  },
];

function CreateTicket() {
  return (
    <div className="container section" id="createTicket">
      <h2 className="section-title mb-4">
        To create a ticket, select a relevant topic
      </h2>
      <div className="row gy-4">
        {topics.map((topic) => (
          <div className="col-md-4 col-sm-6" key={topic.title}>
            <div className="panel h-100">
              <span className="icon-chip">
                <i className={`fa ${topic.icon}`} aria-hidden="true"></i>
              </span>
              <h3 className="fs-6 mb-3">{topic.title}</h3>
              <ul className="topic-links">
                {topic.links.map((link) => (
                  <li key={link}>{link}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CreateTicket;
