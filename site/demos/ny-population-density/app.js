import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

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
const palette = [0xedc5a2, 0xf39655, 0xdf6027, 0x53b7e6, 0x135888];
const colorBand = d => d < 10 ? 0 : d < 100 ? 1 : d < 1000 ? 2 : d < 10000 ? 3 : 4;
const towerHeight = d => 0.4 + 66 * Math.log1p(d / 85) / Math.log1p(120000 / 85);

async function checkedFetch(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`HTTP ${response.status} loading ${path}`);
  return response;
}

async function readGrid() {
  const meta = await (await checkedFetch('data/map.json')).json();
  const chunks = await Promise.all(meta.chunks.map(async name => {
    const response = await checkedFetch(`data/${name}`);
    return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }));
  if (chunks.reduce((total, chunk) => total + chunk.byteLength, 0) !== meta.count * 12) {
    throw new Error('Population grid has an unexpected length.');
  }
  const cells = {
    x: new Float32Array(meta.count), z: new Float32Array(meta.count),
    density: new Float32Array(meta.count), elevation: new Float32Array(meta.count),
    radius: new Float32Array(meta.count), angle: new Float32Array(meta.count),
    population: new Uint16Array(meta.count),
  };
  let index = 0;
  for (const chunk of chunks) {
    const data = new DataView(chunk);
    for (let offset = 0; offset < data.byteLength; offset += 12, index++) {
      cells.x[index] = data.getInt16(offset, true) * meta.step;
      cells.z[index] = data.getInt16(offset + 2, true) * meta.step;
      cells.density[index] = data.getFloat32(offset + 4, true);
      cells.elevation[index] = towerHeight(cells.density[index]);
      cells.population[index] = data.getUint16(offset + 8, true);
      cells.radius[index] = data.getUint8(offset + 10) * 0.003;
      cells.angle[index] = data.getUint8(offset + 11) * Math.PI / (3 * 255);
    }
  }
  return { meta, cells };
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
    island.rotation.x = -Math.PI / 2;
    island.position.y = -4.3;
    group.add(island);
  }
  return group;
}

function drawFallback(meta, cells) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Top-down population density map of New York');
  canvas.setAttribute('role', 'img');
  canvas.style.cursor = 'default';
  stage.prepend(canvas);
  const context = canvas.getContext('2d');
  const colors = palette.map(color => '#' + color.toString(16).padStart(6, '0'));
  function draw() {
    const width = stage.clientWidth;
    const tall = stage.clientHeight;
    const resolution = Math.min(devicePixelRatio, 2);
    canvas.width = width * resolution;
    canvas.height = tall * resolution;
    context.scale(resolution, resolution);
    const scale = Math.min(width / 735, tall / 565);
    const screenX = x => width / 2 + x * scale;
    const screenY = z => tall / 2 + z * scale;
    context.fillStyle = '#edddc8';
    context.strokeStyle = '#b6987d';
    context.beginPath();
    for (const polygon of meta.outline) {
      for (const ring of polygon) {
        ring.forEach(([x, y], index) => context[index ? 'lineTo' : 'moveTo'](screenX(x), screenY(-y)));
        context.closePath();
      }
    }
    context.fill('evenodd');
    context.stroke();
    for (let band = 0; band < colors.length; band++) {
      context.fillStyle = colors[band];
      for (let i = 0; i < meta.count; i++) {
        if (colorBand(cells.density[i]) !== band) continue;
        const dot = Math.max(.85, cells.radius[i] * scale * 1.8);
        context.fillRect(screenX(cells.x[i]) - dot / 2, screenY(cells.z[i]) - dot / 2, dot, dot);
      }
    }
  }
  new ResizeObserver(draw).observe(stage);
  draw();
  status.hidden = true;
  hint.textContent = 'Top-down preview · 3D requires WebGL';
  stage.dataset.ready = 'fallback';
}

async function start() {
  const { meta, cells } = await readGrid();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({alpha: true, antialias: true});
  } catch {
    drawFallback(meta, cells);
    return;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'New York population density map. Arrow keys pan. Plus and minus zoom.');
  stage.prepend(canvas);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfffcf7, 0xb0c4d5, 2.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.45);
  sun.position.set(-200, 400, -180);
  scene.add(sun, stateBase(meta.outline));

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
    towers.setColorAt(i, paint[colorBand(cells.density[i])]);
    const id = i + 1;
    picker.setColorAt(i, idColor.setRGB((id & 255) / 255, ((id >>> 8) & 255) / 255, (id >>> 16) / 255));
  }

  const matrix = new THREE.Matrix4();
  let multiplier = 1;
  function updateHeights() {
    for (let i = 0; i < meta.count; i++) {
      const h = Math.max(0.25, cells.elevation[i] * multiplier);
      const r = cells.radius[i] * 0.98;
      const a = cells.angle[i];
      const c = r * Math.cos(a);
      const s = r * Math.sin(a);
      matrix.set(c, 0, s, cells.x[i], 0, h, 0, h / 2,
                 -s, 0, c, cells.z[i], 0, 0, 0, 1);
      towers.setMatrixAt(i, matrix);
    }
    towers.instanceMatrix.needsUpdate = true;
  }
  updateHeights();

  let selected = null;
  let flat = false;
  let worldWidth = 800;
  for (const place of meta.places) {
    place.peak = 0;
    const range = place.name === 'New York City' ? 13 : 7;
    for (let i = 0; i < meta.count; i++) {
      const dx = cells.x[i] - place.x;
      const dz = cells.z[i] - place.z;
      if (dx * dx + dz * dz < range * range) place.peak = Math.max(place.peak, cells.elevation[i]);
    }
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
  function queueDraw() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      renderer.render(scene, camera);
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
    tip.hidden = index < 0 || index >= meta.count;
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

  [view3D, viewFlat, reset, height].forEach(control => { control.disabled = false; });
  status.hidden = true;
  stage.dataset.ready = 'true';
}

start().catch(error => {
  console.error(error);
  status.textContent = 'The 3D map couldn’t load. Try reloading in a browser with WebGL enabled.';
  hint.hidden = true;
});
