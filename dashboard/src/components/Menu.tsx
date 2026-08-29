import React, { useEffect, useRef, useState } from "react";

import { Link, useLocation } from "react-router-dom";
import axios from "axios";

import { API_URL, LOGIN_URL } from "../config";
import { Account } from "../types";

const menuItems = [
  { to: "/", label: "Dashboard" },
  { to: "/orders", label: "Orders" },
  { to: "/holdings", label: "Holdings" },
  { to: "/funds", label: "Funds" },
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

  const profileRef = useRef<HTMLDivElement>(null);

  const handleProfileClick = () => {
    setIsProfileDropdownOpen((open) => !open);
  };

  // A dropdown that only closes by clicking its own trigger again is a trap:
  // clicking elsewhere leaves it hanging over the page, and Escape — the key
  // every other dismissable surface in this app answers to — did nothing.
  useEffect(() => {
    if (!isProfileDropdownOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setIsProfileDropdownOpen(false);
      // Focus goes back to the trigger, not to wherever the page happens to
      // start, so a keyboard user does not lose their place.
      profileRef.current?.querySelector<HTMLButtonElement>(".profile")?.focus();
    };
    const onPointerDown = (e: MouseEvent) => {
      if (!profileRef.current?.contains(e.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    };

    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [isProfileDropdownOpen]);

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
        <nav aria-label="Main">
        <ul>
          {menuItems.map((item) => (
            <li key={item.to}>
              <Link
                style={{ textDecoration: "none" }}
                to={item.to}
                // The active item was distinguished by colour alone, so a
                // screen-reader user had no way to tell where they were.
                aria-current={location.pathname === item.to ? "page" : undefined}
              >
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
        </nav>
        <hr />
        <div className="profile-wrap" ref={profileRef}>
        <button
          type="button"
          className="profile"
          onClick={handleProfileClick}
          // Deliberately not aria-haspopup="menu": that promises a menu with
          // menuitem children and arrow-key navigation, and this is one button
          // revealing one other button. aria-expanded alone describes it
          // honestly.
          aria-expanded={isProfileDropdownOpen}
        >
          <div className="avatar">{initials}</div>
          <span className="username">{username ?? "Account"}</span>
        </button>
        {isProfileDropdownOpen && (
          <div className="profile-dropdown">
            <button type="button" className="logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default Menu;
