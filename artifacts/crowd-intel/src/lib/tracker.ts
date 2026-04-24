export type BBox = [number, number, number, number]; // x,y,w,h

export type Track = {
  id: number;
  bbox: BBox;
  cx: number;
  cy: number;
  prevCx: number;
  prevCy: number;
  vx: number;
  vy: number;
  speed: number;
  aspect: number;
  ageFrames: number;
  missedFrames: number;
};

let nextId = 1;

function dist(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export class CentroidTracker {
  tracks: Track[] = [];
  maxMissed = 6;
  matchRadius = 120;
  enteredTotal = 0;
  leftTotal = 0;

  update(bboxes: BBox[]): Track[] {
    const used = new Set<number>();
    // For each existing track, find the closest unmatched bbox
    for (const t of this.tracks) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < bboxes.length; i++) {
        if (used.has(i)) continue;
        const [x, y, w, h] = bboxes[i];
        const cx = x + w / 2;
        const cy = y + h / 2;
        const d = dist(cx, cy, t.cx, t.cy);
        if (d < bestD && d < this.matchRadius) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) {
        used.add(best);
        const [x, y, w, h] = bboxes[best];
        const cx = x + w / 2;
        const cy = y + h / 2;
        t.prevCx = t.cx;
        t.prevCy = t.cy;
        t.cx = cx;
        t.cy = cy;
        t.vx = cx - t.prevCx;
        t.vy = cy - t.prevCy;
        t.speed = Math.sqrt(t.vx * t.vx + t.vy * t.vy);
        t.bbox = [x, y, w, h];
        t.aspect = w / Math.max(1, h);
        t.ageFrames++;
        t.missedFrames = 0;
      } else {
        t.missedFrames++;
      }
    }
    // New tracks for unmatched bboxes
    for (let i = 0; i < bboxes.length; i++) {
      if (used.has(i)) continue;
      const [x, y, w, h] = bboxes[i];
      const cx = x + w / 2;
      const cy = y + h / 2;
      this.tracks.push({
        id: nextId++,
        bbox: [x, y, w, h],
        cx,
        cy,
        prevCx: cx,
        prevCy: cy,
        vx: 0,
        vy: 0,
        speed: 0,
        aspect: w / Math.max(1, h),
        ageFrames: 1,
        missedFrames: 0,
      });
      this.enteredTotal++;
    }
    // Drop old
    const before = this.tracks.length;
    this.tracks = this.tracks.filter((t) => t.missedFrames <= this.maxMissed);
    this.leftTotal += before - this.tracks.length;
    return this.tracks.filter((t) => t.missedFrames === 0);
  }

  reset() {
    this.tracks = [];
    this.enteredTotal = 0;
    this.leftTotal = 0;
  }
}

export function flowDirection(tracks: Track[]): {
  vx: number;
  vy: number;
  magnitude: number;
  angleDeg: number;
  label: string;
} {
  // Average velocity of tracks moving above a small threshold
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const t of tracks) {
    if (t.ageFrames < 2) continue;
    if (t.speed < 0.8) continue;
    sx += t.vx;
    sy += t.vy;
    n++;
  }
  if (n === 0) {
    return { vx: 0, vy: 0, magnitude: 0, angleDeg: 0, label: "STATIC" };
  }
  const vx = sx / n;
  const vy = sy / n;
  const magnitude = Math.sqrt(vx * vx + vy * vy);
  const angleDeg = (Math.atan2(vy, vx) * 180) / Math.PI; // 0 = right, 90 = down
  // Cardinal direction (image coords: y grows downward)
  let label = "STATIC";
  if (magnitude >= 1.0) {
    const a = ((angleDeg + 360) % 360);
    if (a < 22.5 || a >= 337.5) label = "EAST";
    else if (a < 67.5) label = "SOUTH-EAST";
    else if (a < 112.5) label = "SOUTH";
    else if (a < 157.5) label = "SOUTH-WEST";
    else if (a < 202.5) label = "WEST";
    else if (a < 247.5) label = "NORTH-WEST";
    else if (a < 292.5) label = "NORTH";
    else label = "NORTH-EAST";
  }
  return { vx, vy, magnitude, angleDeg, label };
}
