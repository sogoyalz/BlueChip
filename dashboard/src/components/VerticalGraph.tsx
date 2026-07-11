import React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartData,
  ChartOptions,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// Canvas can't resolve CSS vars — these mirror the index.css tokens.
const font = { family: "Manrope, sans-serif", size: 11 };

export const options: ChartOptions<"bar"> = {
  responsive: true,
  plugins: {
    // single series — the panel heading names it, so no legend box
    legend: { display: false },
    title: { display: false },
    tooltip: {
      backgroundColor: "#1c1c21", // --surface-hover
      titleFont: font,
      bodyFont: font,
      padding: 10,
      cornerRadius: 6,
      displayColors: false,
    },
  },
  scales: {
    x: {
      grid: { display: false },
      border: { color: "#222228" }, // --border
      ticks: { color: "#6c6c74", font }, // --ink-3
    },
    y: {
      grid: { color: "#222228" },
      border: { display: false },
      ticks: { color: "#6c6c74", font },
    },
  },
};

export function VerticalGraph({ data }: { data: ChartData<"bar"> }) {
  return <Bar options={options} data={data} />;
}
