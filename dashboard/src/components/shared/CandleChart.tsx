import React from "react";
import { Chart } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LinearScale,
  TimeScale,
  Tooltip,
} from "chart.js";
import {
  CandlestickController,
  CandlestickElement,
} from "chartjs-chart-financial";
import "chartjs-adapter-date-fns";

import { Candle } from "../../types";

ChartJS.register(CandlestickController, CandlestickElement, LinearScale, TimeScale, Tooltip);

// Colors mirror the CSS tokens in index.css (canvas can't read CSS vars):
// --gain #00c853, --loss #ff5252, --border #222228, --ink-2 #a0a0a8.
const GAIN = "#00c853";
const LOSS = "#ff5252";
const GRID = "#222228";
const TICK = "#a0a0a8";

interface CandleChartProps {
  candles: Candle[]; // ascending time: [ts_ms, open, high, low, close, volume]
}

const CandleChart = ({ candles }: CandleChartProps) => {
  const data = {
    datasets: [
      {
        label: "Price",
        data: candles.map(([x, o, h, l, c]) => ({ x, o, h, l, c })),
        backgroundColors: { up: GAIN, down: LOSS, unchanged: TICK },
        borderColors: { up: GAIN, down: LOSS, unchanged: TICK },
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#131316", // --surface
        borderColor: GRID,
        borderWidth: 1,
        titleColor: "#f0f0f2", // --ink
        bodyColor: TICK,
      },
    },
    scales: {
      x: {
        type: "time" as const,
        grid: { color: GRID },
        ticks: { color: TICK, maxTicksLimit: 8 },
      },
      y: {
        position: "right" as const,
        grid: { color: GRID },
        ticks: { color: TICK },
      },
    },
  };

  return <Chart type="candlestick" data={data} options={options} />;
};

export default CandleChart;
