import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { startCanvasMap } from './fallback.js?v=terrain-layers';
import { createLayers, readLayers } from './layers.js';

const stage = document.querySelector('#stage');
const status = document.querySelector('#status');
const tip = document.querySelector('#tip');
const hint = document.querySelector('#controls-hint');
const labels = document.querySelector('#labels');
const places = document.querySelector('#place-buttons');
const height = document.querySelector('#height');
const view3D = document.querySelector('#view-3d');
const viewFlat = document.querySelector('#view-flat');
const reset = document.querySelector('#reset');
const number = new Intl.NumberFormat('en-US');
const densityBands = [
  {limit:10, color:0xedc5a2, label:'<10'},
  {limit:100, color:0xf39655, label:'10–99'},
  {limit:500, color:0xe86f37, label:'100–499'},
  {limit:1000, color:0xbe4d28, label:'500–999'},
  {limit:2500, color:0x9bdcff, label:'1,000–2,499'},
  {limit:10000, color:0x53b7e6, label:'2,500–9,999'},
  {limit:30000, color:0x277cb6, label:'10,000–29,999'},
  {limit:Infinity, color:0x123f69, label:'30,000+'},
];
const palette = densityBands.map(band => band.color);
const colorBand = density => densityBands.findIndex(band => density < band.limit);
const towerHeight = density => density * (112 / 120000);
const sunPosition = {x:-350, y:600, z:-350};

const legend = document.querySelector('#density-bands');
for (const {color, label} of densityBands) {
  const entry = document.createElement('li');
  const swatch = document.createElement('i');
  swatch.style.setProperty('--swatch', '#' + color.toString(16).padStart(6, '0'));
  entry.append(swatch, label);
  legend.append(entry);
}

async function checkedFetch(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`HTTP ${response.status} loading ${path}`);
  return response;
}

async function readGrid(meta) {
  const recordBytes = meta.radiusStep ? 14 : 12;
  const radiusStep = meta.radiusStep ?? 0.003;
  const chunks = await Promise.all(meta.chunks.map(async name => {
    const response = await checkedFetch(`data/${name}`);
    return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }));
  if (chunks.reduce((total, chunk) => total + chunk.byteLength, 0) !== meta.count * recordBytes) {
    throw new Error('Population grid has an unexpected length.');
  }
  const cells = {
    count: meta.count,
    x: new Float32Array(meta.count), z: new Float32Array(meta.count),
    density: new Float32Array(meta.count), elevation: new Float32Array(meta.count),
    radius: new Float32Array(meta.count), angle: new Float32Array(meta.count),
    population: new Uint32Array(meta.count),
  };
  let index = 0;
  for (const chunk of chunks) {
    const data = new DataView(chunk);
    for (let offset = 0; offset < data.byteLength; offset += recordBytes, index++) {
      cells.x[index] = data.getInt16(offset, true) * meta.step;
      cells.z[index] = data.getInt16(offset + 2, true) * meta.step;
      cells.density[index] = data.getFloat32(offset + 4, true);
      cells.elevation[index] = towerHeight(cells.density[index]);
      cells.population[index] = recordBytes === 12 ? data.getUint16(offset + 8, true) : data.getUint32(offset + 8, true);
      cells.radius[index] = data.getUint8(offset + recordBytes - 2) * radiusStep;
      cells.angle[index] = data.getUint8(offset + recordBytes - 1) * Math.PI / (3 * 255);
    }
  }
  return cells;
}

function wireGranularity(levels, grids, renderGrid) {
  const control = document.querySelector('#granularity');
  const areaLabel = document.querySelector('#cell-area');
  const countLabel = document.querySelector('#grid-count');
  const shareLabel = document.querySelector('#dense-share');
  function update() {
    const index = Number(control.value);
    const cells = grids[index];
    const area = new Intl.NumberFormat('en-US', {maximumSignificantDigits: 2}).format(levels[index].averageArea);
    areaLabel.textContent = `~${area} sq. mi.`;
    control.setAttribute('aria-valuetext', `${index === 0 ? 'Original cells, ' : ''}about ${area} square miles per hexagon`);
    countLabel.textContent = number.format(cells.count);
    let total = 0;
    let dense = 0;
    for (let i = 0; i < cells.count; i++) {
      total += cells.population[i];
      if (cells.density[i] >= 10000) dense += cells.population[i];
    }
    shareLabel.textContent = new Intl.NumberFormat('en-US', {style: 'percent'}).format(dense / total);
    renderGrid(cells);
  }
  control.oninput = update;
  control.disabled = false;
  reset.addEventListener('click', () => {
    if (control.value === '0') return;
    control.value = '0';
    update();
  });
  update();
}

