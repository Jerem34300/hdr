/** Région administrative approximative à partir d'une position (villes repères, la plus proche gagne). */
const ANCHORS: [string, number, number][] = [
  ["occitanie", 43.6, 1.44], ["occitanie", 43.61, 3.88], ["occitanie", 43.84, 4.36], ["occitanie", 42.7, 2.9], ["occitanie", 44.35, 2.57], ["occitanie", 43.23, 0.08],
  ["paca", 43.3, 5.37], ["paca", 43.7, 7.27], ["paca", 43.95, 4.81], ["paca", 44.56, 6.08], ["paca", 43.12, 5.93],
  ["idf", 48.86, 2.35], ["idf", 48.6, 2.9], ["idf", 49.05, 2.05],
  ["ara", 45.76, 4.84], ["ara", 45.19, 5.72], ["ara", 45.78, 3.08], ["ara", 45.9, 6.13], ["ara", 45.44, 4.39], ["ara", 44.93, 2.44], ["ara", 44.93, 4.89],
  ["naq", 44.84, -0.58], ["naq", 45.83, 1.26], ["naq", 46.58, 0.34], ["naq", 43.3, -0.37], ["naq", 46.16, -1.15], ["naq", 45.18, 0.72], ["naq", 44.2, 0.62],
  ["hdf", 50.63, 3.06], ["hdf", 49.89, 2.3], ["hdf", 49.43, 2.08], ["hdf", 50.95, 1.86], ["hdf", 49.85, 3.29],
  ["ge", 48.57, 7.75], ["ge", 49.26, 4.03], ["ge", 49.12, 6.18], ["ge", 48.69, 6.18], ["ge", 48.3, 4.08], ["ge", 47.75, 7.34], ["ge", 48.17, 6.45],
  ["bre", 48.11, -1.68], ["bre", 48.39, -4.49], ["bre", 47.66, -2.76], ["bre", 48.51, -2.76],
  ["pdl", 47.22, -1.55], ["pdl", 47.47, -0.55], ["pdl", 48.0, 0.2], ["pdl", 46.67, -1.43], ["pdl", 48.07, -0.77],
  ["nor", 49.44, 1.1], ["nor", 49.18, -0.37], ["nor", 49.64, -1.62], ["nor", 49.02, 1.15], ["nor", 48.43, 0.09],
  ["bfc", 47.32, 5.04], ["bfc", 47.24, 6.02], ["bfc", 47.8, 3.57], ["bfc", 46.99, 3.16], ["bfc", 46.31, 4.83],
  ["cvl", 47.9, 1.91], ["cvl", 47.39, 0.69], ["cvl", 47.08, 2.4], ["cvl", 48.45, 1.49], ["cvl", 46.81, 1.69],
  ["cor", 41.93, 8.74], ["cor", 42.7, 9.45],
];

export function regionAt(lat: number, lng: number): string {
  if (lat < 41 || lat > 51.2 || lng < -5.3 || lng > 9.7) return "om";
  let best = "idf";
  let d = Infinity;
  const k = Math.cos((lat * Math.PI) / 180);
  for (const [r, a, b] of ANCHORS) {
    const dd = (a - lat) ** 2 + ((b - lng) * k) ** 2;
    if (dd < d) {
      d = dd;
      best = r;
    }
  }
  return best;
}
