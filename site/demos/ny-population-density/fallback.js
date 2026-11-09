const fmt = new Intl.NumberFormat('en-US');

export function startCanvasMap({meta, cells, palette, colorBand}) {
  const stage = document.querySelector('#stage');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'New York population density map. Arrow keys pan. Plus and minus zoom.');
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
  const tops = palette.map(value => '#' + value.toString(16).padStart(6, '0'));
  const sides = ['#cd9b75', '#d47842', '#b34621', '#348dbd', '#0d3b60'];
  const bands = Uint8Array.from(cells.density, colorBand);
  const order = Array.from({length:meta.count}, (_, i) => i);
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

  for (const place of meta.places) {
    place.peak = 0;
    for (let i = 0; i < meta.count; i++) {
      const dx = cells.x[i] - place.x;
      const dz = cells.z[i] - place.z;
      if (dx * dx + dz * dz < 64) place.peak = Math.max(place.peak, cells.elevation[i]);
    }
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
      lastAngle = angle;
    }
    outline(-4, '#b58d74');
    outline(0, '#edddc8');

    const multiplier = Number(controls.height.value) / 100;
    visible.length = 0;
    let lastColor;
    for (const i of order) {
      const dx = cells.x[i] - centerX;
      const dz = cells.z[i] - centerZ;
      const x = width / 2 + (dx*cos - dz*sin) * scale;
      if (x < -30 || x > width + 30) continue;
      const y = tall / 2 + (dx*sin + dz*cos) * tiltSin * scale;
      const top = y - cells.elevation[i] * multiplier * tiltCos * scale;
      if (y < -20 || top > tall + 20) continue;
      const radius = Math.max(.43, cells.radius[i] * scale * .94);
      const band = bands[i];
      if (y - top > .8) {
        if (lastColor !== sides[band]) context.fillStyle = lastColor = sides[band];
        context.fillRect(x-radius, top, radius*2, y-top);
      }
      if (lastColor !== tops[band]) context.fillStyle = lastColor = tops[band];
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
    }
    for (const place of meta.places) {
      const [x, y] = project(place.x, place.z, (place.peak + 2) * multiplier);
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
      title.textContent = `${fmt.format(Math.round(cells.density[i]))} people / sq. mi.`;
      controls.tip.replaceChildren(title, `${fmt.format(cells.population[i])} estimated residents`);
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
      incline = Math.max(.30,Math.min(1.35,incline-dy*.004));
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
    controls.height.value = 100;
    controls.height.setAttribute('aria-valuetext','100%');
    switchView(false);
  };
  controls.height.oninput = () => {
    controls.height.setAttribute('aria-valuetext',`${controls.height.value}%`);
    queue();
  };
  [controls.relief,controls.flat,controls.reset,controls.height].forEach(control => { control.disabled = false; });
  new ResizeObserver(queue).observe(stage);
  draw();
  document.querySelector('#status').hidden = true;
  stage.dataset.ready = 'canvas';
}
