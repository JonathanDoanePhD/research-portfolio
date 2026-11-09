const svgNS = 'http://www.w3.org/2000/svg';
const svgNode = name => document.createElementNS(svgNS, name);

export async function readLayers() {
  try {
    const response = await fetch('data/geography.json');
    if (!response.ok) throw new Error(`Could not load geographic overlays (HTTP ${response.status}).`);
    const data = await response.json();
    const image = new Image();
    image.src = 'data/elevation.webp';
    try {
      await image.decode();
      data.elevation.image = image;
    } catch (error) {
      console.warn('Elevation image unavailable.', error);
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
    elevationLegend.hidden = !elevationToggle.checked;
    redraw();
  }
  geographyToggle.addEventListener('change', sync);
  elevationToggle.addEventListener('change', sync);

  return {
    terrain,
    get showElevation() { return elevationToggle.checked; },
    render(project) {
      if (!geographyToggle.checked) return;
      for (const {feature, path, label} of entries) {
        const d = feature.paths.map(line => line.map(([x,z], index) => {
          const [px,py] = project(x,z);
          return `${index ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`;
        }).join('')).join('');
        path.setAttribute('d', d);
        const [x,y] = project(...feature.anchor);
        label.setAttribute('x', x.toFixed(1));
        label.setAttribute('y', (y - 5).toFixed(1));
      }
    },
  };
}
