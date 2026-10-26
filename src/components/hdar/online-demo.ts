/** Profils de démo (captures de développement uniquement). */
const C = { lat: 43.61, lng: 3.88 };
const m = (id: string, pseudo: string, age: number, iam: string, seeking: string, dlat: number, dlng: number, min: number, photo: string | null, isNew = false, premium = false) =>
  ({ id, pseudo, age, iam, seeking, lat: C.lat + dlat, lng: C.lng + dlng, min, photo, new: isNew, premium, since: isNew ? "2026-10-25" : "2026-09-01" });
export const ONLINE_DEMO = {
  me: C,
  people: [
    m("d1", "Nina", 29, "f", "h,f", 0.01, 0.01, 0, "/avatars/05.jpg", false, true),
    m("d2", "Lucas34", 34, "h", "f", -0.03, 0.04, 15, "/avatars/03.jpg"),
    m("d3", "Sam", 26, "x", "h,f,x", 0.08, -0.1, 40, null, true),
    m("d4", "Léa & Max", 38, "c", "c,f", 0.2, 0.15, 3, "/avatars/07.jpg"),
    ...(typeof location !== "undefined" && location.search.includes("doublon") ? [m("d1b", "Medi", 21, "h", "f", -0.5, 1.2, 25, null), m("d1c", "Medi", 21, "h", "f", -0.5, 1.2, 30, null)] : []),
    m("d5", "Zoé", 31, "f", "h", -0.25, -0.3, 120, null, true),
  ],
  visitors: [
    { id: "v1", name: "Discret 417", lat: C.lat + 0.02, lng: C.lng - 0.02, min: 5 },
    { id: "v2", name: "Discret 238", lat: C.lat - 0.12, lng: C.lng + 0.2, min: 55 },
  ],
};
