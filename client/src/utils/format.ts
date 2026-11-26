export const fmt = (n: number) => n.toLocaleString("en-US");

/** "2026-11-15" → "NOV 15" */
export const shortDay = (dayKey: string) => {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return dayKey;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase();
};

/** Open-analytics flag: true only the first time a drawer loads in this iframe. */
const opened = new Set<string>();
export const firstOpen = (drawer: string) => {
  if (opened.has(drawer)) return false;
  opened.add(drawer);
  return true;
};
