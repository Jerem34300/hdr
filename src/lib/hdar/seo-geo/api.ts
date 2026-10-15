import { createServerFn } from "@tanstack/react-start";

export const getCity = createServerFn({ method: "GET" }).validator((d: string) => d).handler(async ({ data }) => (await import("./geo.server")).cityPayload(data));
export const getRegion = createServerFn({ method: "GET" }).validator((d: string) => d).handler(async ({ data }) => (await import("./geo.server")).regionPayload(data));
export const getDep = createServerFn({ method: "GET" }).validator((d: string) => d).handler(async ({ data }) => (await import("./geo.server")).depPayload(data));
export const getIndex = createServerFn({ method: "GET" }).handler(async () => (await import("./geo.server")).indexPayload());
