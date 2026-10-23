import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import ReportCharts from "./ReportCharts";
import { cartesianData, donutData, heatmapData } from "./reportChartData";

let mockChartProps;

jest.mock("react-apexcharts", () => function MockChart(props) {
  mockChartProps = props;
  return <div data-testid="chart" />;
});

function dataset(rows, metric = "cvr", unit = "percent", currencyCode = "USD") {
  return {
    id: "evidence",
    currencyCode,
    columns: [
      { key: "name", type: "string" },
      { key: metric, type: "number", unit, label: metric },
    ],
    rows,
  };
}

function captureChartProps(type, source, extra = {}) {
  const block = { type, datasetId: source.id, xKey: "name", yKeys: [source.columns[1].key], ...extra };
  render(<ReportCharts block={block} datasets={[source]} />);
  return mockChartProps;
}

beforeEach(() => { mockChartProps = undefined; });

test.each(["line", "bar", "grouped_bar"])("%s preserves unknown values and formats percentages", type => {
  const props = captureChartProps(type, dataset([{ name: "First", cvr: null }, { name: "Second", cvr: 12 }]));
  expect(props.series[0].data).toEqual([null, 12]);
  expect(props.options.tooltip.y.formatter(12, { seriesIndex: 0 })).toBe("12%");
  expect(props.options.tooltip.y.formatter(null, { seriesIndex: 0 })).toBe("Unavailable");
});

test("bar preserves all ten requested campaign names and values", () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({ name: `Campaign ${index} with a long descriptive name`, orders: index }));
  const props = captureChartProps("bar", dataset(rows, "orders", "count"));
  expect(props.options.xaxis.categories).toEqual(rows.map(row => row.name));
  expect(props.series[0].data).toEqual(rows.map(row => row.orders));
  expect(props.options.tooltip.x.formatter("", { dataPointIndex: 9 })).toBe(rows[9].name);
  expect(props.options.tooltip.y.formatter(9, {})).toBe("9");
});

test("dataset currency controls money tooltips", () => {
  const props = captureChartProps("line", dataset([{ name: "Today", sales: 12.5 }], "sales", "currency", "EUR"));
  expect(props.options.tooltip.y.formatter(12.5, {})).toBe("€12.50");
});

test("all missing cartesian values show an explicit unavailable state", () => {
  captureChartProps("line", dataset([{ name: "Today", cvr: null }]));
  expect(screen.getByText(/No observed values/)).toBeInTheDocument();
  expect(mockChartProps).toBeUndefined();
});

test("missing dataset never falls back to another dataset", () => {
  render(<ReportCharts block={{ type: "line", datasetId: "missing" }} datasets={[dataset([{ name: "Today", cvr: 20 }])]} />);
  expect(screen.getByText(/data for this chart is not available yet/)).toBeInTheDocument();
  expect(mockChartProps).toBeUndefined();
});

test("chart headings and profile labels hide internal report routing details", () => {
  const source = dataset([{ name: "2630925322373862", spend: 25 }], "spend", "currency", "INR");
  render(<ReportCharts
    block={{ type: "bar", title: "summary · SP · 2630925322373862 · current · returned rows", datasetId: source.id, xKey: "name", yKeys: ["spend"] }}
    datasets={[source]}
    profileNames={{ "2630925322373862": "Tagdo" }}
  />);
  expect(screen.getByText("Performance · Selected period · Tagdo · Sponsored Products")).toBeInTheDocument();
  expect(mockChartProps.options.xaxis.categories).toEqual(["Tagdo"]);
  expect(mockChartProps.series[0].name).toBe("Ad spend");
  expect(source.rows[0].name).toBe("2630925322373862");
});

test("chart canvas follows chat content width when the panel is resized", () => {
  const originalObserver = global.ResizeObserver;
  const rect = jest.spyOn(HTMLElement.prototype, "getBoundingClientRect");
  const source = dataset([{ name: "Campaign", spend: 25 }], "spend", "currency");
  let resize;
  const disconnect = jest.fn();
  global.ResizeObserver = class {
    constructor(callback) { resize = callback; }
    observe() {}
    disconnect() { disconnect(); }
  };

  try {
    rect.mockReturnValue({ width: 715 });
    const { rerender, unmount } = render(<ReportCharts block={{ type: "bar", datasetId: source.id, xKey: "name", yKeys: ["spend"] }} datasets={[source]} isExpanded />);
    expect(mockChartProps.width).toBe(715);
    rect.mockReturnValue({ width: 275 });
    rerender(<ReportCharts block={{ type: "bar", datasetId: source.id, xKey: "name", yKeys: ["spend"] }} datasets={[source]} />);
    expect(mockChartProps.width).toBe(275);
    expect(typeof resize).toBe("function");
    unmount();
    expect(disconnect).toHaveBeenCalled();
  } finally {
    rect.mockRestore();
    global.ResizeObserver = originalObserver;
  }
});

test("seriesKey pivots comparisons without merging absent or duplicate coordinates", () => {
  const source = dataset([
    { name: "A", period: "current", cvr: 10 },
    { name: "A", period: "previous", cvr: 5 },
    { name: "B", period: "current", cvr: 12 },
  ]);
  const data = cartesianData({ xKey: "name", yKeys: ["cvr"], seriesKey: "period" }, source);
  expect(data.categories).toEqual(["A", "B"]);
  expect(data.series).toEqual([
    { name: "current", data: [10, 12] },
    { name: "previous", data: [5, null] },
  ]);
  source.rows.push({ name: "A", period: "current", cvr: 4 });
  expect(cartesianData({ xKey: "name", yKeys: ["cvr"], seriesKey: "period" }, source).series[0].data[0]).toBeNull();
});

