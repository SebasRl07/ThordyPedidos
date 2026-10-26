import { test, expect } from "@playwright/test";
test("operación real, responsive, impresión y reconexión", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("Usuario", { exact: true }).fill("admin");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("browser-test-only-password");
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await expect(
    page.getByText("Conectado al servidor local", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Catálogo", exact: true }).click();
  await page.getByRole("button", { name: "Crear producto" }).click();
  await page
    .getByLabel("Nombre", { exact: true })
    .fill("Producto de prueba navegador");
  await page.getByLabel("Precio COP").fill("15000");
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await expect(
    page.getByRole("heading", { name: "Producto de prueba navegador" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nuevo pedido" }).click();
  await page
    .getByLabel("Cliente", { exact: true })
    .fill("Cliente de prueba navegador");
  await page.getByRole("button", { name: "Agregar producto" }).click();
  await page.getByLabel("Cantidad", { exact: true }).fill("2");
  await page.getByLabel("Domicilio COP").fill("3000");
  await page.getByLabel("Descuento COP").fill("1000");
  await page.getByRole("button", { name: "Confirmar pedido" }).click();
  await page.getByRole("button", { name: "Tablero", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Cliente de prueba navegador" }),
  ).toBeVisible();
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Nuevo pedido" }),
    ).toBeVisible();
    await page.screenshot({
      path: `data/browser-tests/screen-${viewport.width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Marcar como listo" }).click();
  await page.getByRole("button", { name: "Salió a domicilio" }).click();
  await page.getByRole("button", { name: "Pedido entregado" }).click();
  await expect(
    page.getByText("Entregado", { exact: true }).last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Detalles", exact: true }).click();
  await expect(page.locator(".receipt")).toContainText(
    "Cliente de prueba navegador",
  );
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: "data/browser-tests/receipt.pdf" });
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("button", { name: "Informes", exact: true }).click();
  await expect(
    page.getByText("Ventas efectivas", { exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exportar Excel" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  await context.setOffline(true);
  await expect(
    page.getByText("Sin conexión en tiempo real.", { exact: false }),
  ).toBeVisible({ timeout: 40000 });
  await context.setOffline(false);
  await expect(
    page.getByText("Conectado al servidor local", { exact: false }),
  ).toBeVisible({ timeout: 15000 });
  expect(errors).toEqual([]);
  await context.close();
});
