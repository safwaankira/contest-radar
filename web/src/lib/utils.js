import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...a) => twMerge(clsx(a));

export const AGENT = "0x6859Abd01F1686E9DDfE809CC69Fab1054447457";
export const SCAN_USD = 0.01; // launch price, must match lib/config.js SCAN_PRICE
export const BUY_PAYTO = "0x20faAca5F980E29639A0FCC6dcA6988E18ed333B";
export const EXPLORER = "https://celo.blockscout.com";
export const short = (a = "") => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
export const usd = (n) => (n == null ? "—" : n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${n < 10 ? n.toFixed(2) : Math.round(n)}`);

export function daysLeft(deadline) {
  if (!deadline) return null;
  return Math.ceil((Date.parse(deadline + "T23:59:59Z") - Date.now()) / 864e5);
}
export function ago(iso) {
  if (!iso) return "";
  const m = Math.round((Date.now() - Date.parse(iso)) / 6e4);
  if (m < 60) return `${m}m ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}
