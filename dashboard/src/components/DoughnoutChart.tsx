import React from "react";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  ChartData,
  ChartOptions,
} from "chart.js";
import { Doughnut } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend);

const font = { family: "Inter, sans-serif", size: 11 };

const options: ChartOptions<"doughnut"> = {
  responsive: true,
  cutout: "62%",
  plugins: {
    legend: {
      position: "bottom",
      labels: {
        color: "#a0a0a0",
        font,
        usePointStyle: true,
        pointStyle: "circle",
        boxWidth: 8,
        boxHeight: 8,
        padding: 14,
      },
    },
    tooltip: {
      backgroundColor: "#16181d",
      titleFont: font,
      bodyFont: font,
      padding: 10,
      cornerRadius: 6,
    },
  },
};

export function DoughnutChart({ data }: { data: ChartData<"doughnut"> }) {
  return <Doughnut data={data} options={options} />;
}
