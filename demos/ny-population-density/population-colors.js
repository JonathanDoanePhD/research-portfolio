export const maxDensity = 119657.3984375;

function paletteStops(low,middle,high) {
  return middle ? [[0,low],[.5,middle],[1,high]] : [[0,low],[1,high]];
}

const presets = {
  nycRelief: [
    [0,'#f3d8bb'],
    [300,'#ed9a5e'],
    [1600,'#d55421'],
    [6500,'#6ca9c2'],
    [22000,'#dcecf4'],
    [42000,'#f8fbfc'],
    [86000,'#edf5fb'],
    [106000,'#347fb7'],
    [maxDensity,'#142a62'],
  ].map(([density,color]) => [density/maxDensity,color]),
  orangeBlue: paletteStops('#df631e','#ffffff','#124576'),
  greenOrange: paletteStops('#147453','#ffffff','#c55411'),
  greenWhite: paletteStops('#147453',null,'#ffffff'),
};

export const maxStops = Math.max(...Object.values(presets).map(stops => stops.length));

export function colorChannels(hex) {
  return [1,3,5].map(offset => parseInt(hex.slice(offset,offset+2),16));
}

export function makeDensityColor(stops) {
  const channels = stops.map(([,color]) => colorChannels(color));
  return density => {
    const t = Math.max(0,Math.min(1,density/maxDensity));
    let upper = 1;
    while (upper < stops.length-1 && t > stops[upper][0]) upper++;
    const start = stops[upper-1][0];
    const end = stops[upper][0];
    const fraction = (t-start)/(end-start);
    const a = channels[upper-1];
    const b = channels[upper];
    return `#${b.map((v,i) => Math.round(a[i]+fraction*(v-a[i])).toString(16).padStart(2,'0')).join('')}`;
  };
}

export function createPalette() {
  const select = document.querySelector('#palette');
  const custom = document.querySelector('#custom-palette');
  const low = document.querySelector('#color-low');
  const middle = document.querySelector('#color-mid');
  const high = document.querySelector('#color-high');
  const useMid = document.querySelector('#color-mid-enabled');
  const legend = document.querySelector('#density-bands');
  for (const label of ['0','30k','60k','90k','120k']) {
    const entry = document.createElement('li');
    entry.textContent = label;
    legend.append(entry);
  }
  let stops = presets.nycRelief;
  const listeners = [];
  function sync() {
    const isCustom = select.value === 'custom';
    custom.hidden = !isCustom;
    middle.disabled = !useMid.checked;
    stops = isCustom ? paletteStops(low.value,useMid.checked ? middle.value : null,high.value) : presets[select.value];
    legend.style.setProperty('--density-gradient', `linear-gradient(90deg,${stops.map(([at,color])=>`${color} ${at*100}%`).join(',')})`);
    for (const listener of listeners) listener(stops);
  }
  select.addEventListener('change', () => {
    if (select.value === 'custom') {
      low.value = stops[0][1];
      middle.value = makeDensityColor(stops)(maxDensity/2);
      high.value = stops.at(-1)[1];
      useMid.checked = stops.length > 2;
    }
    sync();
  });
  [low,middle,high,useMid].forEach(control => control.addEventListener('input',sync));
  sync();
  return {get stops(){return stops;}, subscribe(listener){listeners.push(listener);}};
}
