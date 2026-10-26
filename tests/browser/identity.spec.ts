import { test, expect } from "@playwright/test";
function ratio(fg: string, bg: string) {
  const lum = (value: string) => {
    const channels = value
      .match(/\d+(?:\.\d+)?/g)!
      .slice(0, 3)
      .map(Number)
      .map((n) => n / 255)
      .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const a = lum(fg),
    b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
test("identidad oficial, contraste, recursos locales y todas las vistas responsive", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const external: string[] = [],
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    if (!["127.0.0.1", "localhost"].includes(host)) {
      external.push(host);
      return route.abort();
    }
    return route.continue();
  });
  try {
    await page.goto("/");
    for (const width of [360, 820, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(
        page.getByRole("heading", { name: "Bienvenido a tu operación" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const logo = page.locator(".login-identity img");
      await expect(logo).toHaveAttribute(
        "src",
        "/brand/thordy-logotipo-beige.svg",
      );
      await expect
        .poll(() =>
          logo.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        )
        .toBe(true);
      const dimensions = await logo.evaluate((img: HTMLImageElement) => ({
        natural: img.naturalWidth / img.naturalHeight,
        rendered:
          img.getBoundingClientRect().width /
          img.getBoundingClientRect().height,
      }));
      expect(Math.abs(dimensions.natural - dimensions.rendered)).toBeLessThan(
        0.02,
      );
      await page.screenshot({
        path: `data/browser-tests/brand-login-${width}.png`,
        fullPage: true,
      });
    }
    const styles = await page
      .getByRole("button", { name: "Entrar al panel" })
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return { color: s.color, background: s.backgroundColor };
      });
    expect(ratio(styles.color, styles.background)).toBeGreaterThanOrEqual(4.5);
    const meta = page.locator('meta[name="theme-color"]');
    await expect(meta).toHaveAttribute("content", "#6A0B07");
    const favicon = await page.request.get("/brand/favicon.svg");
    expect(favicon.status()).toBe(200);
    expect(await favicon.text()).toContain("<path");
    const icon = await page.request.get("/brand/apple-touch-icon.png");
    expect(icon.headers()["content-type"]).toContain("image/png");
    await page.getByLabel("Usuario", { exact: true }).fill("admin");
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill("browser-test-only-password");
    await page.getByRole("button", { name: "Entrar al panel" }).click();
    await expect(
      page.getByText("Conectado al servidor local", { exact: false }),
    ).toBeVisible();
    for (const width of [360, 820, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      for (const tab of [
        "Tablero",
        "Historial",
        "Informes",
        "Catálogo",
        "Configuración",
      ]) {
        await page.getByRole("button", { name: tab, exact: true }).click();
        await expect(
          page.getByRole("heading", {
            name: tab === "Tablero" ? "Pedidos en marcha" : tab,
            exact: true,
          }),
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const brand = page.locator(
          width <= 760 ? ".sidebar-compact img" : ".sidebar-wide img",
        );
        await expect(brand).toBeVisible();
        await expect
          .poll(() =>
            brand.evaluate(
              (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
            ),
          )
          .toBe(true);
        if (tab === "Tablero" || tab === "Informes")
          await page.screenshot({
            path: `data/browser-tests/brand-${tab}-${width}.png`,
            fullPage: true,
          });
      }
    }
    await page.getByRole("button", { name: "Nuevo pedido" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuevo pedido" });
    await expect(dialog.locator(".dialog-identity img")).toHaveAttribute(
      "src",
      "/brand/thordy-isotipo-vinotinto.svg",
    );
    await expect(
      dialog.getByRole("button", { name: "Cerrar", exact: true }),
    ).toHaveText("");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() =>
          Array.from(document.fonts).some(
            (font) => font.family === "Montserrat" && font.status === "loaded",
          ),
        ),
      )
      .toBe(true);
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
