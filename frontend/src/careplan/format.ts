import { formatDate, parseISODate } from "../lib/coverage";
export const money = (v: number) =>
  v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
export const percent = (v: number) => `${(v * 100).toFixed(1)}%`;
export const dateLabel = (v: string) => formatDate(parseISODate(v));
export const day = (v: string) => {
  const [y, m, d] = v.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
