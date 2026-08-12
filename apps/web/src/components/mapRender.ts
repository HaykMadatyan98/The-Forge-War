import { MAP_H, MAP_W } from '@tfw/game';
import { warriorImageSrc } from './artCatalog';
import { getArtImage } from './artCache';

/** Soft 3D isometric board projection */
export type IsoProj = {
  tw: number;
  th: number;
  elev: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
  cell: number;
};

export function makeIsoProj(viewW: number, viewH: number): IsoProj {
  const pad = 18;
  // Fit board into parent while keeping tile aspect ~ 2:1
  const maxCell = 48;
  let cell = maxCell;
  for (let c = maxCell; c >= 16; c--) {
    const tw = c;
    const th = Math.max(12, Math.floor(c * 0.52));
    const elev = Math.max(5, Math.floor(c * 0.26));
    const w = Math.ceil((MAP_W + MAP_H) * (tw / 2) + pad * 2);
    const h = Math.ceil((MAP_W + MAP_H) * (th / 2) + elev * 3 + pad * 2 + c * 0.4);
    if (w <= viewW && h <= viewH) {
      cell = c;
      break;
    }
    cell = c;
  }
  const tw = cell;
  const th = Math.max(12, Math.floor(cell * 0.52));
  const elev = Math.max(5, Math.floor(cell * 0.26));
  const w = Math.ceil((MAP_W + MAP_H) * (tw / 2) + pad * 2);
  const h = Math.ceil((MAP_W + MAP_H) * (th / 2) + elev * 3 + pad * 2 + cell * 0.4);
  const ox = pad + MAP_H * (tw / 2);
  const oy = pad + elev * 2;
  return { tw, th, elev, ox, oy, w, h, cell };
}

export function makeDeployIso(cell = 28): IsoProj {
  const pad = 12;
  const tw = cell;
  const th = Math.max(12, Math.floor(cell * 0.52));
  const elev = Math.max(5, Math.floor(cell * 0.26));
  const w = Math.ceil((MAP_W + MAP_H) * (tw / 2) + pad * 2);
  const h = Math.ceil((MAP_W + MAP_H) * (th / 2) + elev * 3 + pad * 2 + cell * 0.35);
  const ox = pad + MAP_H * (tw / 2);
  const oy = pad + elev * 2;
  return { tw, th, elev, ox, oy, w, h, cell };
}

export function tileToScreen(p: IsoProj, gx: number, gy: number, gz = 0) {
  return {
    x: (gx - gy) * (p.tw / 2) + p.ox,
    y: (gx + gy) * (p.th / 2) + p.oy - gz * p.elev,
  };
}

/** Map CSS-displayed canvas pointer → canvas pixel coords (object-fit: contain). */
export function canvasPointer(e: { clientX: number; clientY: number }, canvas: HTMLCanvasElement) {
  const r = canvas.getBoundingClientRect();
  const scale = Math.min(r.width / canvas.width, r.height / canvas.height);
  const dispW = canvas.width * scale;
  const dispH = canvas.height * scale;
  const offX = (r.width - dispW) / 2;
  const offY = (r.height - dispH) / 2;
  return {
    sx: (e.clientX - r.left - offX) / scale,
    sy: (e.clientY - r.top - offY) / scale,
  };
}

/** Map screen coords (canvas space) → map tile, ignoring height extrusion. */
export function screenToTile(p: IsoProj, sx: number, sy: number): { x: number; y: number } | null {
  const lx = sx - p.ox;
  const ly = sy - p.oy;
  const a = (2 * lx) / p.tw;
  const b = (2 * ly) / p.th;
  const gx = (a + b) / 2;
  const gy = (b - a) / 2;
  const x = Math.floor(gx);
  const y = Math.floor(gy);
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
  return { x, y };
}

function hash2(a: number, b: number) {
  let h = a * 374761393 + b * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
}

