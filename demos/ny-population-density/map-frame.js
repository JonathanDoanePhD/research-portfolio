// The Albers grid is rotated relative to true north near central New York.
const northUpAngle = .216;

export function topDownFrame(outline) {
  const cos = Math.cos(northUpAngle);
  const sin = Math.sin(northUpAngle);
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const [outer] of outline) {
    for (const [x,y] of outer) {
      const across = x*cos+y*sin;
      const down = x*sin-y*cos;
      left = Math.min(left,across);
      right = Math.max(right,across);
      top = Math.min(top,down);
      bottom = Math.max(bottom,down);
    }
  }
  const across = (left+right)/2;
  const down = (top+bottom)/2;
  return {
    angle: northUpAngle,
    x: across*cos+down*sin,
    z: -across*sin+down*cos,
    width: (right-left)*1.16,
    depth: (bottom-top)*1.16,
  };
}
