const maxPopulation = 3036828;

export const maxColorPopulation = 30000;

const brackets = [
  [0, '0', '#38815e'],
  [1000, '1k', '#ffffff'],
  [2000, '2k', '#d97732'],
  [5000, '5k', '#d97732'],
  [20000, '20k', '#ab2940'],
  [maxColorPopulation, '30k+', '#ffffff'],
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
    const suffix = population === maxColorPopulation ? ' or more' : '';
    entry.setAttribute('aria-label', `${population.toLocaleString('en-US')}${suffix} people per hexagon`);
    legend.append(entry);
  }
  legend.style.setProperty('--population-gradient',
    `linear-gradient(90deg,${populationStops.map(([,color]) => color).join(',')})`);
}
