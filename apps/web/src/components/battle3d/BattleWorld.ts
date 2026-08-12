import * as THREE from 'three';
import { MAP_H, MAP_W } from '@tfw/game';
import { WarriorFigure } from './WarriorFigure';

const TILE = 1.05;
const GROUND_Y = 0;

const TERRAIN: Record<string, number> = {
  grass: 0x6ea050,
  dry_grass: 0xb4a85a,
  dirt: 0xc49a60,
  dirt_edge: 0xb89058,
  water: 0x3d7a96,
  ford: 0x7aaca0,
  tree: 0x5f9442,
  bush: 0x608a48,
  rock: 0x948e86,
  cliff: 0xa09478,
  camp: 0x7aaa58,
  moss: 0x4f8848,
  thicket: 0x4a703e,
};

export type BattleFx = {
  projectiles: { fromX: number; fromY: number; toX: number; toY: number; t: number; kind: string }[];
  floats: { x: number; y: number; text: string; life: number; color: string }[];
  impacts?: { x: number; y: number; t: number; kind?: string }[];
};

export type BattleFrame = {
  map: any[][];
  units: any[];
  vis: Record<
    string,
    { x: number; y: number; bob: number; flash: number; lunge: number; slash: number; face: number; hop: number }
  >;
  activeId: string | null;
  visTiles: Set<string> | null;
  reachSet?: Set<string>;
  reachTone?: 'move' | 'deploy';
  attackSet?: Set<string>;
  hover: { x: number; y: number } | null;
  fx: BattleFx;
  followCam?: boolean;
};

function tileWorld(gx: number, gy: number, elev = 0) {
  return {
    x: (gx - (MAP_W - 1) / 2) * TILE,
    y: GROUND_Y + elev * 0.38,
    z: (gy - (MAP_H - 1) / 2) * TILE,
  };
}

function elevOf(map: any[][], gx: number, gy: number) {
  const c = map[Math.round(gy)]?.[Math.round(gx)];
  if (!c) return 0.12;
  return Math.max(0.1, c.height || (c.kind === 'cliff' ? 1 : 0.12));
}

export class BattleWorld {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  private host: HTMLElement;
  private terrainRoot = new THREE.Group();
  private overlayRoot = new THREE.Group();
  private fogRoot = new THREE.Group();
  private figures = new Map<string, WarriorFigure>();
  private tileMeshes = new Map<string, THREE.Mesh>();
  private highlightRoot = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pointer = new THREE.Vector2();
  private projMeshes: THREE.Mesh[] = [];
  private floatSprites: THREE.Sprite[] = [];
  private impactMeshes: THREE.Mesh[] = [];
  private lastMapKey = '';
  private clock = new THREE.Clock();
  private animId = 0;
  private disposed = false;
  private frame: BattleFrame | null = null;
  private onResize: () => void;
  private lookAt = new THREE.Vector3(0, 0.35, 0);
  private camBase = new THREE.Vector3(-14, 16, 14);
  private fogMeshes = new Map<string, THREE.Mesh>();

  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.id = 'battle-canvas';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.cursor = 'crosshair';
    host.appendChild(this.renderer.domElement);

