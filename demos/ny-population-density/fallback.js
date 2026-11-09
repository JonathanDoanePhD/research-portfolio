import { createLayers } from './layers.js?v=studio-map';
import { populationColor, populationStops } from './population-colors.js?v=relative-population-colors';
import { flatLightPosition, groundShadow } from './studio-light.js';
import { makeTowerOcclusion, minimumOcclusionHeight } from './geography-depth.js?v=overlay-height';
import { groundHeight } from './terrain.js';

const fmt = new Intl.NumberFormat('en-US');

export function startCanvasMap({meta, layerData}) {
  const stage = document.querySelector('#stage');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'New York population map. Arrow keys pan. Plus and minus zoom.');
  stage.prepend(canvas);

  const controls = {
    relief: document.querySelector('#view-3d'),
    flat: document.querySelector('#view-flat'),
    height: document.querySelector('#height'),
    reset: document.querySelector('#reset'),
    hint: document.querySelector('#controls-hint'),
    places: document.querySelector('#place-buttons'),
    labels: document.querySelector('#labels'),
    tip: document.querySelector('#tip'),
  };
  const colorStrip = document.createElement('canvas');
  colorStrip.width = 1;
  colorStrip.height = 4096;
  const strip = colorStrip.getContext('2d');
  const gradient = strip.createLinearGradient(0,0,0,colorStrip.height);
  for (const [at,color] of populationStops) gradient.addColorStop(1-at,color);
  strip.fillStyle = gradient;
  strip.fillRect(0,0,1,colorStrip.height);
  let cells;
  let tops;
  let groundLevels;
  let order;
  const visible = [];
  const screenX = new Float32Array(meta.count);
  const screenBase = new Float32Array(meta.count);
  const screenTop = new Float32Array(meta.count);
  const radii = new Float32Array(meta.count);
  let angle = .10;
  let incline = .67;
  let zoom = 1;
  let centerX = -8;
  let centerZ = 1;
  let scale = 1;
  let flat = false;
  let selected = null;
  let frame;
  let lastAngle;
  let cos, sin, tiltSin, tiltCos;
  const overlays = createLayers(layerData, queue);
  const terrain = overlays.terrain;
  const surface = terrain ? terrainTriangles() : null;

  function terrainTriangles() {
    const {image,left,top,width,height,cols,rows,heights} = terrain;
    const texture = document.createElement('canvas');
    texture.width = image.naturalWidth;
    texture.height = image.naturalHeight;
    const ctx = texture.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(image,0,0);
    const pixels = ctx.getImageData(0,0,texture.width,texture.height).data;
    const points = Array.from(heights, (y,i) => ({
      x:left+(i%cols)*width/(cols-1),
      z:top+Math.floor(i/cols)*height/(rows-1),
      y,
    }));
    const triangles = [];
    function add(a,b,c,u,v) {
      const px = Math.floor(u*texture.width/(cols-1));
      const py = Math.floor(v*texture.height/(rows-1));
      const i = (py*texture.width+px)*4;
      if (pixels[i+3] < 128) return;
      triangles.push({a,b,c,x:(points[a].x+points[b].x+points[c].x)/3,
        z:(points[a].z+points[b].z+points[c].z)/3,
        color:`rgb(${pixels[i]},${pixels[i+1]},${pixels[i+2]})`});
    }
    for (let j=0;j<rows-1;j++) {
      for (let i=0;i<cols-1;i++) {
        const a=j*cols+i;
        add(a,a+cols,a+1,i+1/3,j+1/3);
        add(a+cols,a+cols+1,a+1,i+2/3,j+2/3);
      }
    }
    return {points,triangles};
  }

  for (const place of meta.places) {
    place.label = document.createElement('span');
    place.label.className = 'map-label';
    place.label.textContent = place.name;
    controls.labels.append(place.label);
    place.button = document.createElement('button');
    place.button.type = 'button';
    place.button.textContent = place.name;
    place.button.setAttribute('aria-pressed', 'false');
    place.button.onclick = () => choose(selected === place ? null : place);
    controls.places.append(place.button);
  }

  function measure() {
    return Math.min(stage.clientWidth / 750, stage.clientHeight / (flat ? 550 : 425));
  }

  function project(x, z, elevation) {
    const dx = x - centerX;
    const dz = z - centerZ;
    return [
      canvas.clientWidth / 2 + (dx * cos - dz * sin) * scale,
      canvas.clientHeight / 2 + ((dx * sin + dz * cos) * tiltSin - elevation * tiltCos) * scale,
    ];
  }

  function outline(offset, fill) {
    context.beginPath();
    for (const polygon of meta.outline) {
      for (const ring of polygon) {
        ring.forEach(([x, y], i) => {
          const [px, py] = project(x, -y, offset);
          if (i) context.lineTo(px, py);
          else context.moveTo(px, py);
        });
        context.closePath();
      }
    }
    context.fillStyle = fill;
    context.fill('evenodd');
  }

  function drawTerrain(width,tall) {
    if (!overlays.showElevation || !surface) return;
    if (flat) {
      const {image,left,top,width:terrainWidth,height:terrainHeight} = terrain;
      const [x,y] = project(left,top,0);
      context.save();
      context.transform(cos*scale, sin*tiltSin*scale, -sin*scale, cos*tiltSin*scale, x, y);
      context.drawImage(image,0,0,terrainWidth,terrainHeight);
      context.restore();
      return;
    }
    const points = surface.points.map(({x,z,y}) => project(x,z,y));
    for (const triangle of surface.triangles) {
      const [ax,ay] = points[triangle.a];
      const [bx,by] = points[triangle.b];
      const [cx,cy] = points[triangle.c];
      if (Math.max(ax,bx,cx)<0 || Math.min(ax,bx,cx)>width ||
          Math.max(ay,by,cy)<0 || Math.min(ay,by,cy)>tall) continue;
      context.fillStyle = triangle.color;
      context.beginPath();
      context.moveTo(ax,ay);
      context.lineTo(bx,by);
      context.lineTo(cx,cy);
      context.closePath();
      context.fill();
      context.strokeStyle = triangle.color;
      context.lineWidth = .5;
      context.stroke();
    }
  }

  function drawShadows(width,tall,multiplier) {
    if (multiplier === 0 || overlays.showElevation) return;
    const [lx,ly,lz] = flatLightPosition(centerX,centerZ,cos,sin,tiltSin,tiltCos);
    context.beginPath();
    for (const i of order) {
      const h = cells.elevation[i]*multiplier;
      if (h*scale < .20) continue;
      const [x,y] = project(cells.x[i],cells.z[i],0);
      const [endX,endY] = project(...groundShadow(cells.x[i],cells.z[i],h,lx,ly,lz),0);
      const length = Math.hypot(endX-x,endY-y);
      if (length<.65) continue;
      const radius = Math.max(.42,cells.radius[i]*scale*.91);
      const endRadius = radius*ly/Math.max(1,ly-h);
      if (Math.max(x,endX)+endRadius<0 || Math.min(x,endX)-endRadius>width ||
          Math.max(y,endY)+endRadius<0 || Math.min(y,endY)-endRadius>tall) continue;
      const nx = -(endY-y)/length;
      const ny = (endX-x)/length;
      context.moveTo(x+nx*radius,y+ny*radius);
      context.lineTo(endX+nx*endRadius,endY+ny*endRadius);
      context.lineTo(endX-nx*endRadius,endY-ny*endRadius);
      context.lineTo(x-nx*radius,y-ny*radius);
      context.closePath();
    }
    context.fillStyle = 'rgba(20,43,62,.24)';
    context.fill();
  }

  function draw() {
    frame = null;
    const width = stage.clientWidth;
    const tall = stage.clientHeight;
    const resolution = Math.min(devicePixelRatio, 1.5);
    const pixelWidth = Math.round(width * resolution);
    const pixelHeight = Math.round(tall * resolution);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(resolution, 0, 0, resolution, 0, 0);
    context.clearRect(0, 0, width, tall);
    scale = measure() * zoom;
    cos = Math.cos(angle);
    sin = Math.sin(angle);
    tiltSin = flat ? 1 : Math.sin(incline);
    tiltCos = flat ? 0 : Math.cos(incline);
    if (lastAngle !== angle) {
      order.sort((a,b) => (cells.x[a]-cells.x[b])*sin + (cells.z[a]-cells.z[b])*cos);
      surface?.triangles.sort((a,b) => (a.x-b.x)*sin + (a.z-b.z)*cos);
      lastAngle = angle;
    }
    outline(-4, '#b58d74');
    outline(0, '#edddc8');
    drawTerrain(width,tall);

    const multiplier = Number(controls.height.value) / 100;
    drawShadows(width, tall, multiplier);
    visible.length = 0;
    let lastColor;
    const occlusion = overlays.showGeography ? makeTowerOcclusion(width) : null;
    const minHeight = minimumOcclusionHeight(cells.peakHeight * multiplier);
    for (const i of order) {
      const dx = cells.x[i] - centerX;
      const dz = cells.z[i] - centerZ;
      const x = width / 2 + (dx*cos - dz*sin) * scale;
      if (x < -30 || x > width + 30) continue;
      const base = overlays.showElevation ? groundLevels[i] : 0;
      const y = tall / 2 + ((dx*sin + dz*cos) * tiltSin - base*tiltCos) * scale;
      const towerHeight = cells.elevation[i] * multiplier;
      const top = y - towerHeight * tiltCos * scale;
      if (y < -20 || top > tall + 20) continue;
      const radius = Math.max(.43, cells.radius[i] * scale * .94);
      context.globalAlpha = overlays.showElevation && cells.density[i] < 1000 ? .45 : 1;
      if (lastColor !== tops[i]) context.fillStyle = lastColor = tops[i];
      if (y - top > .8) {
        const sourceHeight = colorStrip.height * cells.colorFraction[i];
        if (sourceHeight > 0) {
          context.drawImage(colorStrip,0,colorStrip.height-sourceHeight,1,sourceHeight,
                            x-radius,top,radius*2,y-top);
        } else {
          context.fillRect(x-radius,top,radius*2,y-top);
        }
      }
      const capHeight = Math.max(.85, 2 * radius * tiltSin);
      if (radius < 1.6) {
        context.fillRect(x-radius, top-capHeight/2, radius*2, capHeight);
      } else {
        context.beginPath();
        for (let j = 0; j < 6; j++) {
          const a = cells.angle[i] - angle + j*Math.PI/3;
          const vx = x + Math.cos(a)*radius;
          const vy = top - Math.sin(a)*capHeight/2;
          if (j) context.lineTo(vx, vy);
          else context.moveTo(vx, vy);
        }
        context.closePath();
        context.fill();
      }
      screenX[i] = x;
      screenBase[i] = y;
      screenTop[i] = top;
      radii[i] = radius;
      visible.push(i);
      if (occlusion && towerHeight >= minHeight) {
        const depth = (dx*sin+dz*cos)*tiltCos + base*tiltSin;
        occlusion.add(x,y,top,radius,depth,depth+towerHeight*tiltSin,capHeight/2);
      }
    }
    context.globalAlpha = 1;
    const surfaceAt = (x,z) => overlays.showElevation ? groundHeight(terrain,x,z) : 0;
    if (occlusion) overlays.render((x,z) => {
      const y = surfaceAt(x,z)+.08;
      const [px,py] = project(x,z,y);
      const depth = ((x-centerX)*sin+(z-centerZ)*cos)*tiltCos+y*tiltSin;
      return [px,py,depth];
    },occlusion.hides);
    for (const place of meta.places) {
      const [x, y] = project(place.x, place.z, surfaceAt(place.x,place.z) + (place.peak + 2) * multiplier);
      place.label.hidden = x < 28 || x > width - 28 || y < 22 || y > tall - 25 ||
        (width < 530 && !selected && ['Rochester','Syracuse','Albany'].includes(place.name));
      place.label.style.left = `${x}px`;
      place.label.style.top = `${y}px`;
    }
  }

  function queue() {
    controls.tip.hidden = true;
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function choose(place) {
    selected = place;
    centerX = place?.x ?? -8;
    centerZ = place?.z ?? 1;
    zoom = place ? Math.min(40, stage.clientWidth / (measure() * place.distance)) : 1;
    if (place && !flat) centerZ -= 15;
    for (const item of meta.places) item.button.setAttribute('aria-pressed', String(item === place));
    queue();
  }

  function switchView(topDown) {
    flat = topDown;
    angle = flat ? 0 : .10;
    incline = .67;
    controls.relief.setAttribute('aria-pressed', String(!flat));
    controls.flat.setAttribute('aria-pressed', String(flat));
    controls.hint.textContent = flat ? 'Drag to pan · Scroll to zoom' : 'Drag to rotate · Scroll to zoom · Right-drag to pan';
    choose(selected);
  }

  function pick(x,y) {
    for (let j = visible.length-1; j >= 0; j--) {
      const i = visible[j];
      if (Math.abs(x-screenX[i]) > Math.max(1.5,radii[i]) ||
          y < screenTop[i]-Math.max(1.5,radii[i]) || y > screenBase[i]+Math.max(1.5,radii[i])) continue;
      const title = document.createElement('strong');
      title.textContent = `${fmt.format(cells.population[i])} estimated residents`;
      controls.tip.replaceChildren(title, `${fmt.format(Math.round(cells.density[i]))} people / sq. mi.`);
      controls.tip.hidden = false;
      controls.tip.style.left = `${Math.max(4,Math.min(x+12,canvas.clientWidth-controls.tip.offsetWidth-6))}px`;
      controls.tip.style.top = `${Math.max(4,Math.min(y+12,canvas.clientHeight-controls.tip.offsetHeight-6))}px`;
      return;
    }
    controls.tip.hidden = true;
  }

  function pan(dx,dy) {
    const sx = dx / scale;
    const sz = dy / (scale * tiltSin);
    centerX -= sx*cos + sz*sin;
    centerZ -= -sx*sin + sz*cos;
  }

  let drag;
  canvas.addEventListener('pointerdown', e => {
    if (drag) return;
    canvas.setPointerCapture(e.pointerId);
    drag = {id:e.pointerId, x:e.offsetX, y:e.offsetY, distance:0, pan:flat || e.button === 2 || e.shiftKey};
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) {
      if (e.pointerType === 'mouse') pick(e.offsetX,e.offsetY);
      return;
    }
    if (drag.id !== e.pointerId) return;
    const dx = e.offsetX-drag.x;
    const dy = e.offsetY-drag.y;
    drag.distance += Math.hypot(dx,dy);
    drag.x = e.offsetX;
    drag.y = e.offsetY;
    if (drag.pan) pan(dx,dy);
    else {
      angle -= dx*.007;
      incline = Math.max(.19,Math.min(Math.PI/2-.001,incline-dy*.004));
    }
    queue();
  });
  canvas.addEventListener('pointerup', e => {
    if (drag?.id !== e.pointerId) return;
    if (drag.distance < 4 && e.button === 0) pick(e.offsetX,e.offsetY);
    drag = null;
  });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('pointerleave', () => { if (!drag) controls.tip.hidden = true; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  function changeZoom(factor) {
    zoom = Math.max(.7,Math.min(45,zoom*factor));
    queue();
  }
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    changeZoom(Math.exp(Math.max(-100,Math.min(100,-e.deltaY))*.004));
  }, {passive:false});
  canvas.addEventListener('keydown', e => {
    const movement = {ArrowLeft:[35,0],ArrowRight:[-35,0],ArrowUp:[0,35],ArrowDown:[0,-35]}[e.key];
    if (movement) { pan(...movement); queue(); }
    else if (e.key === '+' || e.key === '=') changeZoom(1.25);
    else if (e.key === '-') changeZoom(.8);
    else return;
    e.preventDefault();
  });

  controls.relief.onclick = () => switchView(false);
  controls.flat.onclick = () => switchView(true);
  controls.reset.onclick = () => {
    selected = null;
    controls.height.value = controls.height.max;
    controls.height.setAttribute('aria-valuetext',`${controls.height.value}%`);
    switchView(false);
  };
  controls.height.oninput = () => {
    controls.height.setAttribute('aria-valuetext',`${controls.height.value}%`);
    queue();
  };
  [controls.relief,controls.flat,controls.reset,controls.height].forEach(control => { control.disabled = false; });
  new ResizeObserver(queue).observe(stage);
  function updateCells(grid) {
    cells = grid;
    tops = Array.from(cells.colorFraction,populationColor);
    groundLevels = cells.x.map((x,i) => groundHeight(terrain,x,cells.z[i]));
    order = Array.from({length: cells.count}, (_, i) => i);
    lastAngle = undefined;
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
    visible.length = 0;
    queue();
  }
  document.querySelector('#status').hidden = true;
  stage.dataset.ready = 'canvas';
  return updateCells;
}
