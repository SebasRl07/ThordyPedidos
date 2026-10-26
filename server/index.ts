import "dotenv/config";
import { networkInterfaces } from "node:os";
import { acquireDatabaseLock } from "../scripts/maintenance.ts";
import { buildApp } from "./app.ts";
const release = acquireDatabaseLock(
  process.env.DB_PATH || "data/thordy.sqlite",
  "server",
);
process.once("exit", release);
const { app } = await buildApp().catch((error) => {
  release();
  throw error;
});

const port = Number(process.env.PORT || 3000);
try {
  await app.listen({ port, host: process.env.HOST || "0.0.0.0" });
} catch (error) {
  await app.close();
  release();
  throw error;
}
console.log(`Panel en este equipo: http://localhost:${port}`);
if ((process.env.HOST || "0.0.0.0") === "0.0.0.0")
  for (const items of Object.values(networkInterfaces()))
    for (const n of items || [])
      if (n.family === "IPv4" && !n.internal)
        console.log(
          `Dirección de red detectada: http://${n.address}:${port} (verifica que sea la LAN privada)`,
        );
for (const s of ["SIGINT", "SIGTERM"])
  process.on(s, async () => {
    await app.close();
    process.exit(0);
  });