    const aspect = 1;
    const frustum = 11;
    this.camera = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      0.1,
      80,
    );
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.lookAt);
    this.camera.up.set(0, 1, 0);

    this.scene.background = new THREE.Color(0x0c100a);
    this.scene.fog = new THREE.Fog(0x0c100a, 24, 42);

    this.scene.add(new THREE.AmbientLight(0xc8b898, 0.55));
    this.scene.add(new THREE.HemisphereLight(0xd8e8ff, 0x3a2a18, 0.45));
    const sun = new THREE.DirectionalLight(0xffe0b0, 1.2);
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 40;
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -16;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x88aacc, 0.28);
    fill.position.set(-6, 6, -4);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffc080, 0.2);
    rim.position.set(-4, 4, 10);
    this.scene.add(rim);

    this.scene.add(this.terrainRoot, this.fogRoot, this.highlightRoot, this.overlayRoot);

    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_W * TILE + 4, MAP_H * TILE + 4),
      new THREE.MeshStandardMaterial({ color: 0x2a2214, roughness: 1, metalness: 0 }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.05;
    base.receiveShadow = true;
    this.scene.add(base);

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
    this.loop();
  }

  resize() {
    const w = Math.max(2, this.host.clientWidth);
    const h = Math.max(2, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    const frustum = 11.5;
    this.camera.left = (-frustum * aspect) / 2;
    this.camera.right = (frustum * aspect) / 2;
    this.camera.top = frustum / 2;
    this.camera.bottom = -frustum / 2;
    this.camera.updateProjectionMatrix();
  }

  setFrame(frame: BattleFrame) {
    this.frame = frame;
    this.ensureTerrain(frame.map);
    this.syncFigures(frame);
    this.syncHighlights(frame);
    this.syncFog(frame);
  }

  private ensureTerrain(map: any[][]) {
    const key = `${map.length}x${map[0]?.length}:${map[0]?.[0]?.kind}`;
    if (key === this.lastMapKey && this.terrainRoot.children.length) return;
    this.lastMapKey = key;
    this.tileMeshes.clear();
    while (this.terrainRoot.children.length) {
      const c = this.terrainRoot.children.pop()!;
      this.terrainRoot.remove(c);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose?.();
          (m.material as THREE.Material)?.dispose?.();
        }
      });
    }

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const cell = map[y]?.[x] || { kind: 'grass' };
        const kind = cell.kind || 'grass';
        const elev = elevOf(map, x, y);
        const col = TERRAIN[kind] ?? TERRAIN.grass;
        const h = Math.max(0.08, elev * 0.38);
        const geo = new THREE.BoxGeometry(TILE * 0.96, h, TILE * 0.96);
        const mat = new THREE.MeshStandardMaterial({
          color: col,
          roughness: kind === 'water' ? 0.25 : 0.9,
          metalness: kind === 'water' ? 0.35 : 0.05,
        });
        if (kind === 'water') {
          mat.transparent = true;
          mat.opacity = 0.88;
        }
        const mesh = new THREE.Mesh(geo, mat);
        const w = tileWorld(x, y, elev);
        mesh.position.set(w.x, h / 2, w.z);
        mesh.receiveShadow = true;
        mesh.castShadow = elev > 0.4;
        mesh.userData.tile = { x, y };
        mesh.userData.baseColor = col;
        this.terrainRoot.add(mesh);
        this.tileMeshes.set(`${x},${y}`, mesh);

        if (kind === 'tree') {
          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.09, 0.55, 6),
            new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.9 }),
          );
          trunk.position.set(w.x, h + 0.28, w.z);
          trunk.castShadow = true;
          trunk.userData.propTile = `${x},${y}`;
          this.terrainRoot.add(trunk);
          const crown = new THREE.Mesh(
            new THREE.SphereGeometry(0.32, 10, 8),
            new THREE.MeshStandardMaterial({ color: 0x3a6a2e, roughness: 0.85 }),
          );
          crown.position.set(w.x, h + 0.7, w.z);
          crown.castShadow = true;
          crown.userData.propTile = `${x},${y}`;
          this.terrainRoot.add(crown);
        } else if (kind === 'rock' || kind === 'cliff') {
          const rock = new THREE.Mesh(
            new THREE.DodecahedronGeometry(0.22, 0),
            new THREE.MeshStandardMaterial({ color: 0x7a7670, roughness: 0.95 }),
          );
          rock.position.set(w.x + 0.1, h + 0.15, w.z - 0.05);
          rock.castShadow = true;
          rock.userData.propTile = `${x},${y}`;
          this.terrainRoot.add(rock);
        } else if (kind === 'bush' || kind === 'thicket') {
          const bush = new THREE.Mesh(
            new THREE.SphereGeometry(kind === 'thicket' ? 0.28 : 0.18, 8, 6),
            new THREE.MeshStandardMaterial({ color: 0x446834, roughness: 0.9 }),
          );
          bush.position.set(w.x, h + 0.12, w.z);
          bush.userData.propTile = `${x},${y}`;
          this.terrainRoot.add(bush);
        }
      }
    }
  }

  private syncFog(frame: BattleFrame) {
    const vis = frame.visTiles;
    for (const [key, mesh] of this.tileMeshes) {
      const seen = !vis || vis.has(key);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const base = mesh.userData.baseColor as number;
      if (seen) {
        mat.color.setHex(base);
      } else {
        mat.color.setHex(base).multiplyScalar(0.35);
      }
    }
    for (const child of this.terrainRoot.children) {
      const pk = (child as THREE.Mesh).userData?.propTile as string | undefined;
      if (!pk) continue;
      child.visible = !vis || vis.has(pk);
    }

    if (!vis) {
      for (const m of this.fogMeshes.values()) m.visible = false;
      return;
    }
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const key = `${x},${y}`;
        const seen = vis.has(key);
        let veil = this.fogMeshes.get(key);
        if (!veil) {
          veil = new THREE.Mesh(
            new THREE.PlaneGeometry(TILE * 0.98, TILE * 0.98),
            new THREE.MeshBasicMaterial({
              color: 0x060806,
              transparent: true,
              opacity: 0.48,
              depthWrite: false,
            }),
          );
          veil.rotation.x = -Math.PI / 2;
          this.fogRoot.add(veil);
          this.fogMeshes.set(key, veil);
        }
        const elev = elevOf(frame.map, x, y);
        const w = tileWorld(x, y, elev);
        veil.position.set(w.x, w.y + 0.12, w.z);
        veil.visible = !seen;
      }
    }
  }

  private syncFigures(frame: BattleFrame) {
    const seen = new Set<string>();
    for (const u of frame.units) {
      seen.add(u.id);
      let fig = this.figures.get(u.id);
      if (!fig) {
        const visual = {
          seed: u.visual?.seed ?? (u.team === 'player' ? 1 : 3),
          weaponType: u.visual?.weaponType || u.weaponType,
          weaponMetal: u.visual?.weaponMetal,
          body: u.visual?.body || (u.team === 'enemy' ? 'leather' : 'cloth'),
          helm: u.visual?.helm || (u.isBoss ? 'metal' : 'none'),
          legs: u.visual?.legs,
          offhand: u.visual?.offhand,
          accessory: u.visual?.accessory,
          kit: u.visual?.kit,
          team: u.team,
          boss: !!u.isBoss,
        };
        fig = new WarriorFigure(u.id, visual, u.team, u.weaponType, !!u.isBoss);
        this.figures.set(u.id, fig);
        this.scene.add(fig.root);
        const elev0 = elevOf(frame.map, u.x, u.y);
        const p0 = tileWorld(u.x, u.y, elev0);
        fig.root.position.set(p0.x, p0.y, p0.z);
      }
      const v = frame.vis[u.id];
      const gx = v?.x ?? u.x;
      const gy = v?.y ?? u.y;
      const elev = elevOf(frame.map, gx, gy);
      const pos = tileWorld(gx, gy, elev);
      const hop = (v?.hop || 0) * 0.12;
      // face is yaw (radians): 0=+Z/grid+y, π/2=+X/grid+x
      const faceYaw = typeof v?.face === 'number' ? v.face : u.team === 'player' ? Math.PI / 2 : -Math.PI / 2;
      const lungeAmt = (v?.lunge || 0) * 0.28;
      const lungeX = Math.sin(faceYaw) * lungeAmt;
      const lungeZ = Math.cos(faceYaw) * lungeAmt;
      const targetX = pos.x + lungeX;
      const targetZ = pos.z + lungeZ;
      const logicalLag = Math.hypot(gx - u.x, gy - u.y);
      const worldLag = Math.hypot(fig.root.position.x - targetX, fig.root.position.z - targetZ);
      fig.moving = u.hp > 0 && (logicalLag > 0.035 || worldLag > 0.06);
      const ease = fig.moving ? 0.09 : 0.2;
      fig.root.position.x = THREE.MathUtils.lerp(fig.root.position.x || targetX, targetX, ease);
      fig.root.position.z = THREE.MathUtils.lerp(fig.root.position.z || targetZ, targetZ, ease);
      fig.root.position.y = pos.y + hop;
      fig.gridX = targetX;
      fig.gridY = targetZ;
      fig.faceYaw = faceYaw;
      fig.setDead(u.hp <= 0);
      fig.setHp(u.hp / Math.max(1, u.maxHp));
      fig.setActive(frame.activeId === u.id && u.hp > 0);
      if (v && v.flash > 0.05) fig.hitFlash(v.flash);
      if (v && v.slash > 0.9) fig.playAttack();
      if (
        v &&
        v.lunge > 0.9 &&
        (u.weaponType === 'bow' || u.weaponType === 'crossbow' || u.weaponType === 'thrown')
      ) {
        fig.playAttack();
      }
    }
    for (const [id, fig] of this.figures) {
      if (!seen.has(id)) {
        this.scene.remove(fig.root);
        fig.dispose();
        this.figures.delete(id);
      }
    }
  }

  private syncHighlights(frame: BattleFrame) {
    while (this.highlightRoot.children.length) {
      const c = this.highlightRoot.children.pop()!;
      this.highlightRoot.remove(c);
      if ((c as THREE.Mesh).geometry) (c as THREE.Mesh).geometry.dispose();
      ((c as THREE.Mesh).material as THREE.Material)?.dispose?.();
    }
    const place = (set: Set<string> | undefined, color: number, op: number, yLift = 0.06) => {
      if (!set) return;
      for (const key of set) {
        const [xs, ys] = key.split(',');
        const x = +xs;
        const y = +ys;
        const elev = elevOf(frame.map, x, y);
        const w = tileWorld(x, y, elev);
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(TILE * 0.9, TILE * 0.9),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: op,
            depthWrite: false,
          }),
        );
        m.rotation.x = -Math.PI / 2;
        m.position.set(w.x, w.y + yLift, w.z);
        this.highlightRoot.add(m);
      }
    };

    const outline = (set: Set<string> | undefined, color: number, op = 0.95) => {
      if (!set?.size) return;
      const half = TILE * 0.48;
      const thick = 0.055;
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: op,
        depthWrite: false,
      });
      const faces: { dx: number; dy: number; sx: number; sz: number; ox: number; oz: number }[] = [
        { dx: 0, dy: -1, sx: TILE * 0.92, sz: thick, ox: 0, oz: -half },
        { dx: 0, dy: 1, sx: TILE * 0.92, sz: thick, ox: 0, oz: half },
        { dx: -1, dy: 0, sx: thick, sz: TILE * 0.92, ox: -half, oz: 0 },
        { dx: 1, dy: 0, sx: thick, sz: TILE * 0.92, ox: half, oz: 0 },
      ];
      for (const key of set) {
        const [xs, ys] = key.split(',');
        const x = +xs;
        const y = +ys;
        const elev = elevOf(frame.map, x, y);
        const w = tileWorld(x, y, elev);
        for (const f of faces) {
          if (set.has(`${x + f.dx},${y + f.dy}`)) continue;
          const m = new THREE.Mesh(new THREE.BoxGeometry(f.sx, 0.04, f.sz), mat.clone());
          m.position.set(w.x + f.ox, w.y + 0.1, w.z + f.oz);
          this.highlightRoot.add(m);
        }
      }
    };

    const tone = frame.reachTone || 'move';
    if (frame.reachSet?.size) {
      if (tone === 'deploy') {
        place(frame.reachSet, 0x4a90d0, 0.26);
        outline(frame.reachSet, 0x64bef0, 0.9);
      } else {
        place(frame.reachSet, 0xf0be3c, 0.36);
        outline(frame.reachSet, 0xffd75a, 0.98);
      }
    }
    place(frame.attackSet, 0xd05040, 0.32, 0.07);
    if (frame.attackSet?.size) outline(frame.attackSet, 0xff6446, 0.92);

    if (frame.hover) {
      const elev = elevOf(frame.map, frame.hover.x, frame.hover.y);
      const w = tileWorld(frame.hover.x, frame.hover.y, elev);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(TILE * 0.95, TILE * 0.95),
        new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.35, depthWrite: false }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(w.x, w.y + 0.08, w.z);
      this.highlightRoot.add(m);
    }
    if (frame.activeId) {
      const u = frame.units.find((x) => x.id === frame.activeId);
      if (u && u.hp > 0) {
        const elev = elevOf(frame.map, u.x, u.y);
        const w = tileWorld(u.x, u.y, elev);
        const m = new THREE.Mesh(
          new THREE.RingGeometry(0.28, 0.42, 28),
          new THREE.MeshBasicMaterial({
            color: 0xf0d080,
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide,
          }),
        );
        m.rotation.x = -Math.PI / 2;
        m.position.set(w.x, w.y + 0.1, w.z);
        this.highlightRoot.add(m);
      }
    }
  }

  private updateCamera(frame: BattleFrame, dt: number) {
    let tx = 0;
    let tz = 0;
    if (frame.followCam && frame.activeId) {
      const fig = this.figures.get(frame.activeId);
      if (fig) {
        tx = fig.root.position.x * 0.55;
        tz = fig.root.position.z * 0.55;
      } else {
        const u = frame.units.find((x) => x.id === frame.activeId);
        if (u) {
          const p = tileWorld(u.x, u.y, elevOf(frame.map, u.x, u.y));
          tx = p.x * 0.55;
          tz = p.z * 0.55;
        }
      }
    }
    const k = 1 - Math.exp(-dt * 2.2);
    this.lookAt.x = THREE.MathUtils.lerp(this.lookAt.x, tx, k);
    this.lookAt.z = THREE.MathUtils.lerp(this.lookAt.z, tz, k);
    this.lookAt.y = 0.35;
    this.camera.position.set(this.lookAt.x + this.camBase.x, this.camBase.y, this.lookAt.z + this.camBase.z);
    this.camera.lookAt(this.lookAt);
  }

  private syncFx(frame: BattleFrame, _dt: number) {
    while (this.projMeshes.length < frame.fx.projectiles.length) {
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(0.04, 0.28, 6),
        new THREE.MeshStandardMaterial({ color: 0xd8c090, metalness: 0.35, roughness: 0.45 }),
      );
      this.overlayRoot.add(m);
      this.projMeshes.push(m);
    }
    for (let i = 0; i < this.projMeshes.length; i++) {
      const m = this.projMeshes[i];
      const p = frame.fx.projectiles[i];
      if (!p) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      const a = tileWorld(p.fromX, p.fromY, elevOf(frame.map, p.fromX, p.fromY));
      const b = tileWorld(p.toX, p.toY, elevOf(frame.map, p.toX, p.toY));
      const t = Math.max(0, Math.min(1, p.t));
      const ease = t * t * (3 - 2 * t);
      m.position.set(a.x + (b.x - a.x) * ease, 1.15 + Math.sin(t * Math.PI) * 0.7 + a.y, a.z + (b.z - a.z) * ease);
      const dir = new THREE.Vector3(b.x - a.x, 0.2, b.z - a.z).normalize();
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.lengthSq() ? dir : new THREE.Vector3(1, 0, 0));
    }

    const impacts = frame.fx.impacts || [];
    while (this.impactMeshes.length < impacts.length) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.08, 0.35, 20),
        new THREE.MeshBasicMaterial({
          color: 0xffd080,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      this.overlayRoot.add(m);
      this.impactMeshes.push(m);
    }
    for (let i = 0; i < this.impactMeshes.length; i++) {
      const m = this.impactMeshes[i];
      const imp = impacts[i];
      if (!imp) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      const w = tileWorld(imp.x, imp.y, elevOf(frame.map, imp.x, imp.y));
      const t = Math.max(0, Math.min(1, imp.t));
      m.scale.setScalar(0.4 + t * 1.8);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - t);
      m.position.set(w.x, w.y + 0.14, w.z);
    }

    while (this.floatSprites.length < frame.fx.floats.length) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 64;
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      sp.scale.set(0.95, 0.48, 1);
      sp.userData.canvas = canvas;
      sp.userData.tex = tex;
      this.overlayRoot.add(sp);
      this.floatSprites.push(sp);
    }
    for (let i = 0; i < this.floatSprites.length; i++) {
      const sp = this.floatSprites[i];
      const f = frame.fx.floats[i];
      if (!f) {
        sp.visible = false;
        continue;
      }
      sp.visible = true;
      const w = tileWorld(f.x, f.y, elevOf(frame.map, f.x, f.y));
      sp.position.set(w.x, w.y + 1.75 + (1 - f.life) * 0.85, w.z);
      (sp.material as THREE.SpriteMaterial).opacity = Math.max(0, f.life);
      const canvas = sp.userData.canvas as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 128, 64);
      ctx.font = 'bold 36px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#1a1008';
      ctx.lineWidth = 5;
      ctx.strokeText(f.text, 64, 42);
      ctx.fillStyle = f.color || '#ffd080';
      ctx.fillText(f.text, 64, 42);
      (sp.userData.tex as THREE.CanvasTexture).needsUpdate = true;
    }
  }

  private loop = () => {
    if (this.disposed) return;
    this.animId = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const frame = this.frame;
    if (frame) {
      this.updateCamera(frame, dt);
      for (const u of frame.units) {
        const fig = this.figures.get(u.id);
        if (!fig) continue;
        const fogOk =
          u.team === 'player' ||
          !frame.visTiles ||
          frame.visTiles.has(`${u.x},${u.y}`) ||
          u.hp <= 0;
        const elev = elevOf(frame.map, frame.vis[u.id]?.x ?? u.x, frame.vis[u.id]?.y ?? u.y);
        const show = u.team === 'player' || fogOk;
        fig.update(dt, u.x, u.y, elev, this.camera, show);
      }
      this.syncFx(frame, dt);
    }
    this.renderer.render(this.scene, this.camera);
  };

  pickTile(ev: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hits = this.raycaster.intersectObjects(this.terrainRoot.children, false);
    for (const h of hits) {
      const t = h.object.userData.tile;
      if (t) return { x: t.x, y: t.y };
    }

    const target = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, target)) {
      const gx = Math.round(target.x / TILE + (MAP_W - 1) / 2);
      const gy = Math.round(target.z / TILE + (MAP_H - 1) / 2);
      if (gx >= 0 && gy >= 0 && gx < MAP_W && gy < MAP_H) return { x: gx, y: gy };
    }
    return null;
  }

  playAttack(unitId: string) {
    this.figures.get(unitId)?.playAttack();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.onResize);
    for (const fig of this.figures.values()) {
      this.scene.remove(fig.root);
      fig.dispose();
    }
    this.figures.clear();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.host) {
      this.host.removeChild(this.renderer.domElement);
    }
  }
}
