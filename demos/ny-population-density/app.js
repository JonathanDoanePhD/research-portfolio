import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js?v=anchored-zoom';
import { startCanvasMap } from './fallback.js?v=shadow-toggle';
import { createLayers, readLayers } from './layers.js?v=adk-roads';
import { colorChannels, mountPopulationPalette } from './population-colors.js?v=palette-editor';
import { studio, visibleGroundBounds } from './studio-light.js?v=shadow-toggle';
import { makeTowerOcclusion, minimumOcclusionHeight } from './geography-depth.js?v=fixed-population';
import { groundHeight } from './terrain.js';
import { topDownFrame } from './map-frame.js';
import { mountHoverCities } from './hover-cities.js';

const stage = document.querySelector('#stage');
const status = document.querySelector('#status');
const tip = document.querySelector('#tip');
const hint = document.querySelector('#controls-hint');
const labels = document.querySelector('#labels');
const places = document.querySelector('#place-buttons');
const height = document.querySelector('#height');
const heightFactor = document.querySelector('#height-factor');
const showShadows = document.querySelector('#show-shadows');
const view3D = document.querySelector('#view-3d');
const viewFlat = document.querySelector('#view-flat');
const reset = document.querySelector('#reset');
const number = new Intl.NumberFormat('en-US');
const heightScale = document.querySelector('#height-scale');
const palette = mountPopulationPalette(document.querySelector('#population-bands'),
  document.querySelector('#palette-editor'));
const fullScreen = document.querySelector('#fullscreen');
const mapCard = stage.closest('.map-card');
fullScreen.hidden = false;
function updateFullscreen() {
  const active = document.fullscreenElement === mapCard || mapCard.classList.contains('is-expanded');
  fullScreen.textContent = active ? 'Exit fullscreen' : 'Fullscreen';
  fullScreen.setAttribute('aria-pressed',String(active));
}
function expandViewport(expanded) {
  mapCard.classList.toggle('is-expanded',expanded);
  document.body.classList.toggle('map-expanded',expanded);
  updateFullscreen();
}
fullScreen.addEventListener('click', async () => {
  if (document.fullscreenElement === mapCard) {
    await document.exitFullscreen();
  } else if (mapCard.classList.contains('is-expanded')) {
    expandViewport(false);
  } else {
    try {
      if (!document.fullscreenEnabled || !mapCard.requestFullscreen) throw new Error('Native fullscreen unavailable');
      await mapCard.requestFullscreen();
    } catch {
      expandViewport(true);
    }
  }
});
document.addEventListener('fullscreenchange',updateFullscreen);
document.addEventListener('keydown',event => {
  if (event.key === 'Escape' && mapCard.classList.contains('is-expanded')) expandViewport(false);
});

