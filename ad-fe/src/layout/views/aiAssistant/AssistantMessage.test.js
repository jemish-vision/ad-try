import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import AssistantMessage from "./AssistantMessage";

let mockReportProps;
jest.mock("../../../helper/chatbot/reporting/ChatReportRenderer", () => function Report(props) {
  mockReportProps = props;
  return <button onClick={() => props.onFollowUp("Show campaigns")}>Show campaigns</button>;
});

beforeEach(() => { mockReportProps = undefined; });

test("puts a readable summary before a full-width report and preserves follow-ups", () => {
  const onFollowUp = jest.fn();
  const report = { id: "actual-report" };
  render(<AssistantMessage message={{ text: "**Sales** increased.", report, time: Date.now() }}
    profileNames={{ 123: "Tagdo" }} currencyCode="INR" isDark onFollowUp={onFollowUp} />);

  expect(screen.getByRole("heading", { name: "At a glance" })).toBeInTheDocument();
  expect(screen.getByText("Sales").tagName).toBe("STRONG");
  expect(mockReportProps).toMatchObject({ report, layoutVariant: "workspace", isExpanded: true, currencyCode: "INR" });
  fireEvent.click(screen.getByRole("button", { name: "Show campaigns" }));
  expect(onFollowUp).toHaveBeenCalledWith("Show campaigns");
});

test("plain answers do not acquire empty report sections or invented numbers", () => {
  render(<AssistantMessage message={{ text: "Please choose a profile.", time: Date.now() }} />);
  expect(screen.getByText("Please choose a profile.")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "At a glance" })).not.toBeInTheDocument();
  expect(mockReportProps).toBeUndefined();
});

test("stream progress remains accessible without hiding an answer already arriving", () => {
  const { rerender } = render(<AssistantMessage message={{ status: "Reading your report", text: "Sales are", isStreaming: true }} />);
  expect(screen.getByRole("status")).toHaveTextContent("Reading your report");
  expect(screen.getByRole("article")).toHaveAttribute("aria-busy", "true");
  expect(screen.getByText("Sales are")).toBeInTheDocument();
  rerender(<AssistantMessage message={{ text: "Sales are available.", isStreaming: false }} />);
  expect(screen.getByRole("article")).toHaveAttribute("aria-busy", "false");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("message markup remains inert", () => {
  render(<AssistantMessage message={{ text: '<img src=x onerror="alert(1)">', time: Date.now() }} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
