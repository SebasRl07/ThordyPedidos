/** Original vector outlines extracted from the supplied brand manual, never typeset. */
export function BrandLogo({
  kind = "logotipo",
  tone = "vinotinto",
  className = "",
  decorative = false,
}: {
  kind?: "logotipo" | "isotipo";
  tone?: "vinotinto" | "beige";
  className?: string;
  decorative?: boolean;
}) {
  return (
    <img
      className={`brand-logo brand-logo--${kind} ${className}`}
      src={`/brand/thordy-${kind}-${tone}.svg`}
      alt={
        decorative
          ? ""
          : kind === "logotipo"
            ? "THORDY AL BARRIL"
            : "Isotipo oficial de THORDY AL BARRIL"
      }
      aria-hidden={decorative || undefined}
      decoding="async"
      draggable={false}
    />
  );
}
