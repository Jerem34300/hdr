/** Same-origin tile path → upstream. z/x/y only, no open redirect. */
/** @param {string} pathname */
export function tileUpstream(pathname) {
  const match = String(pathname).match(/^\/tiles\/(plan|sat)\/(\d+)\/(\d+)\/(\d+)\.png$/);
  if (!match) return null;
  const kind = match[1];
  const z = Number(match[2]);
  const x = Number(match[3]);
  const y = Number(match[4]);
  if (z > 19 || x > 2 ** z || y > 2 ** z) return null;
  if (kind === "plan") {
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`;
  }
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}
