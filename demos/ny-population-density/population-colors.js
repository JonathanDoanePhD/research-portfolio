const defaultStops = [[0,'#38815e'],[3000,'#d97732'],[30000,'#ab2940']];

export function colorChannels(hex) {
  return [1,3,5].map(offset => parseInt(hex.slice(offset,offset+2),16));
}

export function makePopulationColor(stops) {
  const channels = stops.map(([,color]) => colorChannels(color));
  return population => {
    const upper = population <= stops[1][0] ? 1 : 2;
    const start = stops[upper-1][0];
    const end = stops[upper][0];
    const fraction = Math.max(0,Math.min(1,(population-start)/(end-start)));
    const from = channels[upper-1];
    const to = channels[upper];
    return `#${to.map((v,i) => Math.round(from[i]+fraction*(v-from[i])).toString(16).padStart(2,'0')).join('')}`;
  };
}

export function mountPopulationPalette(legend, editor) {
  const form = editor.querySelector('form');
  const counts = [...form.querySelectorAll('input[type=number]')];
  const colors = [...form.querySelectorAll('input[type=color]')];
  const error = form.querySelector('[role=alert]');
  const listeners = [];
  let stops = defaultStops;

  function apply(next) {
    stops = next;
    legend.replaceChildren();
    for (const [index,[population]] of stops.entries()) {
      const entry = document.createElement('li');
      const suffix = index === 2 ? '+' : '';
      const short = population >= 1000 && population % 1000 === 0 ? `${population/1000}k` : population.toLocaleString('en-US');
      entry.textContent = short+suffix;
      entry.setAttribute('aria-label', `${population.toLocaleString('en-US')}${suffix ? ' or more' : ''} people per hexagon`);
      legend.append(entry);
    }
    legend.style.setProperty('--population-gradient',
      `linear-gradient(90deg,${stops.map(([,color]) => color).join(',')})`);
    for (const listener of listeners) listener(stops);
  }

  for (const [i,[population,color]] of defaultStops.entries()) {
    counts[i].defaultValue = population;
    colors[i].defaultValue = color;
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = counts.map(input => input.valueAsNumber);
    if (!values.every(Number.isInteger) || values[0] >= values[1] || values[1] >= values[2]) {
      error.textContent = 'Enter three population counts in increasing order.';
      return;
    }
    error.textContent = '';
    apply(values.map((population,i) => [population,colors[i].value]));
    editor.open = false;
  });
  form.querySelector('button[type=reset]').addEventListener('click', () => {
    error.textContent = '';
    apply(defaultStops);
  });
  apply(defaultStops);
  return {get stops(){return stops;}, subscribe(listener){listeners.push(listener);}};
}
