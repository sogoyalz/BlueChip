import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useCookies } from "react-cookie";
import { toast } from "react-toastify";

const fmt = (n) => (typeof n === "number" && !isNaN(n) ? n.toFixed(2) : "—");

const Orders = () => {
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cookies] = useCookies(["token"]);

  useEffect(() => {
    setLoading(true);
    axios
      .get("http://localhost:3002/allOrders", {
        params: { token: cookies.token },
        withCredentials: true,
      })
      .then((res) => setAllOrders(res.data))
      .catch((err) => {
        console.error("Failed to load orders:", err);
        toast.error("Could not load orders.");
      })
      .finally(() => setLoading(false));
  }, [cookies.token]);

  if (loading) {
    return (
      <div className="orders">
        <div className="no-orders">
          <p>Loading orders…</p>
        </div>
      </div>
    );
  }

  if (allOrders.length === 0) {
    return (
      <div className="orders">
        <div className="no-orders">
          <p>You haven't placed any orders today</p>

          <Link to={"/"} className="btn">
            Get started
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <h3 className="title">Orders ({allOrders.length})</h3>

      <div className="order-table">
        <table>
          <thead>
            <tr>
              <th>Instrument</th>
              <th>Qty.</th>
              <th>Price</th>
              <th>Mode</th>
            </tr>
          </thead>
          <tbody>
            {allOrders.map((order, index) => (
              <tr key={index}>
                <td>{order.name}</td>
                <td>{order.qty}</td>
                <td>{fmt(Number(order.price))}</td>
                <td className={order.mode === "BUY" ? "profit" : "loss"}>
                  {order.mode}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default Orders;
