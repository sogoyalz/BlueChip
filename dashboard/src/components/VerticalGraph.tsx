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

const font = { family: "Inter, sans-serif", size: 11 };

export const options: ChartOptions<"bar"> = {
  responsive: true,
  plugins: {
    // single series — the panel heading names it, so no legend box
    legend: { display: false },
    title: { display: false },
    tooltip: {
      backgroundColor: "#16181d",
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
      border: { color: "#2a2a2a" },
      ticks: { color: "#666666", font },
    },
    y: {
      grid: { color: "#2a2a2a" },
      border: { display: false },
      ticks: { color: "#666666", font },
    },
  },
};

export function VerticalGraph({ data }: { data: ChartData<"bar"> }) {
  return <Bar options={options} data={data} />;
}
