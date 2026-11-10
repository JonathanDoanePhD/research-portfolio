export function scaleTowerHeights(cells, level, mode) {
  const ceiling = 250 + 50*level;
  for (let i=0;i<cells.count;i++) {
    const share = cells.population[i]/cells.largest;
    cells.elevation[i] = ceiling*(mode === 'linear' ? share : Math.sqrt(share));
  }
  cells.peakHeight = ceiling;
}

export function heightMultiplier(control, viewportHeight, reliefPixelsPerUnit) {
  // Leave room for the map on short screens and keep city zooms in world units.
  const fit = Math.min(1,.72*viewportHeight/400);
  return Number(control.value)/Number(control.defaultValue)*fit/reliefPixelsPerUnit;
}
