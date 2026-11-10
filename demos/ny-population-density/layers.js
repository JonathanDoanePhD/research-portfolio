import { loadTerrain } from './terrain.js';

const svgNS = 'http://www.w3.org/2000/svg';
const svgNode = name => document.createElementNS(svgNS, name);

async function readGeography() {
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

async function readRoads() {
  try {
    const response = await fetch('data/road-loops.json');
    if (!response.ok) throw new Error(`Could not load road loops (HTTP ${response.status}).`);
    return await response.json();
  } catch (error) {
    console.warn(error);
    return [];
  }
}

export async function readLayers() {
  const [geography, roads] = await Promise.all([readGeography(),readRoads()]);
  return {...geography,roads};
}

export function createLayers(data, redraw) {
  const overlay = document.querySelector('#geographic-overlay');
  const geographyToggle = document.querySelector('#show-geography');
  const roadToggle = document.querySelector('#show-roads');
  const elevationToggle = document.querySelector('#show-elevation');
  const elevationLegend = document.querySelector('#elevation-legend');
  const reliefNote = document.querySelector('#relief-note');
  const geographyGroup = svgNode('g');
  const roadGroup = svgNode('g');
  overlay.append(roadGroup,geographyGroup);
  const roadEntries = data.roads.map(line => {
    const path = svgNode('path');
    path.setAttribute('class','geo-line geo-road');
    roadGroup.append(path);
    return {feature:{paths:[line]},path};
  });
  const entries = data.features.map(feature => {
    const path = svgNode('path');
    path.setAttribute('class', `geo-line geo-${feature.kind}`);
    geographyGroup.append(path);
    const label = svgNode('text');
    label.setAttribute('class', `geo-label geo-${feature.kind}`);
    label.textContent = feature.name;
    return {feature, path, label};
  });
  // Put labels above all linework.
  for (const {label} of entries) geographyGroup.append(label);

  geographyToggle.checked = false;
  roadToggle.checked = false;
  roadToggle.disabled = !roadEntries.length;
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
    overlay.classList.toggle('is-visible', geographyToggle.checked || roadToggle.checked);
    geographyGroup.style.display = geographyToggle.checked ? '' : 'none';
    roadGroup.style.display = roadToggle.checked ? '' : 'none';
    reliefNote.hidden = !elevationToggle.checked;
    redraw();
  }
  geographyToggle.addEventListener('change', sync);
  elevationToggle.addEventListener('change', sync);
  roadToggle.addEventListener('change', sync);

  return {
    terrain,
    get showElevation() { return elevationToggle.checked; },
    get showOverlay() { return geographyToggle.checked || roadToggle.checked; },
    render(project, hidden) {
      const active = [
        ...(roadToggle.checked ? roadEntries : []),
        ...(geographyToggle.checked ? entries : []),
      ];
      for (const {feature, path, label} of active) {
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
        if (!label) continue;
        const [x,y,depth] = project(...feature.anchor);
        label.style.visibility = hidden?.(x,y-5,depth) || hidden?.(x,y,depth) ? 'hidden' : 'visible';
        label.setAttribute('x', x.toFixed(1));
        label.setAttribute('y', (y - 5).toFixed(1));
      }
    },
  };
}
