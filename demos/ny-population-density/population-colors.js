const maxPopulation = 3036828;

export const maxColorPopulation = maxPopulation;

const brackets = [
  [0, '0', '#df631e'],
  [100, '100', '#e47130'],
  [500, '500', '#e98144'],
  [2500, '2.5k', '#efa16b'],
  [5000, '5k', '#f4b98f'],
  [10000, '10k', '#fad5b9'],
  [50000, '50k', '#ffffff'],
  [250000, '250k', '#c5d8ea'],
  [1000000, '1M', '#6495c0'],
  [maxColorPopulation, '3M', '#124576'],
];

export const populationStops = brackets.map(([population,,color]) => [population/maxColorPopulation,color]);

export function populationFraction(population,scale) {
  const fraction = Math.max(0,Math.min(1,population/maxPopulation));
  return scale === 'linear' ? fraction : Math.sqrt(fraction);
}

export function colorChannels(hex) {
  return [1,3,5].map(offset => parseInt(hex.slice(offset,offset+2),16));
}

function mixColors(a,b,fraction) {
  return `#${b.map((v,i) => Math.round(a[i]+fraction*(v-a[i])).toString(16).padStart(2,'0')).join('')}`;
}

const channels = populationStops.map(([,color]) => colorChannels(color));

export function populationColor(fraction) {
  const t = Math.max(0,Math.min(1,fraction));
  let upper = 1;
  while (upper < populationStops.length-1 && t > populationStops[upper][0]) upper++;
  const start = populationStops[upper-1][0];
  const end = populationStops[upper][0];
  return mixColors(channels[upper-1],channels[upper],(t-start)/(end-start));
}

export function mountPopulationLegend(legend) {
  for (const [population,label] of brackets) {
    const entry = document.createElement('li');
    entry.textContent = label;
    entry.setAttribute('aria-label', `${population.toLocaleString('en-US')} people per hexagon`);
    legend.append(entry);
  }
  legend.style.setProperty('--population-gradient',
    `linear-gradient(90deg,${populationStops.map(([,color]) => color).join(',')})`);
}
