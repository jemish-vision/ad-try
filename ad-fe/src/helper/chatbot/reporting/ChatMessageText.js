import React from "react";
import { friendlyText } from "./reportDisplay";

function inlineText(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => (
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <React.Fragment key={index}>{part}</React.Fragment>
  ));
}

// React text nodes escape untrusted output. Only simple formatting is interpreted.
export default function ChatMessageText({ text = "", isReport = false, currencyCode }) {
  const normalized = String(text)
    .replace(/<\/?b>/gi, "**")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/?(?:span|div|p)(?:\s[^>]*)?>/gi, "");
  let value = isReport ? friendlyText(normalized) : normalized;
  if (isReport && /^[A-Z]{3}$/.test(currencyCode || "")) {
    value = value.replace(/\b(SALES|SPEND) (increased|decreased) by (-?\d+(?:\.\d+)?) currency\b/g,
      (_, metric, direction, amount) => {
        const formatted = new Intl.NumberFormat("en-IN", {
          style: "currency", currency: currencyCode, maximumFractionDigits: 2,
        }).format(Number(amount));
        return `${metric === "SALES" ? "Ad sales" : "Ad spend"} ${direction} by ${formatted}`;
      });
  }
  const lines = value.split("\n");
  const contents = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;

    if (line.startsWith("|") && /^\|[\s:|-]+\|$/.test(lines[index + 1]?.trim() || "")) {
      const cells = row => row.split("|").slice(1, -1).map(cell => cell.trim());
      const headers = cells(line);
      const rows = [];
      index += 2;

      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(cells(lines[index]));
        index += 1;
      }

      index -= 1;
      contents.push(
        <div key={`table-${index}`} className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-xs">
            <thead><tr>{headers.map((header, cell) => <th key={cell} className="px-3 py-2 bg-slate-100 dark:bg-slate-800">{inlineText(header)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 border-t border-slate-200 dark:border-slate-700">{inlineText(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    } else {
      contents.push(<p key={index} className="mb-2 last:mb-0 break-words">{inlineText(line.replace(/^#{1,6}\s+/, ""))}</p>);
    }
  }

  return <div className="min-w-0 leading-relaxed">{contents}</div>;
}
