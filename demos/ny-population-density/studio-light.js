// Fixed point in view coordinates relative to the viewport center.
export const studio = {x:-330,y:120,z:600};

export function flatLightPosition(centerX,centerZ,cos,sin,tiltSin,tiltCos) {
  const toward = studio.z*tiltCos-studio.y*tiltSin;
  return [centerX + studio.x*cos+toward*sin,
          studio.y*tiltCos+studio.z*tiltSin,
          centerZ - studio.x*sin+toward*cos];
}

export function groundShadow(x,z,height,lightX,lightY,lightZ) {
  const factor = height / Math.max(1,lightY-height);
  return [x+(x-lightX)*factor,z+(z-lightZ)*factor];
}
