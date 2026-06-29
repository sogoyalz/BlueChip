import React, { useState, useEffect } from "react";
import axios from "axios";
import { useCookies } from "react-cookie";
import { toast } from "react-toastify";
import { VerticalGraph } from "./VerticalGraph";

// Safe number formatter — a malformed row (null price/avg) won't blank the page.
const fmt = (n) => (typeof n === "number" && !isNaN(n) ? n.toFixed(2) : "—");

const Holdings = () => {
  const [allHoldings, setAllHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cookies] = useCookies(["token"]);

  useEffect(() => {
    setLoading(true);
    axios
      .get("http://localhost:3002/allHoldings", {
        params: { token: cookies.token },
        withCredentials: true,
      })
      .then((res) => setAllHoldings(res.data))
      .catch((err) => {
        console.error("Failed to load holdings:", err);
        toast.error("Could not load holdings.");
      })
      .finally(() => setLoading(false));
  }, [cookies.token]);

  const labels = allHoldings.map((stock) => stock.name);

  const data = {
    labels,
    datasets: [
      {
        label: "Stock Price",
        data: allHoldings.map((stock) => stock.price),
        backgroundColor: "rgba(255, 99, 132, 0.5)",
      },
    ],
  };

  return (
    <>
      <h3 className="title">Holdings ({allHoldings.length})</h3>

      <div className="order-table">
        <table>
          <thead>
            <tr>
              <th>Instrument</th>
              <th>Qty.</th>
              <th>Avg. cost</th>
              <th>LTP</th>
              <th>Cur. val</th>
              <th>P&L</th>
              <th>Net chg.</th>
              <th>Day chg.</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "24px" }}>
                  Loading holdings…
                </td>
              </tr>
            ) : allHoldings.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "24px" }}>
                  You don't have any holdings yet.
                </td>
              </tr>
            ) : (
              allHoldings.map((stock, index) => {
                const curValue = stock.price * stock.qty;
                const isProfit = curValue - stock.avg * stock.qty >= 0.0;
                const profClass = isProfit ? "profit" : "loss";
                const dayClass = stock.isLoss ? "loss" : "profit";

                return (
                  <tr key={index}>
                    <td>{stock.name}</td>
                    <td>{stock.qty}</td>
                    <td>{fmt(stock.avg)}</td>
                    <td>{fmt(stock.price)}</td>
                    <td>{fmt(curValue)}</td>
                    <td className={profClass}>
                      {fmt(curValue - stock.avg * stock.qty)}
                    </td>
                    <td className={profClass}>{stock.net}</td>
                    <td className={dayClass}>{stock.day}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="row">
        <div className="col">
          <h5>
            29,875.<span>55</span>{" "}
          </h5>
          <p>Total investment</p>
        </div>
        <div className="col">
          <h5>
            31,428.<span>95</span>{" "}
          </h5>
          <p>Current value</p>
        </div>
        <div className="col">
          <h5>1,553.40 (+5.20%)</h5>
          <p>P&L</p>
        </div>
      </div>
      <VerticalGraph data={data} />
    </>
  );
};

export default Holdings;
