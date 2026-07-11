import React, { useState, useEffect } from "react";
import axios from "axios";
import { useCookies } from "react-cookie";
import { toast } from "react-toastify";

import DataTable, { Column } from "./shared/DataTable";
import EmptyState from "./shared/EmptyState";
import PnLValue from "./shared/PnLValue";
import StatCard from "./shared/StatCard";
import { API_URL } from "../config";

interface LeaderboardRow {
  rank: number;
  username: string;
  value: number;
  returnPct: number;
}

interface LeaderboardResponse {
  rows: LeaderboardRow[];
  me: LeaderboardRow | null;
  totalUsers: number;
}

const fmt$ = (n: number) =>
  "$" +
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtPct = (p: number) => (p >= 0 ? "+" : "") + p.toFixed(2) + "%";

const Leaderboard = () => {
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [cookies] = useCookies(["token"]);

  useEffect(() => {
    // During the ?token= login handoff the first render has no cookie yet;
    // stay in the loading state until Home.tsx stores it and this re-runs.
    if (!cookies.token) return;
    let cancelled = false;
    const load = (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      axios
        .get<LeaderboardResponse>(`${API_URL}/api/leaderboard`, {
          params: { token: cookies.token },
          withCredentials: true,
        })
        .then((res) => {
          if (!cancelled) setBoard(res.data);
        })
        .catch((err) => {
          console.error("Failed to load leaderboard:", err);
          if (showSpinner) toast.error("Could not load leaderboard.");
        })
        .finally(() => {
          if (showSpinner && !cancelled) setLoading(false);
        });
    };
    load(true);
    const timer = setInterval(() => load(false), 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [cookies.token]);

  const me = board?.me ?? null;

  const columns: Column<LeaderboardRow>[] = [
    {
      key: "rank",
      label: "Rank",
      render: (r) => (r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : `#${r.rank}`),
    },
    {
      key: "username",
      label: "Trader",
      render: (r) =>
        me && r.rank === me.rank && r.username === me.username ? (
          <strong>{r.username} (you)</strong>
        ) : (
          r.username
        ),
    },
    { key: "value", label: "Portfolio value", render: (r) => fmt$(r.value) },
    {
      key: "returnPct",
      label: "Return",
      render: (r) => <PnLValue text={fmtPct(r.returnPct)} showArrow />,
    },
  ];

  return (
    <>
      <h3 className="title">
        Leaderboard{board ? ` · ${board.totalUsers} traders` : ""}
      </h3>

      {me && (
        <div className="row">
          <StatCard label="Your rank">#{me.rank}</StatCard>
          <StatCard label="Your portfolio">{fmt$(me.value)}</StatCard>
          <StatCard label="Your return">
            <PnLValue text={fmtPct(me.returnPct)} showArrow />
          </StatCard>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={board?.rows ?? []}
        rowKey={(r) => r.rank}
        loading={loading}
        loadingLabel="Loading leaderboard…"
        emptyContent={
          <EmptyState message="No traders yet — you could be first on the board." />
        }
      />
    </>
  );
};

export default Leaderboard;