function stateBase(polygons) {
  const material = [
    new THREE.MeshLambertMaterial({color: 0xf0dec9}),
    new THREE.MeshLambertMaterial({color: 0xaa806a}),
  ];
  const group = new THREE.Group();
  for (const [outer, ...holes] of polygons) {
    const points = ring => ring.map(([x, y]) => new THREE.Vector2(x, y));
    const shape = new THREE.Shape(points(outer));
    shape.holes = holes.map(ring => new THREE.Path(points(ring)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: false });
    const island = new THREE.Mesh(geometry, material);
    island.receiveShadow = true;
    island.rotation.x = -Math.PI / 2;
    island.position.y = -4.3;
    group.add(island);
  }
  return group;
}

async function start() {
  const layerRequest = readLayers();
  const [meta, parentLevels] = await Promise.all(
    ['data/map.json?v=terrain-layers', 'data/levels.json'].map(async path => (await checkedFetch(path)).json())
  );
  const levels = [{...meta, averageArea: 0.30}, ...parentLevels];
  const grids = await Promise.all(levels.map(level => readGrid({...level, step: meta.step})));
  let cells = grids[0];
  const layerData = await layerRequest;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({alpha: true, antialias: true});
  } catch {
    wireGranularity(levels, grids, startCanvasMap({meta, palette, colorBand, sunPosition, layerData}));
    return;
  }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'New York population density map. Arrow keys pan. Plus and minus zoom.');
  stage.prepend(canvas);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfffcf7, 0xb0c4d5, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.95);
  sun.position.set(sunPosition.x, sunPosition.y, sunPosition.z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, {left:-565, right:565, top:565, bottom:-565, near:10, far:1550});
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.08;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    new THREE.ShadowMaterial({color:0x17364f, opacity:.22, depthWrite:false})
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -4.4;
  ground.receiveShadow = true;
  scene.add(ground, sun, stateBase(meta.outline));

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 3000);
  const controls = new OrbitControls(camera, canvas);
  controls.minZoom = 0.7;
  controls.maxZoom = 45;
  controls.maxPolarAngle = Math.PI / 2.15;
  controls.listenToKeyEvents(canvas);

  const prism = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
  prism.rotateY(-Math.PI / 2);
  const material = new THREE.MeshLambertMaterial({ flatShading: true });
  const towers = new THREE.InstancedMesh(prism, material, meta.count);
  towers.frustumCulled = false;
  towers.castShadow = true;
  towers.receiveShadow = true;
  towers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(towers);

  const pickScene = new THREE.Scene();
  const pickTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
  const pickMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
  const picker = new THREE.InstancedMesh(prism, pickMaterial, meta.count);
  picker.frustumCulled = false;
  picker.instanceMatrix = towers.instanceMatrix;
  pickScene.add(picker);
  const paint = palette.map(hex => new THREE.Color(hex));
  const idColor = new THREE.Color();
  for (let i = 0; i < meta.count; i++) {
    const id = i + 1;
    picker.setColorAt(i, idColor.setRGB((id & 255) / 255, ((id >>> 8) & 255) / 255, (id >>> 16) / 255));
  }

  const matrix = new THREE.Matrix4();
  let multiplier = 1;
  function updateHeights() {
    for (let i = 0; i < cells.count; i++) {
      const h = Math.max(0.0001, cells.elevation[i] * multiplier);
      const r = cells.radius[i] * 0.98;
      const a = cells.angle[i];
      const c = r * Math.cos(a);
      const s = r * Math.sin(a);
      matrix.set(c, 0, s, cells.x[i], 0, h, 0, h / 2,
                 -s, 0, c, cells.z[i], 0, 0, 0, 1);
      towers.setMatrixAt(i, matrix);
    }
    towers.instanceMatrix.needsUpdate = true;
    renderer.shadowMap.needsUpdate = true;
  }

  let selected = null;
  let flat = false;
  let worldWidth = 800;
  for (const place of meta.places) {
    place.label = document.createElement('span');
    place.label.className = 'map-label';
    place.label.textContent = place.name;
    labels.append(place.label);
    place.button = document.createElement('button');
    place.button.textContent = place.name;
    place.button.type = 'button';
    place.button.setAttribute('aria-pressed', 'false');
    places.append(place.button);
    place.button.onclick = () => {
      selected = selected === place ? null : place;
      moveCamera();
    };
  }

  const point = new THREE.Vector3();
  let frame;
  let terrainMesh;
  let terrainColors;
  let terrainWasVisible = false;
  const overlays = createLayers(layerData, queueDraw);
  if (overlays.terrain) {
    const {image, left, top, width, height: depth} = overlays.terrain;
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    terrainMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshLambertMaterial({map:texture, alphaTest:.48})
    );
    terrainMesh.position.set(left + width/2, -.22, top + depth/2);
    terrainMesh.rotation.x = -Math.PI/2;
    terrainMesh.receiveShadow = true;
    terrainMesh.visible = false;
    scene.add(terrainMesh);

    const pixels = document.createElement('canvas');
    pixels.width = image.naturalWidth;
    pixels.height = image.naturalHeight;
    const context = pixels.getContext('2d', {willReadFrequently:true});
    context.drawImage(image, 0, 0);
    terrainColors = context.getImageData(0, 0, pixels.width, pixels.height);
  }

  function project(x, z) {
    point.set(x, 0, z).project(camera);
    return [(point.x+1)*stage.clientWidth/2, (1-point.y)*stage.clientHeight/2];
  }
  function queueDraw() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (terrainMesh && terrainWasVisible !== overlays.showElevation) {
        terrainWasVisible = terrainMesh.visible = overlays.showElevation;
        updateColors();
      }
      renderer.render(scene, camera);
      overlays.render(project);
      for (const place of meta.places) {
        point.set(place.x, flat ? 0 : place.peak * multiplier + 2, place.z).project(camera);
        const x = (point.x + 1) * stage.clientWidth / 2;
        const y = (1 - point.y) * stage.clientHeight / 2;
        place.label.hidden = Math.abs(point.x) > .91 || Math.abs(point.y) > .90 ||
          (stage.clientWidth < 530 && !selected && ['Rochester', 'Syracuse', 'Albany'].includes(place.name));
        place.label.style.left = `${x}px`;
        place.label.style.top = `${y}px`;
      }
    });
  }

  function moveCamera() {
    const x = selected?.x ?? -8;
    const z = selected?.z ?? 1;
    controls.target.set(x, selected && !flat ? 10 : 0, z);
    camera.position.set(x + (flat ? 0 : 52), flat ? 770 : 476, z + (flat ? .01 : 550));
    camera.zoom = selected ? worldWidth / selected.distance : 1;
    camera.updateProjectionMatrix();
    controls.enableRotate = !flat;
    controls.update();
    view3D.setAttribute('aria-pressed', String(!flat));
    viewFlat.setAttribute('aria-pressed', String(flat));
    hint.textContent = flat ? 'Drag to pan · Scroll to zoom' : 'Drag to rotate · Scroll to zoom · Right-drag to pan';
    controls.mouseButtons.LEFT = flat ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.touches.ONE = flat ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    for (const place of meta.places) place.button.setAttribute('aria-pressed', String(place === selected));
    tip.hidden = true;
    queueDraw();
  }

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const aspect = w / h;
    const oldWidth = worldWidth;
    const worldHeight = Math.max(470, 740 / aspect);
    worldWidth = worldHeight * aspect;
    if (selected) camera.zoom *= worldWidth / oldWidth;
    camera.left = -worldWidth / 2;
    camera.right = worldWidth / 2;
    camera.top = worldHeight / 2;
    camera.bottom = -worldHeight / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    queueDraw();
  }
  new ResizeObserver(resize).observe(stage);
  resize();
  moveCamera();
  controls.addEventListener('change', () => { tip.hidden = true; queueDraw(); });

  view3D.onclick = () => { flat = false; moveCamera(); };
  viewFlat.onclick = () => { flat = true; moveCamera(); };
  reset.onclick = () => {
    height.value = 100;
    multiplier = 1;
    selected = null;
    flat = false;
    updateHeights();
    moveCamera();
  };
  height.addEventListener('input', () => {
    multiplier = Number(height.value) / 100;
    height.setAttribute('aria-valuetext', `${height.value}%`);
    updateHeights();
    tip.hidden = true;
    queueDraw();
  });
  canvas.addEventListener('keydown', event => {
    if (event.key !== '+' && event.key !== '=' && event.key !== '-') return;
    event.preventDefault();
    camera.zoom = THREE.MathUtils.clamp(camera.zoom * (event.key === '-' ? 1 / 1.25 : 1.25), controls.minZoom, controls.maxZoom);
    camera.updateProjectionMatrix();
    tip.hidden = true;
    queueDraw();
  });

  const pixel = new Uint8Array(4);
  let hoverTimer;
  let pointerStart;
  function showCell(x, y) {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    camera.setViewOffset(w, h, Math.floor(x), Math.floor(y), 1, 1);
    renderer.setRenderTarget(pickTarget);
    renderer.render(pickScene, camera);
    renderer.readRenderTargetPixels(pickTarget, 0, 0, 1, 1, pixel);
    renderer.setRenderTarget(null);
    camera.clearViewOffset();
    const index = (pixel[0] + 256 * pixel[1] + 65536 * pixel[2]) - 1;
    tip.hidden = index < 0 || index >= cells.count;
    if (tip.hidden) return;
    tip.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = `${number.format(Math.round(cells.density[index]))} people / sq. mi.`;
    tip.append(title, `${number.format(cells.population[index])} estimated residents`);
    tip.style.left = `${Math.max(4, Math.min(x + 13, w - tip.offsetWidth - 6))}px`;
    tip.style.top = `${Math.max(4, Math.min(y + 12, h - tip.offsetHeight - 6))}px`;
  }
  canvas.addEventListener('pointermove', event => {
    clearTimeout(hoverTimer);
    if (event.pointerType !== 'mouse' || event.buttons) return;
    hoverTimer = setTimeout(() => showCell(event.offsetX, event.offsetY), 60);
  });
  canvas.addEventListener('pointerleave', () => { clearTimeout(hoverTimer); tip.hidden = true; });
  canvas.addEventListener('pointerdown', event => {
    clearTimeout(hoverTimer);
    tip.hidden = true;
    pointerStart = [event.offsetX, event.offsetY];
  });
  canvas.addEventListener('pointerup', event => {
    if (pointerStart && event.button === 0 &&
        Math.hypot(pointerStart[0] - event.offsetX, pointerStart[1] - event.offsetY) < 6) {
      showCell(event.offsetX, event.offsetY);
    }
    pointerStart = null;
  });

  function updateColors() {
    const blend = new THREE.Color();
    const terrain = overlays.terrain;
    for (let i = 0; i < cells.count; i++) {
      const band = colorBand(cells.density[i]);
      blend.copy(paint[band]);
      if (terrainWasVisible && terrainColors && band < 4) {
        const {data, width, height: depth} = terrainColors;
        const x = Math.floor((cells.x[i]-terrain.left) * width / terrain.width);
        const z = Math.floor((cells.z[i]-terrain.top) * depth / terrain.height);
        const offset = (z*width+x)*4;
        if (x >= 0 && x < width && z >= 0 && z < depth && data[offset+3] > 128) {
          blend.setRGB(data[offset]/255, data[offset+1]/255, data[offset+2]/255, THREE.SRGBColorSpace);
          blend.lerp(paint[band], [.18,.28,.50,.68][band]);
        }
      }
      towers.setColorAt(i, blend);
    }
    towers.instanceColor.needsUpdate = true;
  }

  function updateCells(grid) {
    cells = grid;
    towers.count = picker.count = cells.count;
    updateColors();
    for (const place of meta.places) {
      place.peak = 0;
      const range = place.name === 'New York City' ? 13 : 7;
      for (let i = 0; i < cells.count; i++) {
        const dx = cells.x[i] - place.x;
        const dz = cells.z[i] - place.z;
        if (dx * dx + dz * dz < (range + cells.radius[i]) ** 2) {
          place.peak = Math.max(place.peak, cells.elevation[i]);
        }
      }
    }
    updateHeights();
    tip.hidden = true;
    queueDraw();
  }
  wireGranularity(levels, grids, updateCells);

  [view3D, viewFlat, reset, height].forEach(control => { control.disabled = false; });
  status.hidden = true;
  stage.dataset.ready = 'true';
}

start().catch(error => {
  console.error(error);
  status.textContent = 'The 3D map couldn’t load. Try reloading in a browser with WebGL enabled.';
  hint.hidden = true;
});