function shadeHex(hex: string, amount: number) {
  const n = hex.replace('#', '');
  const num = parseInt(n.length === 3 ? n.split('').map((c) => c + c).join('') : n, 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  r = Math.max(0, Math.min(255, Math.round(r * (1 + amount))));
  g = Math.max(0, Math.min(255, Math.round(g * (1 + amount))));
  b = Math.max(0, Math.min(255, Math.round(b * (1 + amount))));
  return `rgb(${r},${g},${b})`;
}

function parseRgb(col: string): [number, number, number] {
  if (col.startsWith('#')) {
    const n = col.slice(1);
    const full = n.length === 3 ? n.split('').map((c) => c + c).join('') : n;
    const num = parseInt(full, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  const m = col.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) return [+m[1], +m[2], +m[3]];
  return [100, 120, 70];
}

function mixColor(a: string, b: string, t: number) {
  const [ar, ag, ab] = parseRgb(a);
  const [br, bg, bb] = parseRgb(b);
  const u = 1 - t;
  return `rgb(${Math.round(ar * u + br * t)},${Math.round(ag * u + bg * t)},${Math.round(ab * u + bb * t)})`;
}

const BASE: Record<string, [string, string]> = {
  grass: ['#6ea050', '#4f7a38'],
  dry_grass: ['#b4a85a', '#8a8240'],
  dirt: ['#c49a60', '#8e6a3c'],
  dirt_edge: ['#b89058', '#7a6038'],
  water: ['#3d7a96', '#1e4a64'],
  ford: ['#7aaca0', '#5a8880'],
  tree: ['#5f9442', '#3a6a2e'],
  bush: ['#608a48', '#446834'],
  rock: ['#948e86', '#686460'],
  cliff: ['#a09478', '#6e5e48'],
  camp: ['#7aaa58', '#548040'],
  moss: ['#4f8848', '#346034'],
  thicket: ['#4a703e', '#304e2a'],
};

function kindColor(kind: string): string {
  return (BASE[kind] || BASE.grass)[0];
}

function tileH(mapCell: any) {
  return mapCell?.height || (mapCell?.kind === 'cliff' ? 1 : 0);
}

function diamondPath(
  ctx: CanvasRenderingContext2D,
  p: IsoProj,
  x: number,
  y: number,
  h: number,
) {
  const n = tileToScreen(p, x, y, h);
  const e = tileToScreen(p, x + 1, y, h);
  const s = tileToScreen(p, x + 1, y + 1, h);
  const w = tileToScreen(p, x, y + 1, h);
  ctx.beginPath();
  ctx.moveTo(n.x, n.y);
  ctx.lineTo(e.x, e.y);
  ctx.lineTo(s.x, s.y);
  ctx.lineTo(w.x, w.y);
  ctx.closePath();
  return { n, e, s, w };
}

function blendedTop(map: any[][], x: number, y: number) {
  const self = map[y][x];
  const kind = self.kind || 'grass';
  let col = kindColor(kind);
  // Soft neighbor blend so kinds don't cut like stamps
  const nbrs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
  ];
  for (const [dx, dy] of nbrs) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
    const nk = map[ny][nx].kind || 'grass';
    if (nk === kind) continue;
    col = mixColor(col, kindColor(nk), 0.16);
  }
  const sc = self.scatter ?? hash2(x, y) % 1000;
  const tint = ((sc % 11) - 5) / 90;
  return shadeHex(col.startsWith('#') ? col : rgbToHex(col), tint);
}

