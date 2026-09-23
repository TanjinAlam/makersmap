"use client";

// The gradient id is derived from the props rather than useId(): the chart is a
// client component rendered from server components, and useId() produced
// different ids on the server and the client, which caused hydration warnings.
// Identical charts sharing one gradient id is harmless.
export function Sparkline({ color = "#6a8450", large = false, months = 6 }: { color?: string; large?: boolean; months?: number }) {
  const id = `spark-${color.replace(/[^a-z0-9]/gi, "")}-${months}${large ? "l" : "s"}`;
  const points = months === 6 ? "0,57 18,53 35,55 53,45 70,47 88,36 106,40 124,27 141,31 159,18 176,20 196,8" : "0,48 24,51 48,37 71,42 95,26 119,29 145,15 170,20 196,8";
  return (
    <svg className={large ? "sparkline large" : "sparkline"} viewBox="0 0 196 70" preserveAspectRatio="none" role="img" aria-label={"Illustrative upward trend over " + months + " months"}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".19" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {large && [15, 35, 55].map((y) => <line key={y} x1="0" x2="196" y1={y} y2={y} stroke="#eeedf2" strokeWidth=".6" />)}
      <polygon points={"0,70 " + points + " 196,70"} fill={"url(#" + id + ")"} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={large ? 1.4 : 2.1} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
