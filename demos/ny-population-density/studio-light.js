// Fixed point in view coordinates relative to the viewport center.
export const studio = {x:-610,y:1180,z:470};

export function flatLightPosition(centerX,centerZ,cos,sin,tiltSin,tiltCos) {
  const toward = studio.z*tiltCos-studio.y*tiltSin;
  return [centerX + studio.x*cos+toward*sin,
          studio.y*tiltCos+studio.z*tiltSin,
          centerZ - studio.x*sin+toward*cos];
}

export function visibleGroundBounds(corners, height) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  // Corners are indexed by x, y and z bits. Visit each frustum edge once.
  for (const [i,a] of corners.entries()) {
    for (const bit of [1,2,4]) {
      if (i & bit) continue;
      const b = corners[i | bit];
      if (height < Math.min(a.y,b.y) || height > Math.max(a.y,b.y)) continue;
      const t = a.y === b.y ? 0 : (height-a.y)/(b.y-a.y);
      const x = a.x+(b.x-a.x)*t;
      const z = a.z+(b.z-a.z)*t;
      left = Math.min(left,x);
      right = Math.max(right,x);
      top = Math.min(top,z);
      bottom = Math.max(bottom,z);
    }
  }
  return Number.isFinite(left) ? {left,right,top,bottom} : null;
}

export function shadowReach(height, lightHeight, run, limit) {
  // At or above the light the shadow is unbounded, so draw through the viewport.
  const factor = height < lightHeight ? height/(lightHeight-height) : Infinity;
  return Math.min(factor,limit/run);
}
