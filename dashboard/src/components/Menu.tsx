import React, { useState } from "react";

import { Link, useLocation } from "react-router-dom";

const menuItems = [
  { to: "/", label: "Dashboard" },
  { to: "/orders", label: "Orders" },
  { to: "/holdings", label: "Holdings" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/funds", label: "Funds" },
  { to: "/apps", label: "Apps" },
];

const Menu = () => {
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const location = useLocation();

  const handleProfileClick = () => {
    setIsProfileDropdownOpen(!isProfileDropdownOpen);
  };

  return (
    <div className="menu-container">
      <img src="/logo.svg" style={{ width: "50px" }} alt="BlueChip" />
      <div className="menus">
        <ul>
          {menuItems.map((item) => (
            <li key={item.to}>
              <Link style={{ textDecoration: "none" }} to={item.to}>
                <p
                  className={
                    location.pathname === item.to ? "menu selected" : "menu"
                  }
                >
                  {item.label}
                </p>
              </Link>
            </li>
          ))}
        </ul>
        <hr />
        <div className="profile" onClick={handleProfileClick}>
          <div className="avatar">BC</div>
          <p className="username">USERID</p>
        </div>
      </div>
    </div>
  );
};

export default Menu;
