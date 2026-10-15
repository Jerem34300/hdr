export type Mini = { s: string; n: string; p: number; k?: number };
export type CityPayload = {
  s: string; n: string; p: number; x: number; y: number; hubKm: number; isHub: boolean; top: boolean;
  hub: Mini; dep: { s: string; n: string; code: string }; reg: { s: string; n: string };
  rankInDep: number; depCount: number; nearby: Mini[]; around: Mini[]; aroundCount: number;
};
export type ListPayload = {
  kind: "region" | "departement"; s: string; n: string; code?: string; cities: Mini[]; hubs: Mini[];
  deps: { s: string; n: string; code: string }[]; parent: { s: string; n: string } | null; total: number; count: number;
};
export type IndexPayload = { regions: { s: string; n: string }[]; top: Mini[]; count: number };
