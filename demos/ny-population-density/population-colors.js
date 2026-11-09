export const maxDensity = 119657.3984375;
const presets = {
  orangeBlue: ['#df631e','#ffffff','#124576'],
  greenOrange: ['#147453','#ffffff','#c55411'],
  greenWhite: ['#147453',null,'#ffffff'],
};

export function colorChannels(hex) {
  return [1,3,5].map(offset => parseInt(hex.slice(offset,offset+2),16));
}

export function paletteStops(colors) {
  const [low,middle,high] = colors;
  return middle ? [[0,low],[.5,middle],[1,high]] : [[0,low],[1,high]];
}

export function densityColor(density, stops) {
  const t = Math.max(0,Math.min(1,density/maxDensity));
  const upper = stops.length === 3 && t > .5 ? 2 : 1;
  const [start,low] = stops[upper-1];
  const [end,high] = stops[upper];
  const fraction = (t-start)/(end-start);
  const a = colorChannels(low);
  const b = colorChannels(high);
  return `rgb(${b.map((v,i) => Math.round(a[i]+fraction*(v-a[i]))).join(',')})`;
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
  let colors = presets.orangeBlue;
  const listeners = [];
  function sync() {
    const isCustom = select.value === 'custom';
    custom.hidden = !isCustom;
    middle.disabled = !useMid.checked;
    colors = isCustom ? [low.value,useMid.checked ? middle.value : null,high.value] : presets[select.value];
    legend.style.setProperty('--density-gradient', `linear-gradient(90deg,${paletteStops(colors).map(([at,color])=>`${color} ${at*100}%`).join(',')})`);
    for (const listener of listeners) listener(colors);
  }
  select.addEventListener('change', () => {
    if (select.value === 'custom') {
      [low.value,middle.value,high.value] = [colors[0],colors[1] ?? '#ffffff',colors[2]];
      useMid.checked = Boolean(colors[1]);
    }
    sync();
  });
  [low,middle,high,useMid].forEach(control => control.addEventListener('input',sync));
  sync();
  return {get colors(){return colors;}, subscribe(listener){listeners.push(listener);}};
}
