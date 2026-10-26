import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, username = "admin") {
  await page.goto("/");
  await page.getByLabel("Usuario", { exact: true }).fill(username);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("browser-test-only-password");
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await expect(
    page.getByText("Conectado al servidor local", { exact: false }),
  ).toBeVisible();
}
const cop = (v: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(v);
test("eliminar entregado: doble confirmación, responsive, permisos y actualizaciones en tres dispositivos", async ({
  browser,
}) => {
  const context = await browser.newContext(),
    observer = await browser.newContext(),
    operator = await browser.newContext();
  const page = await context.newPage(),
    reportPage = await observer.newPage(),
    operatorPage = await operator.newPage();
  const external: string[] = [];
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      external.push(url.hostname);
      return route.abort();
    }
    return route.continue();
  });
  try {
    await login(page);
    await login(reportPage);
    const h = { "x-thordy-request": "1" };
    const product = await (
      await page.request.post("/api/products", {
        headers: h,
        data: { name: "Producto eliminación navegador", price: 18000 },
      })
    ).json();
    const products = await (await page.request.get("/api/products")).json();
    const p = products.find(
      (v: { name: string }) => v.name === "Producto eliminación navegador",
    );
    const created = await page.request.post("/api/orders", {
      headers: h,
      data: {
        request_key: crypto.randomUUID(),
        customer: "Cliente eliminación multicliente",
        channel: "WhatsApp",
        payment: "Efectivo",
        items: [{ product_id: p.id, quantity: 1 }],
      },
    });
    expect(created.ok()).toBeTruthy();
    let order = await created.json();
    for (const status of ["ready", "dispatched", "delivered"]) {
      const response = await page.request.post(
        `/api/orders/${order.id}/status`,
        { headers: h, data: { expected: order.status, status } },
      );
      order = await response.json();
    }
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
    }).format(new Date());
    const before = await (
      await page.request.get(`/api/reports?from=${day}&to=${day}`)
    ).json();
    await reportPage
      .getByRole("button", { name: "Informes", exact: true })
      .click();
    await expect(
      reportPage
        .locator(".stat")
        .filter({ hasText: "Ventas efectivas" })
        .locator("strong"),
    ).toHaveText(cop(before.sales));
    await page.request.post("/api/users", {
      headers: h,
      data: {
        username: "browser-operator",
        password: "browser-test-only-password",
        role: "operator",
      },
    });
    await login(operatorPage, "browser-operator");
    const operatorCard = operatorPage
      .locator(".order")
      .filter({ hasText: "Cliente eliminación multicliente" });
    await operatorCard.getByRole("button", { name: "Detalles" }).click();
    await expect(
      operatorPage.getByRole("button", {
        name: "Eliminar pedido",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Tablero", exact: true }).click();
    await page
      .locator(".order")
      .filter({ hasText: "Cliente eliminación multicliente" })
      .getByRole("button", { name: "Detalles" })
      .click();
    await page
      .getByRole("button", { name: "Eliminar pedido", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: `Eliminar pedido #${order.id}`,
    });
    const final = dialog.getByRole("button", {
      name: "Eliminar definitivamente",
      exact: true,
    });
    await expect(final).toBeDisabled();
    await dialog.getByLabel("Número del pedido a eliminar").fill("incorrecto");
    await dialog.getByRole("checkbox").check();
    await expect(final).toBeDisabled();
    await dialog
      .getByLabel("Número del pedido a eliminar")
      .fill(String(order.id));
    await dialog.getByRole("checkbox").uncheck();
    await expect(final).toBeDisabled();
    for (const width of [360, 390, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const close = dialog.getByRole("button", { name: "Cerrar", exact: true });
      await expect(close).toHaveText("");
      const bounds = await close.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      await expect(final).toBeVisible();
      if (width === 390)
        await page.screenshot({
          path: "data/browser-tests/delete-mobile.png",
          fullPage: true,
        });
    }
    await dialog.getByRole("checkbox").check();
    await final.click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page
        .locator(".order")
        .filter({ hasText: "Cliente eliminación multicliente" }),
    ).toHaveCount(0);
    await expect(operatorPage.getByRole("dialog")).toHaveCount(0);
    await expect(
      operatorPage
        .locator(".order")
        .filter({ hasText: "Cliente eliminación multicliente" }),
    ).toHaveCount(0);
    await expect(
      reportPage
        .locator(".stat")
        .filter({ hasText: "Ventas efectivas" })
        .locator("strong"),
    ).toHaveText(cop(before.sales - order.total));
    const after = await (
      await page.request.get(`/api/reports?from=${day}&to=${day}`)
    ).json();
    expect(after.received).toBe(before.received - 1);
    expect(after.delivered).toBe(before.delivered - 1);
    expect(
      after.products.some((v: { name: string }) => v.name === p.name),
    ).toBe(false);
    expect((await page.request.get(`/api/orders/${order.id}`)).status()).toBe(
      404,
    );
    expect(external).toEqual([]);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
      "hidden",
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          Array.from(document.fonts).some(
            (font) => font.family === "Inter" && font.status === "loaded",
          ),
        ),
      )
      .toBe(true);
    // The dashboard remains functional while all non-local HTTP resources are blocked.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Pedidos en marcha" }),
    ).toBeVisible();
  } finally {
    await context.close();
    await observer.close();
    await operator.close();
  }
});
