import type { Maker, Role } from "./profile";

export type { Maker, Role };

// The atlas used to ship with fictional demo makers. Every profile now comes
// from the database (listed intro posts and people who joined themselves).
export const makers: Maker[] = [];

export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export const project = (lon: number, lat: number): [number, number] => [
  ((lon + 180) / 360) * 1200,
  360 - Math.log(Math.tan(Math.PI / 4 + (Math.max(-80, Math.min(80, lat)) * Math.PI) / 360)) * 1200 / (2 * Math.PI),
];
