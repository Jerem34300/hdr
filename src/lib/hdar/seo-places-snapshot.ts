/** Approved/visible partner venues for SEO city blogs — snapshot from hdar.places (status=approved). Never invent. */
export const SEO_PLACES: Record<string, { name: string; kind: string; note?: string }[]> = {
  paris: [
    { name: "L'Impact Bar", kind: "bar", note: "partenaire approuvé sur la carte hdar" },
    { name: "IDM Sauna", kind: "sauna", note: "partenaire approuvé sur la carte hdar" },
  ],
  berlin: [],
};