function towerMaterial() {
  const material = new THREE.MeshLambertMaterial({flatShading:true});
  const stopCount = palette.stops.length;
  const positions = {value:new Float32Array(stopCount)};
  const colors = {value:Array.from({length:stopCount},() => new THREE.Vector3())};
  function updateStops(stops) {
    stops.forEach(([population,color],i) => {
      positions.value[i] = population;
      colors.value[i].set(...colorChannels(color).map(channel => channel/255));
    });
  }
  updateStops(palette.stops);
  palette.subscribe(updateStops);
  material.onBeforeCompile = shader => {
    shader.uniforms.rampColors = colors;
    shader.uniforms.rampPositions = positions;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float towerPopulation;\nvarying float populationAtHeight;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\npopulationAtHeight = towerPopulation * (position.y + 0.5);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float populationAtHeight;
        uniform float rampPositions[${stopCount}];
        uniform vec3 rampColors[${stopCount}];
        vec3 populationGradient(float d) {
          float position = clamp(d, rampPositions[0], rampPositions[${stopCount-1}]);
          vec3 c = rampColors[0];
          for (int i=1; i<${stopCount}; i++) {
            if (position <= rampPositions[i]) {
              float weight = (position-rampPositions[i-1])/(rampPositions[i]-rampPositions[i-1]);
              c = mix(rampColors[i-1], rampColors[i], weight);
              break;
            }
            c = rampColors[i];
          }
          return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(vec3(0.04045),c));
        }`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= populationGradient(populationAtHeight);');
  };
  return material;
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
  let largest = 0;
  let index = 0;
  for (const chunk of chunks) {
    const data = new DataView(chunk);
    for (let offset = 0; offset < data.byteLength; offset += recordBytes, index++) {
      cells.x[index] = data.getInt16(offset, true) * meta.step;
      cells.z[index] = data.getInt16(offset + 2, true) * meta.step;
      cells.density[index] = data.getFloat32(offset + 4, true);
      cells.population[index] = recordBytes === 12 ? data.getUint16(offset + 8, true) : data.getUint32(offset + 8, true);
      largest = Math.max(largest,cells.population[index]);
      cells.radius[index] = data.getUint8(offset + recordBytes - 2) * radiusStep;
      cells.angle[index] = data.getUint8(offset + recordBytes - 1) * Math.PI / (3 * 255);
    }
  }
  return {...cells, largest};
}

function wireGranularity(levels, grids, renderGrid) {
  const maxTowerPopulation = Math.max(...grids.map(grid => grid.largest));
  const control = document.querySelector('#granularity');
  const areaLabel = document.querySelector('#cell-area');
  const countLabel = document.querySelector('#grid-count');
  const largestLabel = document.querySelector('#largest-cell');
  function update() {
    const index = Number(control.value);
    const cells = grids[index];
    const area = new Intl.NumberFormat('en-US', {maximumSignificantDigits: 2}).format(levels[index].averageArea);
    areaLabel.textContent = `~${area} sq. mi.`;
    control.setAttribute('aria-valuetext', `${index === 0 ? 'Original cells, ' : ''}about ${area} square miles per hexagon`);
    countLabel.textContent = number.format(cells.count);
    const heightForPopulation = heightScale.value === 'linear'
      ? population => 112*population/maxTowerPopulation
      : population => 112*Math.sqrt(population/maxTowerPopulation);
    for (let i=0;i<cells.count;i++) cells.elevation[i] = heightForPopulation(cells.population[i]);
    cells.peakHeight = heightForPopulation(cells.largest);
    largestLabel.textContent = number.format(cells.largest);
    renderGrid(cells);
  }
  control.oninput = update;
  heightScale.addEventListener('change',update);
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
    new THREE.MeshLambertMaterial({color: 0x254634}),
    new THREE.MeshLambertMaterial({color: 0x152b21}),
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
    ['data/map.json?v=shadow-towns', 'data/levels.json'].map(async path => (await checkedFetch(path)).json())
  );
  const levels = [{...meta, averageArea: 0.30}, ...parentLevels];
  const grids = await Promise.all(levels.map(level => readGrid({...level, step: meta.step})));
  let cells = grids[0];
  const overview = topDownFrame(meta.outline);
  const layerData = await layerRequest;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({alpha: true, antialias: true});
  } catch {
    wireGranularity(levels, grids, startCanvasMap({meta, layerData, palette}));
    return;
  }
  renderer.shadowMap.enabled = showShadows.checked;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'New York population map. Arrow keys pan. Plus and minus zoom.');
  stage.prepend(canvas);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfffcf7, 0xb0c4d5, 1.35));
  const sun = new THREE.SpotLight(0xffffff,2.55,0,.65,0,0);
  sun.castShadow = showShadows.checked;
  const shadowResolution = Math.min(4096,renderer.capabilities.maxTextureSize);
  sun.shadow.mapSize.set(shadowResolution,shadowResolution);
  sun.shadow.radius = .75;
  sun.shadow.camera.near = 12;
  sun.shadow.camera.far = 2800;
  sun.shadow.normalBias = .08;
  scene.add(sun.target);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShadowMaterial({color:0x17364f, opacity:.29, depthWrite:false})
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -4.4;
  ground.receiveShadow = true;
  scene.add(ground, sun, stateBase(meta.outline));

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 9500);
  const controls = new OrbitControls(camera, canvas);
  controls.minZoom = 0.06;
  controls.maxZoom = 45;
  controls.zoomToCursor = true;
  controls.maxPolarAngle = Math.PI / 2;
  controls.listenToKeyEvents(canvas);

  const prism = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
  prism.rotateY(-Math.PI / 2);
  const towerPopulations = new THREE.InstancedBufferAttribute(new Float32Array(meta.count), 1);
  prism.setAttribute('towerPopulation', towerPopulations);
  const towers = new THREE.InstancedMesh(prism, towerMaterial(), meta.count);
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
  const idColor = new THREE.Color();
  for (let i = 0; i < meta.count; i++) {
    const id = i + 1;
    picker.setColorAt(i, idColor.setRGB((id & 255) / 255, ((id >>> 8) & 255) / 255, (id >>> 16) / 255));
  }

  const matrix = new THREE.Matrix4();
  let multiplier = Number(height.value)/100*Number(heightFactor.value);
  let groundLevels;
  function updateHeights() {
    for (let i = 0; i < cells.count; i++) {
      const h = Math.max(0.0001, cells.elevation[i] * multiplier);
      const r = cells.radius[i] * 0.98;
      const a = cells.angle[i];
      const c = r * Math.cos(a);
      const s = r * Math.sin(a);
      const base = reliefWasEnabled ? groundLevels[i] : 0;
      matrix.set(c, 0, s, cells.x[i], 0, h, 0, base + h / 2,
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
  let flatTerrain;
  let raisedTerrain;
  let reliefWasEnabled = false;
  const previousLight = new THREE.Vector3(Infinity,Infinity,Infinity);
  const lightPoint = new THREE.Vector3();
  const viewCorners = Array.from({length:8},() => new THREE.Vector3());
  const projectedBase = new THREE.Vector3();
  const projectedTop = new THREE.Vector3();
  const overlays = createLayers(layerData, queueDraw);
  if (overlays.terrain) {
    const {image,left,top,width,height:depth,cols,rows,heights} = overlays.terrain;
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    // Use separate geometry buffers. The shadow pass can cache the raised
    // buffer through the next render, even after the ground switches to flat.
    flatTerrain = new THREE.PlaneGeometry(width, depth);
    raisedTerrain = new THREE.PlaneGeometry(width, depth, cols-1, rows-1);
    const vertices = raisedTerrain.getAttribute('position');
    for (let i=0;i<heights.length;i++) vertices.setZ(i,heights[i]);
    raisedTerrain.computeVertexNormals();
    terrainMesh = new THREE.Mesh(flatTerrain, new THREE.MeshLambertMaterial({map:texture, alphaTest:.48}));
    terrainMesh.position.set(left + width/2, -.08, top + depth/2);
    terrainMesh.rotation.x = -Math.PI/2;
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);
  }

  function surfaceAt(x,z) {
    return reliefWasEnabled ? groundHeight(overlays.terrain,x,z) : 0;
  }

  function project(x,z) {
    point.set(x,surfaceAt(x,z)+.08,z).project(camera);
    return [(point.x+1)*stage.clientWidth/2,(1-point.y)*stage.clientHeight/2,-point.z];
  }

  const hoverCity = mountHoverCities(meta.hoverCities ?? [],labels,project);

  function towerOcclusion() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const screenScale = w * camera.zoom / (camera.right-camera.left);
    const index = makeTowerOcclusion(w);
    const minHeight = minimumOcclusionHeight(cells.peakHeight * multiplier);
    for (let i=0;i<cells.count;i++) {
      const towerHeight = cells.elevation[i]*multiplier;
      if (towerHeight < minHeight || towerHeight*screenScale < 2) continue;
      const y = reliefWasEnabled ? groundLevels[i] : 0;
      const radius = cells.radius[i]*screenScale;
      projectedBase.set(cells.x[i],y,cells.z[i]).project(camera);
      projectedTop.set(cells.x[i],y+towerHeight,cells.z[i]).project(camera);
      const x = (projectedBase.x+1)*w/2;
      const base = (1-projectedBase.y)*h/2;
      const top = (1-projectedTop.y)*h/2;
      if (x+radius<0 || x-radius>w || base+radius<0 || top-radius>h) continue;
      index.add(x,base,top,radius,-projectedBase.z,-projectedTop.z,radius*.55);
    }
    return index.hides;
  }

  function updateLight() {
    camera.updateMatrixWorld();
    const distance = camera.position.distanceTo(controls.target);
    lightPoint.set(studio.x,studio.y,studio.z-distance).applyMatrix4(camera.matrixWorld);
    const floor = ground.position.y;
    viewCorners.forEach((corner,i) => corner.set(i & 1 ? 1 : -1,i & 2 ? 1 : -1,i & 4 ? 1 : -1).unproject(camera));
    const bounds = visibleGroundBounds(viewCorners,floor);
    ground.visible = showShadows.checked && !!bounds;
    if (bounds) {
      ground.position.x = (bounds.left+bounds.right)/2;
      ground.position.z = (bounds.top+bounds.bottom)/2;
      ground.scale.set(bounds.right-bounds.left+4,bounds.bottom-bounds.top+4,1);
    }

    // A downward cone can cover any ground point in the view, even when the camera is panned.
    const reachX = Math.max(Math.abs(lightPoint.x-(bounds?.left ?? -350)),
                            Math.abs(lightPoint.x-(bounds?.right ?? 350)));
    const reachZ = Math.max(Math.abs(lightPoint.z-(bounds?.top ?? -270)),
                            Math.abs(lightPoint.z-(bounds?.bottom ?? 270)));
    const angle = Math.min(Math.PI/2-.0001,Math.max(.65,
      Math.atan2(Math.hypot(reachX,reachZ)+10,Math.max(1,Math.abs(lightPoint.y-floor)-26))));
    if (previousLight.distanceToSquared(lightPoint)<.001 && Math.abs(sun.angle-angle)<.0001) return;
    previousLight.copy(lightPoint);
    sun.position.copy(lightPoint);
    sun.target.position.set(lightPoint.x,lightPoint.y+(lightPoint.y>floor ? -1 : 1),lightPoint.z);
    sun.angle = angle;
    sun.shadow.camera.far = Math.max(2800,Math.abs(lightPoint.y-floor)+100);
    renderer.shadowMap.needsUpdate = true;
  }

  function queueDraw() {
    hoverCity.hide();
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (terrainMesh && reliefWasEnabled !== overlays.showElevation) {
        reliefWasEnabled = terrainMesh.castShadow = overlays.showElevation;
        terrainMesh.geometry = reliefWasEnabled ? raisedTerrain : flatTerrain;
        updateHeights();
      }
      updateLight();
      renderer.render(scene, camera);
      if (overlays.showOverlay) overlays.render(project,towerOcclusion());
      for (const place of meta.places) {
        point.set(place.x, surfaceAt(place.x,place.z) + (flat ? 0 : place.peak * multiplier + 2), place.z).project(camera);
        const x = (point.x + 1) * stage.clientWidth / 2;
        const y = (1 - point.y) * stage.clientHeight / 2;
        place.label.hidden = Math.abs(point.x) > .91 || Math.abs(point.y) > .90 ||
          (stage.clientWidth < 530 && !selected && ['Rochester', 'Syracuse', 'Albany'].includes(place.name));
        place.label.style.left = `${x}px`;
        place.label.style.top = `${y}px`;
      }
    });
  }

  function overviewZoom() {
    return Math.min(worldWidth/overview.width,(camera.top-camera.bottom)/overview.depth);
  }

  function moveCamera() {
    const x = selected?.x ?? (flat ? overview.x : -8);
    const z = selected?.z ?? (flat ? overview.z : 1);
    controls.target.set(x, selected && !flat ? 10 : 0, z);
    camera.position.set(x + (flat ? .01*Math.sin(overview.angle) : 52),
                        flat ? 770 : 476,
                        z + (flat ? .01*Math.cos(overview.angle) : 550));
    // Orthographic framing is unchanged by distance, but tall towers need depth clearance.
    camera.position.sub(controls.target).multiplyScalar(6).add(controls.target);
    camera.zoom = selected ? worldWidth / selected.distance : (flat ? overviewZoom() : 1);
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
    const oldOverviewZoom = overviewZoom();
    const worldHeight = Math.max(470, 740 / aspect);
    worldWidth = worldHeight * aspect;
    if (selected) camera.zoom *= worldWidth / oldWidth;
    camera.left = -worldWidth / 2;
    camera.right = worldWidth / 2;
    camera.top = worldHeight / 2;
    camera.bottom = -worldHeight / 2;
    if (flat && !selected) camera.zoom *= overviewZoom()/oldOverviewZoom;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    queueDraw();
  }
  new ResizeObserver(resize).observe(stage);
  resize();
  moveCamera();
  controls.addEventListener('change', () => { tip.hidden = true; queueDraw(); });
  palette.subscribe(queueDraw);

  view3D.onclick = () => { flat = false; moveCamera(); };
  viewFlat.onclick = () => { flat = true; selected = null; moveCamera(); };
  reset.onclick = () => {
    height.value = height.defaultValue;
    heightFactor.value = '1';
    height.setAttribute('aria-valuetext',`${height.value}%`);
    multiplier = Number(height.value)/100*Number(heightFactor.value);
    selected = null;
    flat = false;
    updateHeights();
    moveCamera();
  };
  function applyTowerHeight() {
    multiplier = Number(height.value)/100*Number(heightFactor.value);
    height.setAttribute('aria-valuetext', `${height.value}%`);
    updateHeights();
    tip.hidden = true;
    queueDraw();
  }
  height.addEventListener('input',applyTowerHeight);
  heightFactor.addEventListener('change',applyTowerHeight);
  showShadows.addEventListener('change',() => {
    renderer.shadowMap.enabled = sun.castShadow = showShadows.checked;
    renderer.shadowMap.needsUpdate = true;
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
    title.textContent = `${number.format(cells.population[index])} estimated residents`;
    tip.append(title, `${number.format(Math.round(cells.density[index]))} people / sq. mi.`);
    tip.style.left = `${Math.max(4, Math.min(x + 13, w - tip.offsetWidth - 6))}px`;
    tip.style.top = `${Math.max(4, Math.min(y + 12, h - tip.offsetHeight - 6))}px`;
  }
  canvas.addEventListener('pointermove', event => {
    clearTimeout(hoverTimer);
    if (event.pointerType !== 'mouse' || event.buttons) return;
    if (hoverCity.show(event.offsetX,event.offsetY)) {
      tip.hidden = true;
      return;
    }
    hoverTimer = setTimeout(() => showCell(event.offsetX, event.offsetY), 60);
  });
  canvas.addEventListener('pointerleave', () => { clearTimeout(hoverTimer); tip.hidden = true; hoverCity.hide(); });
  canvas.addEventListener('pointerdown', event => {
    hoverCity.hide();
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

  function updateCells(grid) {
    cells = grid;
    towers.count = picker.count = cells.count;
    towerPopulations.array.set(cells.population);
    towerPopulations.needsUpdate = true;
    groundLevels = cells.x.map((x,i) => groundHeight(overlays.terrain,x,cells.z[i]));
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

  [view3D, viewFlat, reset, height, heightFactor, showShadows].forEach(control => { control.disabled = false; });
  status.hidden = true;
  stage.dataset.ready = 'true';
}

start().catch(error => {
  console.error(error);
  status.textContent = 'The 3D map couldn’t load. Try reloading in a browser with WebGL enabled.';
  hint.hidden = true;
});
