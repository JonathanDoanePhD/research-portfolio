const maxPopulation = 3036828;

export const maxColorPopulation = 120000;

// Use the portfolio's green, orange, and purple tones in a fixed population ramp.
export const populationStops = [
  '#38815e', '#ffffff', '#d97732', '#ab2940',
  ...Array(7).fill('#654697'),
  '#c3b2d9', '#ffffff',
].map((color,index,colors) => [index/(colors.length-1),color]);

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
  const position = Math.max(0,Math.min(1,fraction)) * (channels.length-1);
  const lower = Math.min(Math.floor(position),channels.length-2);
  return mixColors(channels[lower],channels[lower+1],position-lower);
}

export function mountPopulationLegend(legend) {
  for (const [at] of populationStops) {
    const entry = document.createElement('li');
    const population = Math.round(at*maxColorPopulation/1000);
    entry.textContent = population === 0 ? '0' : `${population}k${at === 1 ? '+' : ''}`;
    legend.append(entry);
  }
  legend.style.setProperty('--population-gradient',
    `linear-gradient(90deg,${populationStops.map(([,color]) => color).join(',')})`);
}
