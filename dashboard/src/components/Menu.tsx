import React, { useEffect, useState } from "react";

import { Link, useLocation } from "react-router-dom";
import axios from "axios";

import { API_URL, LOGIN_URL } from "../config";
import { Account } from "../types";

const menuItems = [
  { to: "/", label: "Dashboard" },
  { to: "/orders", label: "Orders" },
  { to: "/holdings", label: "Holdings" },
  { to: "/funds", label: "Funds" },
  { to: "/apps", label: "Apps" },
];

const Menu = () => {
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const location = useLocation();

  // Show the logged-in user's name (and derive avatar initials from it). The
  // account endpoint is authenticated; Menu only renders inside the verified
  // dashboard, so the cookie is always present here.
  useEffect(() => {
    let cancelled = false;
    axios
      .get<Account>(`${API_URL}/api/account`, { withCredentials: true })
      .then((res) => {
        if (!cancelled) setUsername(res.data.username);
      })
      .catch(() => {
        /* non-fatal: fall back to the placeholder label */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const initials = username
    ? username.slice(0, 2).toUpperCase()
    : "BC";

  const handleProfileClick = () => {
    setIsProfileDropdownOpen(!isProfileDropdownOpen);
  };

  const handleLogout = async () => {
    try {
      // Clears the httpOnly auth cookie server-side (the browser sends it via
      // withCredentials). JS can't touch that cookie, so this is what logs out.
      await axios.post(`${API_URL}/logout`, {}, { withCredentials: true });
    } catch {
      // best-effort — redirect to login regardless
    }
    window.location.href = LOGIN_URL;
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
          <div className="avatar">{initials}</div>
          <p className="username">{username ?? "Account"}</p>
        </div>
        {isProfileDropdownOpen && (
          <div className="profile-dropdown">
            <button type="button" className="logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Menu;
