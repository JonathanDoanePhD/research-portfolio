export const terrainExaggeration = 14;
const kmPerMeter = terrainExaggeration / 1000;

export async function loadTerrain(terrain) {
  const image = new Image();
  image.src = 'data/elevation.webp';
  const response = await fetch('data/elevation-grid.bin');
  if (!response.ok) throw new Error(`Could not load elevations (HTTP ${response.status}).`);
  const buffer = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const data = new DataView(buffer);
  const cols = data.getUint16(0,true);
  const rows = data.getUint16(2,true);
  if (cols < 2 || rows < 2 || data.byteLength !== 4 + cols*rows*2) throw new Error('Invalid elevation grid.');
  const heights = new Float32Array(cols*rows);
  for (let i=0;i<heights.length;i++) heights[i] = data.getUint16(4+i*2,true) * kmPerMeter;
  await image.decode();
  return {...terrain,image,cols,rows,heights};
}

export function groundHeight(terrain,x,z) {
  if (!terrain) return 0;
  const {left,top,width,height,cols,rows,heights} = terrain;
  const u = (x-left)*(cols-1)/width;
  const v = (z-top)*(rows-1)/height;
  if (u<0 || v<0 || u>cols-1 || v>rows-1) return 0;
  const i = Math.min(Math.floor(u),cols-2);
  const j = Math.min(Math.floor(v),rows-2);
  const dx = u-i;
  const dz = v-j;
  const nw = j*cols+i;
  const ne = nw+1;
  const sw = nw+cols;
  const se = sw+1;
  if (dx+dz <= 1) return heights[nw]*(1-dx-dz) + heights[ne]*dx + heights[sw]*dz;
  return heights[se]*(dx+dz-1) + heights[sw]*(1-dx) + heights[ne]*(1-dz);
}
