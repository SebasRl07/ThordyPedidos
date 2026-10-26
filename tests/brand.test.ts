import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, input } from "./helpers.ts";
import { createOrder, transition } from "../server/orders.ts";
import { localDate } from "../server/db.ts";
import { workbook } from "../server/reports.ts";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
test("recursos oficiales locales: contornos íntegros, sin texto reconstruido ni recursos externos", () => {
  const data = JSON.parse(readFileSync("docs/brand/recursos.json", "utf8")) as {
    assets: { file: string; sha256: string; paths: number }[];
  };
  for (const asset of data.assets) {
    const bytes = readFileSync("public/brand/" + asset.file),
      svg = bytes.toString();
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      asset.sha256,
    );
    assert.equal((svg.match(/<path\s/g) || []).length, asset.paths);
    assert.doesNotMatch(svg, /<(?:text|script|image)\b|(?:href|src)=/);
    assert.match(svg, /viewBox=/);
  }
  const manifest = JSON.parse(
    readFileSync("public/manifest.webmanifest", "utf8"),
  );
  for (const icon of manifest.icons) {
    const png = readFileSync("public" + icon.src);
    assert.equal(png.subarray(1, 4).toString(), "PNG");
  }
  assert.equal(manifest.theme_color, "#6A0B07");
});
test("Excel con marca oficial conserva ventas, líneas y tres hojas", async () => {
  const f = fixture();
  try {
    let order = createOrder(f.db, input(), 1);
    for (const status of ["ready", "dispatched", "delivered"])
      order = transition(f.db, order.id, { expected: order.status, status }, 1);
    const day = localDate(order.created_at);
    const book = await workbook(f.db, { from: day, to: day });
    assert.equal(book.worksheets.length, 3);
    assert.equal(book.getWorksheet("Pedidos")!.getCell(2, 20).value, 34000);
    assert.equal(book.getWorksheet("Productos vendidos")!.rowCount, 3);
    const summary = book.getWorksheet("Resumen")!;
    assert.equal(summary.getImages().length, 1);
    assert.equal(summary.getCell(7, 1).value, "Indicador");
    assert.equal(summary.getCell(15, 2).value, 34000);
    assert.ok((await book.xlsx.writeBuffer()).byteLength > 10000);
  } finally {
    f.close();
  }
});
