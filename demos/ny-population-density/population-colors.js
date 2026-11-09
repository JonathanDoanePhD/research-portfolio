// Density at each point on a tower is proportional to its height above the terrain.
export const stops = [
  [0, '#f3d6b9'], [10, '#edc5a2'], [100, '#f39655'],
  [500, '#e86f37'], [1000, '#be4d28'], [2500, '#9bdcff'],
  [10000, '#53b7e6'], [30000, '#277cb6'], [119657.3984375, '#123f69'],
];
export const maxDensity = stops.at(-1)[0];

const rgb = stops.map(([, hex]) => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset+2), 16)));
export function densityColor(density) {
  const index = stops.findIndex(([stop]) => stop >= density);
  if (index < 0) return stops.at(-1)[1];
  if (index === 0) return stops[0][1];
  const lower = stops[index-1][0];
  const fraction = (density-lower) / (stops[index][0]-lower);
  const channels = rgb[index].map((value,i) => Math.round(rgb[index-1][i] + fraction*(value-rgb[index-1][i])));
  return `rgb(${channels.join(',')})`;
}
