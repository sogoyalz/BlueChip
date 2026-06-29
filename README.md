# BlueChip — Stock Trading Platform

A full-stack stock trading and investment platform inspired by Zerodha, built with the **MERN stack** (MongoDB, Express, React, Node.js). It features a marketing landing site, a user authentication flow, and a trading dashboard with live holdings, positions, orders, and interactive charts.

> This is a learning / portfolio project. "BlueChip" is a fictional brand and is not affiliated with any real broker.

---

## ✨ Features

- **Landing site** — home, about, products, pricing, and support pages
- **Authentication** — signup & login with hashed passwords (bcrypt) and JWT auth stored in cookies
- **Trading dashboard** — holdings, positions, orders, funds, and a watchlist
- **Buy/sell orders** — place new orders that persist to the database
- **Data visualisation** — doughnut and bar charts powered by Chart.js
- **Protected API** — dashboard data endpoints are guarded by JWT middleware

---

## 🏗️ Architecture

This is a monorepo with three independent applications:

```
BlueChip/
├── frontend/     # Landing site (React + CRA)          → http://localhost:3000
├── dashboard/    # Trading dashboard (React + MUI)      → http://localhost:3001
└── backend/      # REST API (Express + MongoDB)         → http://localhost:3002
```

| App | Tech | Port |
|-----|------|------|
| **frontend** | React 19, React Router, Bootstrap, Axios | 3000 |
| **dashboard** | React 19, Material UI, Chart.js, Axios | 3001 |
| **backend** | Express 5, Mongoose, JWT, bcrypt | 3002 |

---

## 🛠️ Tech Stack

**Frontend & Dashboard**
- React 19 + React Router 7
- Material UI (dashboard), Bootstrap (landing)
- Chart.js / react-chartjs-2
- Axios, react-toastify, react-cookie

**Backend**
- Node.js + Express 5
- MongoDB + Mongoose
- JWT (`jsonwebtoken`) for auth, `bcrypt` for password hashing
- `cors`, `cookie-parser`, `dotenv`

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- A [MongoDB](https://www.mongodb.com/atlas) database (Atlas or local)

### 1. Clone the repo
```bash
git clone https://github.com/sogoyalz/BlueChip.git
cd BlueChip
```

### 2. Set up the backend
```bash
cd backend
npm install
cp .env.example .env      # then fill in your real values (see below)
npm start                 # starts on http://localhost:3002
```

### 3. Set up the frontend (landing site)
```bash
cd frontend
npm install
npm start                 # starts on http://localhost:3000
```

### 4. Set up the dashboard
```bash
cd dashboard
npm install
npm start                 # starts on http://localhost:3001
```

> Run each in its own terminal tab. Start the backend first so the dashboard can fetch data.

---

## 🔑 Environment Variables

Each app uses a `.env` file (never committed — see `.env.example` for the template).

**`backend/.env`**
```env
MONGO_URL=your_mongodb_connection_string
TOKEN_KEY=your_jwt_secret
PORT=3002
```

**`frontend/.env`**
```env
PORT=3000
```

**`dashboard/.env`**
```env
PORT=3001
```

---

## 📡 API Endpoints

Base URL: `http://localhost:3002`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/signup` | — | Register a new user |
| `POST` | `/login` | — | Log in and receive a JWT cookie |
| `POST` | `/` | — | Verify the current auth token |
| `GET` | `/allHoldings` | ✅ | Get all holdings |
| `GET` | `/allPositions` | ✅ | Get all positions |
| `GET` | `/allOrders` | ✅ | Get all orders |
| `POST` | `/neworder` | ✅ | Place a new buy/sell order |

✅ = requires a valid JWT (sent via cookie).

---

## 🧪 Testing

The React apps use **Jest** + **React Testing Library** (via Create React App):

```bash
cd frontend && npm test     # landing-site component tests
cd dashboard && npm test     # dashboard component tests
```

---

## 📂 Project Structure

```
backend/
├── controllers/    # request handlers (auth)
├── middlewares/    # JWT verification
├── model/          # Mongoose models
├── schemas/        # Mongoose schemas
├── routes/         # Express routes
├── util/           # token helpers
└── index.js        # app entry point

frontend/src/landing_page/
├── home/  about/  products/  pricing/  support/
├── login/  signup/
├── Navbar.js  Footer.js  ...
└── test/           # component tests

dashboard/src/components/
├── Dashboard.js  Holdings.js  Positions.js  Orders.js
├── Funds.js  WatchList.js  Summary.js
├── BuyActionWindow.js  charts (Doughnut, Vertical)
└── ...
```

---

## 📝 License

This project is for educational purposes. Not for commercial use.
