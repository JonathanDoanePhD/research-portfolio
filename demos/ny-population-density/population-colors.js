const maxPopulation = 3036828;

// The blues and fox orange come from the portfolio's existing colors.
export const populationStops = [
  '#f5d47a', '#7aaa78', '#008bd4', '#8b78b4', '#cb5551', '#d97732',
  '#f4c750', '#38815e', '#006eb1', '#654697', '#ab2940',
].map((color,index) => [index/10,color]);

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
    entry.textContent = `${Math.round(at*100)}%`;
    legend.append(entry);
  }
  legend.style.setProperty('--population-gradient',
    `linear-gradient(90deg,${populationStops.map(([,color]) => color).join(',')})`);
}
