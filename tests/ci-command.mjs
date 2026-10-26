// Publish actionable test failures as annotations, including on public runs
// where anonymous readers cannot open GitHub's raw step logs.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
const [command, ...args] = process.argv.slice(2);
if (!command) throw Error("Falta el comando de validación");
const result = spawnSync(command, args, {
  encoding: "utf8",
  shell: process.platform === "win32",
  maxBuffer: 16 * 1024 * 1024,
});
process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
if (result.status !== 0) {
  const detail = [result.error?.message, result.stdout, result.stderr]
    .filter(Boolean)
    .join("\n")
    .slice(-18000);
  const escape = (s) =>
    s.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
  if (process.env.GITHUB_ACTIONS === "true") {
    console.log(
      `::error title=Validación fallida: ${command} ${args.join(" ")}::${escape(detail)}`,
    );
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        "## Error de validación\n\n```text\n" +
          detail.replaceAll("```", "\u0060\u0060\u0020\u0060") +
          "\n```\n",
      );
  }
  process.exitCode = result.status || 1;
}
