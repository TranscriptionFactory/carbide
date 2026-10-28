import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Papa from "papaparse";
import { initSync, Model } from "@ironcalc/wasm";

const require = createRequire(import.meta.url);
const wasm_path = require.resolve("@ironcalc/wasm/wasm_bg.wasm");
initSync({ module: readFileSync(wasm_path) });

const CASES = [
  "1.0",
  "1.50",
  "007",
  "1e3",
  "-0",
  "2026-10-27",
  "10/27/2026",
  "50%",
  "$1,250.50",
  "TRUE",
  "true",
  "  padded  ",
  "=SUM(B2:D2)",
  "=sum(b2:d2)",
  "=B2*1.10",
  "=  B2 + 1",
  "'quoted",
  "[[some-note]]",
  "a,b",
  'say "hi"',
  "line1\nline2",
  "=[[budget]].B5",
  "#N/A",
  "",
];

const model = new Model("Sheet1", "en", "UTC", "en");
CASES.forEach((input, i) => model.setUserInput(0, i + 1, 1, input));
model.evaluate();

const mismatches = [];
CASES.forEach((input, i) => {
  const content = model.getCellContent(0, i + 1, 1);
  const shown = model.getFormattedCellValue(0, i + 1, 1);
  const flag = content === input ? "ok  " : "DIFF";
  if (content !== input) mismatches.push(input);
  console.log(
    `${flag} ${JSON.stringify(input).padEnd(18)} content=${JSON.stringify(content).padEnd(18)} shown=${JSON.stringify(shown)}`,
  );
});
console.log(
  `\n${mismatches.length}/${CASES.length} inputs not preserved by getCellContent`,
);

const csv =
  "Metric,Jan,Feb,Q\nRevenue,1200,1350,=SUM(B2:C2)\nCost,650,700,=SUM(B3:C3)\nNet,=B2-B3,=C2-C3,=D2-D3\n";
const grid = Papa.parse(csv, { skipEmptyLines: false }).data;
const m2 = new Model("Sheet1", "en", "UTC", "en");
m2.flushSendQueue();
grid.forEach((row, r) =>
  row.forEach((cell, c) => {
    if (cell !== "") m2.setUserInput(0, r + 1, c + 1, cell);
  }),
);
m2.evaluate();
console.log("\nD4 shown:", m2.getFormattedCellValue(0, 4, 4));
console.log("rows with data in col A:", Array.from(m2.getRowsWithData(0, 1)));
console.log(
  "cols with data in row 2:",
  Array.from(m2.getColumnsWithData(0, 2)),
);
console.log("send queue bytes after load:", m2.flushSendQueue().length);
console.log("send queue bytes after no-op:", m2.flushSendQueue().length);
m2.setUserInput(0, 2, 2, "1300");
console.log("send queue bytes after edit:", m2.flushSendQueue().length);
m2.setSelectedCell(3, 3);
console.log(
  "send queue bytes after selection only:",
  m2.flushSendQueue().length,
);
