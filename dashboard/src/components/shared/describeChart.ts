import { ChartData } from "chart.js";

/**
 * A spoken description of a single-dataset category chart.
 *
 * Charts are canvas: a screen reader gets nothing from them at all unless the
 * element carries a name. These charts each plot one value per category and
 * few enough categories to read aloud, so the honest alternative is the list
 * itself rather than a vague "chart of holdings".
 */
export function describeCategoryChart(
  data: ChartData<"doughnut"> | ChartData<"bar">,
  title: string,
  format: (value: number) => string,
): string {
  const labels = (data.labels ?? []) as string[];
  const values = (data.datasets?.[0]?.data ?? []) as number[];

  if (labels.length === 0 || values.length === 0) {
    return `${title}. No data available.`;
  }

  const parts = labels.map(
    (label, i) => `${label} ${format(Number(values[i]) || 0)}`,
  );
  const noun = labels.length === 1 ? "entry" : "entries";
  return `${title}. ${labels.length} ${noun}: ${parts.join(", ")}.`;
}
