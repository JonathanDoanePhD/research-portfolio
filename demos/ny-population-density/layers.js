import { loadTerrain } from './terrain.js';

const svgNS = 'http://www.w3.org/2000/svg';
const svgNode = name => document.createElementNS(svgNS, name);

export async function readLayers() {
  try {
    const response = await fetch('data/geography.json');
    if (!response.ok) throw new Error(`Could not load geographic overlays (HTTP ${response.status}).`);
    const data = await response.json();
    try {
      data.elevation = await loadTerrain(data.elevation);
    } catch (error) {
      console.warn('Elevation data unavailable.', error);
    }
    return data;
  } catch (error) {
    console.warn(error);
    return {features:[]};
  }
}

export function createLayers(data, redraw) {
  const overlay = document.querySelector('#geographic-overlay');
  const geographyToggle = document.querySelector('#show-geography');
  const elevationToggle = document.querySelector('#show-elevation');
  const elevationLegend = document.querySelector('#elevation-legend');
  const reliefNote = document.querySelector('#relief-note');
  const entries = data.features.map(feature => {
    const path = svgNode('path');
    path.setAttribute('class', `geo-line geo-${feature.kind}`);
    overlay.append(path);
    const label = svgNode('text');
    label.setAttribute('class', `geo-label geo-${feature.kind}`);
    label.textContent = feature.name;
    overlay.append(label);
    return {feature, path, label};
  });
  // Put labels above all linework.
  for (const {label} of entries) overlay.append(label);

  geographyToggle.checked = false;
  elevationToggle.checked = false;
  geographyToggle.disabled = !entries.length;
  elevationToggle.disabled = !data.elevation?.image;
  const terrain = data.elevation?.image ? data.elevation : null;
  if (terrain) {
    elevationLegend.hidden = false;
    const gradient = document.querySelector('#elevation-ramp');
    gradient.style.background = `linear-gradient(90deg,${terrain.stops.map(([, color]) => color).join(',')})`;
    const ticks = document.querySelector('#elevation-ticks');
    for (const [value] of terrain.stops) {
      const tick = document.createElement('span');
      tick.textContent = value.toLocaleString('en-US');
      ticks.append(tick);
    }
  }
  function sync() {
    overlay.classList.toggle('is-visible', geographyToggle.checked);
    reliefNote.hidden = !elevationToggle.checked;
    redraw();
  }
  geographyToggle.addEventListener('change', sync);
  elevationToggle.addEventListener('change', sync);

  return {
    terrain,
    get showElevation() { return elevationToggle.checked; },
    get showGeography() { return geographyToggle.checked; },
    render(project, hidden) {
      if (!geographyToggle.checked) return;
      for (const {feature, path, label} of entries) {
        let d = '';
        for (const line of feature.paths) {
          let previous;
          let pen = 'M';
          for (const point of line) {
            const next = project(...point);
            const from = previous ?? next;
            const steps = hidden ? Math.max(1, Math.min(150, Math.ceil(Math.hypot(next[0]-from[0],next[1]-from[1])/2))) : 1;
            for (let i=1;i<=steps;i++) {
              const t = i/steps;
              const x = from[0]+t*(next[0]-from[0]);
              const y = from[1]+t*(next[1]-from[1]);
              const depth = from[2]+t*(next[2]-from[2]);
              if (hidden?.(x,y,depth)) pen = 'M';
              else {
                d += `${pen}${x.toFixed(1)} ${y.toFixed(1)}`;
                pen = 'L';
              }
            }
            previous = next;
          }
        }
        path.setAttribute('d', d);
        const [x,y,depth] = project(...feature.anchor);
        label.style.visibility = hidden?.(x,y-5,depth) || hidden?.(x,y,depth) ? 'hidden' : 'visible';
        label.setAttribute('x', x.toFixed(1));
        label.setAttribute('y', (y - 5).toFixed(1));
      }
    },
  };
}
