import React, { useState, useEffect } from "react";
import axios from "axios";
import { useCookies } from "react-cookie";
import { toast } from "react-toastify";

const fmt = (n) => (typeof n === "number" && !isNaN(n) ? n.toFixed(2) : "—");

const Positions = () => {
  const [allPositions, setAllPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cookies] = useCookies(["token"]);

  useEffect(() => {
    setLoading(true);
    axios
      .get("http://localhost:3002/allPositions", {
        params: { token: cookies.token },
        withCredentials: true,
      })
      .then((res) => setAllPositions(res.data))
      .catch((err) => {
        console.error("Failed to load positions:", err);
        toast.error("Could not load positions.");
      })
      .finally(() => setLoading(false));
  }, [cookies.token]);

  return (
    <>
      <h3 className="title">Positions ({allPositions.length})</h3>

      <div className="order-table">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Instrument</th>
              <th>Qty.</th>
              <th>Avg.</th>
              <th>LTP</th>
              <th>P&L</th>
              <th>Chg.</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "24px" }}>
                  Loading positions…
                </td>
              </tr>
            ) : allPositions.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "24px" }}>
                  You don't have any open positions.
                </td>
              </tr>
            ) : (
              allPositions.map((stock, index) => {
                const curValue = stock.price * stock.qty;
                const isProfit = curValue - stock.avg * stock.qty >= 0.0;
                const profClass = isProfit ? "profit" : "loss";
                const dayClass = stock.isLoss ? "loss" : "profit";

                return (
                  <tr key={index}>
                    <td>{stock.product}</td>
                    <td>{stock.name}</td>
                    <td>{stock.qty}</td>
                    <td>{fmt(stock.avg)}</td>
                    <td>{fmt(stock.price)}</td>
                    <td className={profClass}>
                      {fmt(curValue - stock.avg * stock.qty)}
                    </td>
                    <td className={dayClass}>{stock.day}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default Positions;
