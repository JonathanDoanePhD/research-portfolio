export const maxPopulation = 3036828;
const brackets = [0,100,500,2500,5000,10000,50000,250000,1000000,maxPopulation];
const labels = ['0','100','500','2.5k','5k','10k','50k','250k','1M','3M'];
const presets = {
  nycRelief: ['#f3d8bb','#edaa72','#ed9a5e','#d55421','#6ca9c2','#b9d8e8','#f8fbfc','#edf5fb','#347fb7','#142a62'],
  orangeBlue: ['#df631e','#e47130','#e98144','#efa16b','#f4b98f','#fad5b9','#ffffff','#c5d8ea','#6495c0','#124576'],
  greenOrange: ['#147453','#258061','#3c8d71','#63a58e','#89bca9','#bbd7cc','#ffffff','#f2d0b5','#e4945a','#c55411'],
  greenWhite: ['#147453','#21805f','#318c6d','#479b7d','#63ab91','#81bba5','#a4cdbc','#c4e0d5','#e3f0eb','#ffffff'],
};
export const maxStops = brackets.length;

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

export function makePopulationColor(stops) {
  const channels = stops.map(([,color]) => colorChannels(color));
  return fraction => {
    const t = Math.max(0,Math.min(1,fraction));
    let upper = 1;
    while (upper < stops.length-1 && t > stops[upper][0]) upper++;
    const start = stops[upper-1][0];
    const end = stops[upper][0];
    return mixColors(channels[upper-1],channels[upper],(t-start)/(end-start));
  };
}

export function createPalette() {
  const select = document.querySelector('#palette');
  const scale = document.querySelector('#height-scale');
  const custom = document.querySelector('#custom-palette');
  const low = document.querySelector('#color-low');
  const middle = document.querySelector('#color-mid');
  const high = document.querySelector('#color-high');
  const useMid = document.querySelector('#color-mid-enabled');
  const legend = document.querySelector('#density-bands');
  for (let i=0;i<labels.length;i++) {
    const entry = document.createElement('li');
    entry.textContent = labels[i];
    entry.title = `${brackets[i].toLocaleString('en-US')} people per hexagon`;
    legend.append(entry);
  }
  let previousPreset;
  let colors;
  let stops;
  const listeners = [];
  function sync() {
    const isCustom = select.value === 'custom';
    custom.hidden = !isCustom;
    middle.disabled = !useMid.checked;
    if (isCustom) {
      const anchors = useMid.checked ? [[0,low.value],[.5,middle.value],[1,high.value]] : [[0,low.value],[1,high.value]];
      const sample = makePopulationColor(anchors);
      // The optional custom midpoint lands on the 50,000-person reference mark.
      colors = brackets.map((_,i) => sample(i <= 6 ? i/12 : .5+(i-6)/6));
    } else {
      previousPreset = select.value;
      colors = presets[select.value];
    }
    stops = brackets.map((population,i) => [populationFraction(population,scale.value),colors[i]]);
    legend.style.setProperty('--density-gradient', `linear-gradient(90deg,${colors.join(',')})`);
    for (const listener of listeners) listener(stops);
  }
  select.addEventListener('change', () => {
    if (select.value === 'custom') {
      [low.value,middle.value,high.value] = [colors[0],colors[6],colors.at(-1)];
      useMid.checked = previousPreset !== 'greenWhite';
    }
    sync();
  });
  scale.addEventListener('change',sync);
  [low,middle,high,useMid].forEach(control => control.addEventListener('input',sync));
  sync();
  return {get stops(){return stops;}, subscribe(listener){listeners.push(listener);}};
}
