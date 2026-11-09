// Compare geography and tower silhouettes in screen space. Larger depth is closer.
export function makeTowerOcclusion(width) {
  const binWidth = 12;
  const bins = Array.from({length:Math.ceil(width/binWidth)+1},()=>[]);
  return {
    add(x,base,top,radius,baseDepth,topDepth,capRadius) {
      if (base-top < 1.5 && radius < 2) return;
      const first = Math.max(0,Math.floor((x-radius)/binWidth));
      const last = Math.min(bins.length-1,Math.floor((x+radius)/binWidth));
      const tower = {x,base,top,radius,baseDepth,topDepth,capRadius};
      for (let i=first;i<=last;i++) bins[i].push(tower);
    },
    hides(x,y,depth) {
      const bucket = bins[Math.floor(x/binWidth)];
      if (!bucket) return false;
      for (const t of bucket) {
        if (Math.abs(x-t.x)>t.radius || y<t.top-t.capRadius || y>t.base+t.capRadius) continue;
        const fraction = t.base-t.top < .01 ? 1 : Math.max(0,Math.min(1,(t.base-y)/(t.base-t.top)));
        if (t.baseDepth+(t.topDepth-t.baseDepth)*fraction > depth+1e-6) return true;
      }
      return false;
    },
  };
}