function rgbToHex(rgb: string) {
  const [r, g, b] = parseRgb(rgb);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function drawTileCube(
  ctx: CanvasRenderingContext2D,
  p: IsoProj,
  map: any[][],
  x: number,
  y: number,
) {
  const cell = map[y][x];
  const h = tileH(cell);
  const top = blendedTop(map, x, y);
  const kind = cell.kind || 'grass';

  // Side faces for height / soft tabletop thickness
  const lift = Math.max(h, kind === 'water' ? 0 : 0.18);
  if (lift > 0.05) {
    const topC = diamondPath as any;
    // left (SW) face
    const n0 = tileToScreen(p, x, y + 1, lift);
    const s0 = tileToScreen(p, x + 1, y + 1, lift);
    const s1 = tileToScreen(p, x + 1, y + 1, 0);
    const n1 = tileToScreen(p, x, y + 1, 0);
    ctx.beginPath();
    ctx.moveTo(n0.x, n0.y);
    ctx.lineTo(s0.x, s0.y);
    ctx.lineTo(s1.x, s1.y);
    ctx.lineTo(n1.x, n1.y);
    ctx.closePath();
    ctx.fillStyle = shadeHex(rgbToHex(top), -0.28);
    ctx.fill();

    // right (SE) face
    const e0 = tileToScreen(p, x + 1, y, lift);
    const se0 = tileToScreen(p, x + 1, y + 1, lift);
    const se1 = tileToScreen(p, x + 1, y + 1, 0);
    const e1 = tileToScreen(p, x + 1, y, 0);
    ctx.beginPath();
    ctx.moveTo(e0.x, e0.y);
    ctx.lineTo(se0.x, se0.y);
    ctx.lineTo(se1.x, se1.y);
    ctx.lineTo(e1.x, e1.y);
    ctx.closePath();
    ctx.fillStyle = shadeHex(rgbToHex(top), -0.38);
    ctx.fill();
    void topC;
  }

  // Top face with soft gradient (not flat stamp)
  const pts = diamondPath(ctx, p, x, y, lift);
  const g = ctx.createLinearGradient(pts.n.x, pts.n.y, pts.s.x, pts.s.y);
  if (kind === 'water') {
    g.addColorStop(0, '#2a5570');
    g.addColorStop(0.45, '#4a8aaa');
    g.addColorStop(1, '#1e4860');
  } else if (kind === 'ford') {
    g.addColorStop(0, '#8eb8a0');
    g.addColorStop(0.5, '#5a8890');
    g.addColorStop(1, '#c0a878');
  } else {
    g.addColorStop(0, shadeHex(rgbToHex(top), 0.12));
    g.addColorStop(0.55, top);
    g.addColorStop(1, shadeHex(rgbToHex(top), -0.08));
  }
  ctx.fillStyle = g;
  ctx.fill();

  // Soft edge only when height/obstacle differs from neighbor (avoid harsh full grid)
  ctx.lineWidth = 1;
  const edge = (nx: number, ny: number, a: { x: number; y: number }, b: { x: number; y: number }) => {
    if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) {
      ctx.strokeStyle = 'rgba(20,18,12,0.22)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      return;
    }
    const nh = tileH(map[ny][nx]);
    const nk = map[ny][nx].kind;
    if (nh !== h || (map[ny][nx].block !== cell.block && (cell.block || map[ny][nx].block))) {
      ctx.strokeStyle = 'rgba(18,16,12,0.28)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else if (nk !== kind) {
      ctx.strokeStyle = 'rgba(20,22,16,0.1)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  };
  edge(x, y - 1, pts.n, pts.e); // N
  edge(x + 1, y, pts.e, pts.s); // E
  edge(x, y + 1, pts.s, pts.w); // S
  edge(x - 1, y, pts.w, pts.n); // W

  // Surface detail (light texture, not pixels of tiles)
  if (kind === 'grass' || kind === 'dry_grass' || kind === 'camp' || kind === 'tree' || kind === 'bush') {
    const cx = (pts.n.x + pts.s.x) / 2;
    const cy = (pts.n.y + pts.s.y) / 2;
    ctx.fillStyle = kind === 'dry_grass' ? 'rgba(200,180,90,0.12)' : 'rgba(30,55,22,0.12)';
    for (let i = 0; i < 5; i++) {
      const hx = hash2(x * 31 + y, i + (cell.scatter || 0));
      const ox = ((hx % 100) / 100 - 0.5) * p.tw * 0.35;
      const oy = (((hx >> 8) % 100) / 100 - 0.5) * p.th * 0.4;
      ctx.beginPath();
      ctx.ellipse(cx + ox, cy + oy, 1.2, 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (kind === 'water' || kind === 'ford') {
    ctx.strokeStyle = 'rgba(230,245,250,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pts.w.x + 2, (pts.w.y + pts.n.y) / 2);
    ctx.quadraticCurveTo((pts.n.x + pts.s.x) / 2, pts.n.y + 2, pts.e.x - 2, (pts.e.y + pts.s.y) / 2);
    ctx.stroke();
  }
}

function drawProps(ctx: CanvasRenderingContext2D, p: IsoProj, map: any[][], x: number, y: number) {
  const cell = map[y][x];
  const kind = cell.kind || '';
  const h = Math.max(tileH(cell), 0.18);
  const c = tileToScreen(p, x + 0.5, y + 0.5, h);
  const sc = cell.scatter ?? hash2(x, y) % 1000;
  const s = p.cell;

  if (kind === 'tree') {
    ctx.fillStyle = 'rgba(10,14,8,0.28)';
    ctx.beginPath();
    ctx.ellipse(c.x + 2, c.y + s * 0.12, s * 0.22, s * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    const canopy: [number, number, number, string][] = [
      [0, -0.08, 0.28, '#4f8a3a'],
      [-0.1, 0.02, 0.18, '#3a6a2c'],
      [0.1, 0, 0.16, '#5a9a40'],
      [0, 0.06, 0.14, '#2e5824'],
    ];
    for (const [ox, oy, r, col] of canopy) {
      const g = ctx.createRadialGradient(c.x + ox * s, c.y + oy * s - 2, 1, c.x + ox * s, c.y + oy * s, r * s);
      g.addColorStop(0, shadeHex(col, 0.2));
      g.addColorStop(1, shadeHex(col, -0.25));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x + ox * s, c.y + oy * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'bush' || kind === 'thicket' || kind === 'moss') {
    const dense = kind === 'thicket';
    ctx.fillStyle = dense ? 'rgba(40,80,30,0.55)' : 'rgba(60,110,50,0.45)';
    for (let i = 0; i < (dense ? 4 : 3); i++) {
      const hx = hash2(sc, i + 4);
      const ox = ((hx % 100) / 100 - 0.5) * s * 0.28;
      const oy = (((hx >> 6) % 100) / 100 - 0.5) * s * 0.16;
      ctx.beginPath();
      ctx.ellipse(c.x + ox, c.y + oy, dense ? 5 : 4, dense ? 3.2 : 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'rock' || kind === 'cliff') {
    ctx.fillStyle = 'rgba(12,12,10,0.3)';
    ctx.beginPath();
    ctx.ellipse(c.x + 1, c.y + s * 0.08, s * 0.18, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createLinearGradient(c.x - 8, c.y - 6, c.x + 8, c.y + 6);
    g.addColorStop(0, '#c0bcb4');
    g.addColorStop(1, '#5a5850');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(c.x - s * 0.16, c.y + s * 0.04);
    ctx.lineTo(c.x - s * 0.04, c.y - s * 0.16);
    ctx.lineTo(c.x + s * 0.14, c.y - s * 0.12);
    ctx.lineTo(c.x + s * 0.16, c.y + s * 0.06);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'camp') {
    const flame = ctx.createRadialGradient(c.x, c.y - 2, 0.5, c.x, c.y, s * 0.12);
    flame.addColorStop(0, '#fff2a0');
    flame.addColorStop(0.45, '#ff8a30');
    flame.addColorStop(1, '#c0401000');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.arc(c.x, c.y - 1, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Soft highlight fill for reachable tiles (move / deploy / attack). */
export function drawTileOverlay(
  ctx: CanvasRenderingContext2D,
  p: IsoProj,
  x: number,
  y: number,
  fill: string,
  stroke: string,
  map?: any[][],
) {
  const h = map ? Math.max(tileH(map[y][x]), 0.18) : 0.18;
  diamondPath(ctx, p, x, y, h);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.8;
  ctx.stroke();
}

/** Outline whole reachable blob — clearer than tiny squares */
export function drawReachOutline(
  ctx: CanvasRenderingContext2D,
  p: IsoProj,
  keys: Set<string>,
  map: any[][],
  stroke = 'rgba(255, 210, 90, 0.95)',
) {
  if (!keys.size) return;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  for (const key of keys) {
    const [x, y] = key.split(',').map(Number);
    const h = Math.max(tileH(map[y][x]), 0.18);
    const pts = {
      n: tileToScreen(p, x, y, h),
      e: tileToScreen(p, x + 1, y, h),
      s: tileToScreen(p, x + 1, y + 1, h),
      w: tileToScreen(p, x, y + 1, h),
    };
    const edges: [string, { x: number; y: number }, { x: number; y: number }, number, number][] = [
      ['N', pts.n, pts.e, x, y - 1],
      ['E', pts.e, pts.s, x + 1, y],
      ['S', pts.s, pts.w, x, y + 1],
      ['W', pts.w, pts.n, x - 1, y],
    ];
    for (const [, a, b, nx, ny] of edges) {
      if (!keys.has(`${nx},${ny}`)) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }
}

export type MapDrawOpts = {
  map: any[][];
  visTiles?: Set<string> | null;
  reachSet?: Set<string>;
  attackSet?: Set<string>;
  deployZone?: boolean;
  hover?: { x: number; y: number } | null;
  activeTile?: { x: number; y: number } | null;
};

export function paintIsoBoard(ctx: CanvasRenderingContext2D, p: IsoProj, o: MapDrawOpts) {
  ctx.clearRect(0, 0, p.w, p.h);
  // atmosphere under board
  const bg = ctx.createRadialGradient(p.w * 0.5, p.h * 0.45, 20, p.w * 0.5, p.h * 0.5, p.w * 0.65);
  bg.addColorStop(0, '#1c2416');
  bg.addColorStop(1, '#0a0c08');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, p.w, p.h);

  // depth-sorted tiles
  for (let sum = 0; sum <= MAP_W + MAP_H; sum++) {
    for (let x = 0; x < MAP_W; x++) {
      const y = sum - x;
      if (y < 0 || y >= MAP_H) continue;
      drawTileCube(ctx, p, o.map, x, y);

      const key = `${x},${y}`;
      // fog for unseen tiles
      if (o.visTiles && !o.visTiles.has(key)) {
        const h = Math.max(tileH(o.map[y][x]), 0.18);
        diamondPath(ctx, p, x, y, h);
        ctx.fillStyle = 'rgba(6, 8, 6, 0.45)';
        ctx.fill();
      }
    }
  }

  // deploy zone (first 3 columns)
  if (o.deployZone) {
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < 3; x++) {
        drawTileOverlay(ctx, p, x, y, 'rgba(80, 160, 220, 0.22)', 'rgba(120, 190, 240, 0.55)', o.map);
      }
    }
    // outer rim
    const dz = new Set<string>();
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < 3; x++) dz.add(`${x},${y}`);
    drawReachOutline(ctx, p, dz, o.map, 'rgba(100, 190, 255, 0.9)');
  }

  // move reach — strong readable gold
  if (o.reachSet && o.reachSet.size) {
    for (const key of o.reachSet) {
      const [x, y] = key.split(',').map(Number);
      drawTileOverlay(ctx, p, x, y, 'rgba(240, 190, 60, 0.38)', 'rgba(255, 220, 100, 0.35)', o.map);
    }
    drawReachOutline(ctx, p, o.reachSet, o.map, 'rgba(255, 215, 90, 0.98)');
  }

  // props after ground overlays so trees sit "on" floor
  for (let sum = 0; sum <= MAP_W + MAP_H; sum++) {
    for (let x = 0; x < MAP_W; x++) {
      const y = sum - x;
      if (y < 0 || y >= MAP_H) continue;
      if (o.visTiles && !o.visTiles.has(`${x},${y}`)) continue;
      drawProps(ctx, p, o.map, x, y);
    }
  }

  // attack tiles on top of props (red pulse rings)
  if (o.attackSet && o.attackSet.size) {
    for (const key of o.attackSet) {
      const [x, y] = key.split(',').map(Number);
      drawTileOverlay(ctx, p, x, y, 'rgba(220, 70, 40, 0.28)', 'rgba(255, 100, 70, 0.95)', o.map);
    }
  }

  if (o.activeTile) {
    drawTileOverlay(
      ctx,
      p,
      o.activeTile.x,
      o.activeTile.y,
      'rgba(255, 230, 120, 0.12)',
      'rgba(255, 230, 120, 0.95)',
      o.map,
    );
  }

  if (o.hover) {
    drawTileOverlay(
      ctx,
      p,
      o.hover.x,
      o.hover.y,
      'rgba(255,255,255,0.08)',
      'rgba(255,255,255,0.85)',
      o.map,
    );
  }
}

export function unitScreenPos(
  p: IsoProj,
  map: any[][],
  gx: number,
  gy: number,
  bob = 0,
  lunge = 0,
  face = 1,
  hop = 0,
) {
  const h = Math.max(tileH(map[Math.round(gy)]?.[Math.round(gx)] || {}), 0.18);
  const c = tileToScreen(p, gx + 0.5, gy + 0.5, h);
  return {
    x: c.x + lunge * face * p.cell * 0.18,
    y: c.y - p.cell * 0.08 + Math.sin(bob) * 1.2 - hop * p.cell * 0.22,
  };
}

export type UnitDrawOpts = {
  team: string;
  color: string;
  weaponType?: string;
  dead?: boolean;
  boss?: boolean;
  active?: boolean;
  /** 0..1 hit flash */
  hitFlash?: number;
  /** Request re-draw when warrior art finishes loading */
  onArtReady?: () => void;
  visual?: {
    weaponType?: string;
    weaponMetal?: string;
    offhand?: string | null;
    helm?: string;
    body?: string;
    legs?: string;
    accessory?: boolean;
    seed?: number;
    team?: string;
  } | null;
};

const METAL_RGB: Record<string, string> = {
  copper: '#c07040',
  iron: '#9aa0a8',
  steel: '#c8d0d8',
  wood: '#8a5a2e',
  leather: '#8a5a36',
  gold: '#c8a040',
};

/** Footprint ellipse under a painted warrior. */
function drawUnitShadow(ctx: CanvasRenderingContext2D, cell: number, active: boolean, team: string, boss: boolean) {
  const rx = cell * 0.34;
  const ry = cell * 0.12;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, cell * 0.08, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = active ? 'rgba(255, 220, 120, 0.95)' : team === 'player' ? 'rgba(140, 190, 255, 0.55)' : 'rgba(255, 140, 110, 0.5)';
  ctx.lineWidth = active ? 2.4 : 1.4;
  ctx.beginPath();
  ctx.ellipse(0, cell * 0.08, rx * 1.05, ry * 1.15, 0, 0, Math.PI * 2);
  ctx.stroke();

  if (boss) {
    ctx.strokeStyle = 'rgba(240, 200, 80, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, cell * 0.08, rx * 1.22, ry * 1.35, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawPaintedWarrior(ctx: CanvasRenderingContext2D, cell: number, o: UnitDrawOpts, img: HTMLImageElement) {
  const v = o.visual || {};
  const h = cell * (o.boss ? 1.55 : 1.38);
  const w = h * 0.72;
  drawUnitShadow(ctx, cell, !!o.active, o.team, !!o.boss);

  ctx.save();
  // Anchor feet slightly above foot ring
  const drawY = -h + cell * 0.12;
  if (o.dead) {
    ctx.globalAlpha = 0.45;
    ctx.filter = 'grayscale(0.85) brightness(0.7)';
  } else if (o.team === 'enemy') {
    // Warm foe cast so player/enemy read at a glance without losing portrait detail
    ctx.filter = o.boss
      ? 'sepia(0.25) saturate(1.15) hue-rotate(-12deg) contrast(1.05)'
      : 'sepia(0.18) saturate(1.05) hue-rotate(-8deg)';
  }
  if (o.hitFlash && o.hitFlash > 0) {
    ctx.globalAlpha = 0.55 + Math.sin(o.hitFlash * 18) * 0.4;
  }
  ctx.drawImage(img, -w / 2, drawY, w, h);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;

  if (!o.dead && o.hitFlash && o.hitFlash > 0.15) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(255,80,40,${0.35 * o.hitFlash})`;
    ctx.fillRect(-w / 2, drawY, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }

  if (o.boss && !o.dead) {
    ctx.fillStyle = '#e0c050';
    ctx.beginPath();
    ctx.moveTo(0, drawY - cell * 0.06);
    ctx.lineTo(cell * 0.08, drawY + cell * 0.08);
    ctx.lineTo(-cell * 0.08, drawY + cell * 0.08);
    ctx.closePath();
    ctx.fill();
  }

  if (o.dead) {
    ctx.strokeStyle = 'rgba(40,20,16,0.75)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-w * 0.22, drawY + h * 0.25);
    ctx.lineTo(w * 0.22, drawY + h * 0.75);
    ctx.moveTo(w * 0.22, drawY + h * 0.25);
    ctx.lineTo(-w * 0.22, drawY + h * 0.75);
    ctx.stroke();
  }
  ctx.restore();
  void v;
}

/** Procedural sword-slash / impact spark near unit origin. */
export function drawMeleeSlash(
  ctx: CanvasRenderingContext2D,
  cell: number,
  progress: number,
  face: number,
  color = 'rgba(255,230,180,0.9)',
) {
  if (progress <= 0 || progress >= 1) return;
  const t = progress;
  ctx.save();
  ctx.globalAlpha = Math.sin(t * Math.PI) * 0.95;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, cell * 0.08);
  ctx.lineCap = 'round';
  const r = cell * (0.35 + t * 0.45);
  const a0 = face >= 0 ? -0.9 : Math.PI + 0.9;
  const a1 = a0 + face * (1.4 * t + 0.2);
  ctx.beginPath();
  ctx.arc(cell * 0.05 * face, -cell * 0.15, r, Math.min(a0, a1), Math.max(a0, a1));
  ctx.stroke();
  ctx.restore();
}

/** Flying projectile for bow / crossbow / thrown. */
export function drawProjectile(
  ctx: CanvasRenderingContext2D,
  cell: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  t: number,
  kind: string,
) {
  const u = Math.max(0, Math.min(1, t));
  const ease = u * u * (3 - 2 * u);
  const px = from.x + (to.x - from.x) * ease;
  const py = from.y + (to.y - from.y) * ease - Math.sin(u * Math.PI) * cell * 0.35;
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(ang);
  if (kind === 'crossbow' || kind === 'bow') {
    ctx.fillStyle = '#c8b090';
    ctx.strokeStyle = '#3a2a18';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-cell * 0.22, 0);
    ctx.lineTo(cell * 0.2, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cell * 0.2, 0);
    ctx.lineTo(cell * 0.1, -cell * 0.05);
    ctx.lineTo(cell * 0.1, cell * 0.05);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = '#b07040';
    ctx.beginPath();
    ctx.moveTo(-cell * 0.08, -cell * 0.04);
    ctx.lineTo(cell * 0.12, 0);
    ctx.lineTo(-cell * 0.08, cell * 0.04);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function drawUnitToken(ctx: CanvasRenderingContext2D, cell: number, o: UnitDrawOpts) {
  const v = o.visual || {};
  const wt = v.weaponType || o.weaponType || 'sword';
  const src = warriorImageSrc({
    seed: v.seed,
    weaponType: wt,
    body: v.body,
    helm: v.helm,
    offhand: v.offhand,
  });
  const img = getArtImage(src, o.onArtReady);
  if (img) {
    drawPaintedWarrior(ctx, cell, o, img);
    return;
  }

  // Fallback stick-figure while art loads
  const s = cell * 0.62;
  const bodyKind = v.body || 'cloth';
  const helmKind = v.helm || 'none';
  const metal = METAL_RGB[v.weaponMetal || 'iron'] || '#9aa0a8';
  const armor = bodyKind === 'iron' ? '#8a9098' : bodyKind === 'leather' ? '#8a5a36' : o.color;

  drawUnitShadow(ctx, cell, !!o.active, o.team, !!o.boss);

  ctx.fillStyle = v.legs === 'leather' ? '#6a4228' : shadeHex(armor, -0.15);
  ctx.fillRect(-s * 0.12, s * 0.08, s * 0.1, s * 0.22);
  ctx.fillRect(s * 0.02, s * 0.08, s * 0.1, s * 0.22);

  const tg = ctx.createLinearGradient(-s * 0.15, -s * 0.05, s * 0.15, s * 0.15);
  tg.addColorStop(0, shadeHex(armor, 0.15));
  tg.addColorStop(1, shadeHex(armor, -0.2));
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(-s * 0.16, -s * 0.02);
  ctx.lineTo(s * 0.16, -s * 0.02);
  ctx.lineTo(s * 0.14, s * 0.16);
  ctx.lineTo(-s * 0.14, s * 0.16);
  ctx.closePath();
  ctx.fill();

  const skin = '#c4a888';
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, -s * 0.14, s * 0.11, 0, Math.PI * 2);
  ctx.fill();
  if (helmKind !== 'none') {
    ctx.fillStyle = helmKind === 'metal' ? '#a8b0b8' : '#8a5a36';
    ctx.beginPath();
    ctx.arc(0, -s * 0.16, s * 0.12, Math.PI, 0);
    ctx.fill();
  }

  if (v.offhand) {
    ctx.fillStyle = v.offhand === 'shield_wood' ? '#8a5a2e' : '#6a8aaa';
    ctx.beginPath();
    ctx.ellipse(-s * 0.2, s * 0.02, s * 0.1, s * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawWeaponGlyph(ctx, s, wt, o.team, metal);

  if (o.dead) {
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-s * 0.14, -s * 0.14);
    ctx.lineTo(s * 0.14, s * 0.14);
    ctx.moveTo(s * 0.14, -s * 0.14);
    ctx.lineTo(-s * 0.14, s * 0.14);
    ctx.stroke();
  }
}

function drawWeaponGlyph(
  ctx: CanvasRenderingContext2D,
  s: number,
  wt: string,
  team: string,
  metal = '#e8eef4',
) {
  ctx.save();
  ctx.strokeStyle = metal;
  ctx.fillStyle = metal;
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.lineCap = 'round';
  if (wt === 'bow' || wt === 'crossbow') {
    ctx.beginPath();
    ctx.arc(s * 0.2, 0, s * 0.14, -1.2, 1.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.08, 0);
    ctx.lineTo(s * 0.28, 0);
    ctx.stroke();
  } else if (wt === 'spear') {
    ctx.beginPath();
    ctx.moveTo(-s * 0.05, s * 0.18);
    ctx.lineTo(s * 0.22, -s * 0.18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.22, -s * 0.18);
    ctx.lineTo(s * 0.14, -s * 0.08);
    ctx.lineTo(s * 0.28, -s * 0.1);
    ctx.closePath();
    ctx.fill();
  } else if (wt === 'shield') {
    ctx.beginPath();
    ctx.moveTo(s * 0.18, -s * 0.1);
    ctx.lineTo(s * 0.3, -s * 0.04);
    ctx.lineTo(s * 0.3, s * 0.08);
    ctx.lineTo(s * 0.18, s * 0.14);
    ctx.closePath();
    ctx.fillStyle = '#6a8aaa';
    ctx.fill();
  } else if (wt === 'greatsword' || wt === 'axemace') {
    ctx.beginPath();
    ctx.moveTo(-s * 0.02, s * 0.16);
    ctx.lineTo(s * 0.2, -s * 0.2);
    ctx.stroke();
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.moveTo(s * 0.12, -s * 0.22);
    ctx.lineTo(s * 0.28, -s * 0.12);
    ctx.lineTo(s * 0.18, -s * 0.06);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-s * 0.02, s * 0.14);
    ctx.lineTo(s * 0.24, -s * 0.16);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.1, -s * 0.02);
    ctx.lineTo(s * 0.18, s * 0.04);
    ctx.stroke();
  }
  void team;
  ctx.restore();
}