test("donut uses the declared metric and aggregates Other into at most five slices", () => {
  const source = dataset([1, 2, 3, 4, 5, 6, 7].map(value => ({ name: `P${value}`, orders: value, spend: 999 })), "orders", "count");
  const data = donutData({ xKey: "name", yKeys: ["orders"] }, source);
  expect(data.labels).toEqual(["P7", "P6", "P5", "P4", "Other"]);
  expect(data.series).toEqual([7, 6, 5, 4, 6]);
  expect(data.series.reduce((sum, value) => sum + value, 0)).toBe(28);
});

test("donut discloses unknown values and does not add them as zero slices", () => {
  const props = captureChartProps("donut", dataset([{ name: "Known", orders: 3 }, { name: "Unknown", orders: null }], "orders", "count"));
  expect(props.series).toEqual([3]);
  expect(props.options.labels).toEqual(["Known"]);
  expect(screen.getByText(/1 unavailable values are excluded/)).toBeInTheDocument();
});

test("heatmap preserves missing, filtered, partial and observed zero cells distinctly", () => {
  const source = dataset([
    { weekday: "Monday", hour: "00", cvr: 0 },
    { weekday: "Monday", hour: "01", cvr: 12, status: "filtered" },
    { weekday: "Monday", hour: "02", cvr: null },
    { weekday: "Monday", hour: "03", cvr: 10, status: "partial_coverage" },
  ]);
  const data = heatmapData({ xKey: "hour", yKeys: ["weekday"], valueKey: "cvr" }, source);
  expect(data.series).toHaveLength(7);
  expect(data.series[0].data).toHaveLength(24);
  expect(data.series[0].data[0]).toMatchObject({ y: 0, status: "observed" });
  expect(data.series[0].data[1]).toMatchObject({ y: null, status: "filtered" });
  expect(data.series[0].data[2].y).toBeNull();
  expect(data.series[0].data[3]).toMatchObject({ y: 10, status: "partial_coverage" });
  expect(data.series[0].data[4]).toMatchObject({ y: null, status: "missing" });
});

test("heatmap uses metric units and status in tooltips instead of fixed spend bands", () => {
  const props = captureChartProps("heatmap", dataset([{ weekday: "Monday", hour: 12, cvr: 12 }]), {
    xKey: "hour", yKeys: ["weekday"], valueKey: "cvr",
  });
  expect(props.options.tooltip.custom({ seriesIndex: 0, dataPointIndex: 12 })).toContain("12%");
  expect(props.options.tooltip.custom({ seriesIndex: 0, dataPointIndex: 0 })).toContain("missing");
  expect(props.options.plotOptions.heatmap.colorScale).toBeUndefined();
  expect(screen.getByText(/Grey cells are unavailable/)).toBeInTheDocument();
});

test("heatmap paints missing and filtered cells separately from observed zero", () => {
  const props = captureChartProps("heatmap", dataset([
    { weekday: "Monday", hour: 0, cvr: 0 },
    { weekday: "Monday", hour: 1, cvr: null },
    { weekday: "Monday", hour: 2, cvr: 12, status: "filtered" },
  ]), { xKey: "hour", yKeys: ["weekday"], valueKey: "cvr" });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const rectangles = [];

  for (let index = 0; index < 3; index += 1) {
    const rectangle = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rectangle.setAttribute("class", "apexcharts-heatmap-rect");
    rectangle.setAttribute("i", "0");
    rectangle.setAttribute("j", String(index));
    rectangle.setAttribute("fill", "#ffffff");
    svg.appendChild(rectangle);
    rectangles.push(rectangle);
  }

  props.options.chart.events.mounted({ el: svg });
  expect(rectangles[0].getAttribute("fill")).toBe("#ffffff");
  expect(rectangles[1].getAttribute("fill")).toBe("#e2e8f0");
  expect(rectangles[2].getAttribute("fill")).toBe("#fef3c7");
  expect(rectangles[2].getAttribute("aria-label")).toContain("filtered");
});

test("grouped_bar with more than 8 categories defaults to Top 8 and cleans repetitive entity prefixes on axis", () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({
    name: `Tagdo SP · Campaign-${index + 1}`,
    currentValue: 10 + index,
    previousValue: 8 + index,
  }));
  const source = {
    id: "evidence_grouped",
    currencyCode: "INR",
    columns: [
      { key: "name", type: "string" },
      { key: "currentValue", type: "number", unit: "percent", label: "Current ACOS" },
      { key: "previousValue", type: "number", unit: "percent", label: "Previous ACOS" },
    ],
    rows,
  };
  const { getByText } = render(
    <ReportCharts
      block={{
        type: "grouped_bar",
        title: "ACOS comparison · INR",
        datasetId: source.id,
        xKey: "name",
        yKeys: ["currentValue", "previousValue"],
      }}
      datasets={[source]}
      profileNames={{ "2630925322373862": "Tagdo" }}
    />
  );

  // Segmented control buttons appear
  expect(getByText("Top 8")).toBeInTheDocument();
  expect(getByText("Top 15")).toBeInTheDocument();
  expect(getByText("All (25)")).toBeInTheDocument();

  // Axis categories are capped to 8 by default and repetitive prefix "Tagdo SP · " is stripped
  expect(mockChartProps.options.xaxis.categories).toHaveLength(8);
  expect(mockChartProps.options.xaxis.categories[0]).toBe("Campaign-1");
  expect(mockChartProps.options.xaxis.categories[7]).toBe("Campaign-8");

  // Tooltip preserves full entity name
  expect(mockChartProps.options.tooltip.x.formatter("", { dataPointIndex: 0 })).toBe("Tagdo SP · Campaign-1");
});

