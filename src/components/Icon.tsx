import type { CSSProperties } from "react";
const paths: Record<string, string> = {
  close: "M6 6l12 12M18 6L6 18",
  board: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  history: "M3 11a9 9 0 1 1 3 7M3 4v7h7M12 7v5l3 2",
  reports: "M4 20h16M6 16v-5M12 16V4M18 16V8",
  catalog: "M4 5h16v15H4zM8 5V3M16 5V3M8 10h8M8 15h5",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
  plus: "M12 5v14M5 12h14",
  trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
  flame:
    "M13 2c2 6-4 7-1 11 2 0 4-3 4-5 6 5 4 14-4 14S2 13 6 8c0 4 2 5 3 5-2-5 4-7 4-11",
};
export function Icon({
  name,
  size = 20,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d={paths[name] || paths.board} />
    </svg>
  );
}
