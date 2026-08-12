import * as THREE from 'three';
import { hairColor, skinTone, clothColor } from '../gearVisual';
import { faceImageSrc, warriorImageSrc } from '../artCatalog';
import { getArtImage, isArtError } from '../artCache';

export type WarriorVisual = {
  seed?: number;
  weaponType?: string;
  weaponMetal?: string;
  offhand?: string | null;
  helm?: string;
  body?: string;
  legs?: string;
  accessory?: boolean;
  team?: string;
  name?: string;
  /** Enemy kit / role for silhouette variety */
  kit?: string;
  boss?: boolean;
};

type Archetype = {
  id: number;
  female: boolean;
  height: number;
  bulk: number;
  hair: 'crop' | 'short' | 'long' | 'braid' | 'baldish';
  beard: boolean;
};

/** Match painted set w0–w4 identities */
function archetypeFromSeed(seed = 0): Archetype {
  const id = Math.abs(seed | 0) % 5;
  const table: Archetype[] = [
    { id: 0, female: false, height: 1.0, bulk: 1.08, hair: 'crop', beard: true },
    { id: 1, female: true, height: 0.94, bulk: 0.9, hair: 'short', beard: false },
    { id: 2, female: false, height: 1.02, bulk: 1.12, hair: 'crop', beard: true },
    { id: 3, female: false, height: 0.98, bulk: 0.95, hair: 'crop', beard: false },
    { id: 4, female: true, height: 1.04, bulk: 0.92, hair: 'braid', beard: false },
  ];
  return table[id];
}

function hex(c: string) {
  return new THREE.Color(c);
}

function mat(color: string, opts: { metal?: number; rough?: number; emissive?: string; emissiveIntensity?: number } = {}) {
  return new THREE.MeshStandardMaterial({
    color: hex(color),
    metalness: opts.metal ?? 0.08,
    roughness: opts.rough ?? 0.72,
    emissive: opts.emissive ? hex(opts.emissive) : undefined,
    emissiveIntensity: opts.emissive ? opts.emissiveIntensity ?? 0.15 : 0,
  });
}

const METAL: Record<string, string> = {
  copper: '#c07040',
  iron: '#9aa0a8',
  steel: '#c8d0d8',
  wood: '#8a5a2e',
  leather: '#8a5a36',
  gold: '#c8a040',
};

const ENEMY_PALETTE = {
  rag: ['#4a3a32', '#3a3228', '#524038', '#2e2820'],
  rust: ['#8a5a40', '#6a4838', '#7a5040'],
  ironDirty: ['#6a6860', '#5a5850', '#787068'],
  skinDark: ['#6a4a38', '#5a4030', '#7a5844'],
};

/**
 * Low-poly humanoid: loadout colors + face texture, distinct player vs enemy / boss kits.
 */
export class WarriorFigure {
  root = new THREE.Group();
  body = new THREE.Group();
  gridX = 0;
  gridY = 0;
  faceYaw = Math.PI / 2; // radians; 0 = +Z (grid +y), π/2 = +X (grid +x)
  dead = false;
  active = false;
  flash = 0;
  attackPhase = 0;
  walkPhase = 0;
  moving = false;
  private meshes: THREE.Object3D[] = [];
  private materials: THREE.Material[] = [];
  private hipL!: THREE.Group;
  private hipR!: THREE.Group;
  private armL!: THREE.Group;
  private armR!: THREE.Group;
  private headG!: THREE.Group;
  private weaponG!: THREE.Group;
  private capeG: THREE.Group | null = null;
  private ring!: THREE.Mesh;
  private hpBarBg!: THREE.Mesh;
  private hpBarFg!: THREE.Mesh;
  private facePlane: THREE.Mesh | null = null;
  private team: string;
  private weaponType: string;
  private artSrc: string;
  private faceSrc: string;
  private baseY = 0;
  private disposal: (() => void)[] = [];
  private disposed = false;
  private faceApplied = false;
  private deathT = 0;
  private idlePhase = Math.random() * Math.PI * 2;
  private isBoss: boolean;
  private bodyScale: THREE.Vector3;

  constructor(
    public id: string,
    visual: WarriorVisual,
    team: string,
    weaponType: string,
    boss = false,
  ) {
    this.team = team;
    this.isBoss = boss || !!visual.boss;
    this.weaponType = weaponType || visual.weaponType || 'sword';
    const seed = visual.seed ?? 1;
    const arch = archetypeFromSeed(seed);
    const skin = skinTone(seed);
    const hair = hairColor(seed);
    const cloth = clothColor(seed);
    const metalHue = METAL[visual.weaponMetal || 'iron'] || '#9aa0a8';
    const enemy = team === 'enemy';
    const kit = visual.kit || (this.isBoss ? 'boss' : enemy ? `raider_${seed % 4}` : 'ally');

    const bodyKind = visual.body || (enemy ? 'leather' : 'cloth');
    let armorCol: string;
    let legCol: string;
    if (enemy) {
      if (this.isBoss) {
        armorCol = '#4a4848';
        legCol = '#2a2420';
      } else if (bodyKind === 'iron') {
        armorCol = ENEMY_PALETTE.ironDirty[seed % 3];
        legCol = ENEMY_PALETTE.rag[seed % 4];
      } else {
        armorCol = ENEMY_PALETTE.rag[seed % 4];
        legCol = ENEMY_PALETTE.rust[seed % 3];
      }
    } else {
      armorCol =
        bodyKind === 'iron' ? '#8a929c' : bodyKind === 'leather' ? '#8a5a36' : cloth.mid;
      legCol = visual.legs === 'leather' ? '#6a4228' : bodyKind === 'iron' ? '#6a7078' : cloth.dark;
    }

    const skinMid = enemy ? ENEMY_PALETTE.skinDark[seed % 3] : skin.mid;
    const skinDark = enemy ? '#3a2818' : skin.dark;

    this.artSrc = enemy
      ? warriorImageSrc({
          seed: (seed + 2) % 5,
          weaponType: this.weaponType,
          body: bodyKind === 'cloth' ? 'leather' : bodyKind,
          helm: visual.helm,
          offhand: visual.offhand,
        })
      : warriorImageSrc({
          seed,
          weaponType: this.weaponType,
          body: bodyKind,
          helm: visual.helm,
          offhand: visual.offhand,
        });
    this.faceSrc = faceImageSrc(seed);

    const s = arch.height * (this.isBoss ? 1.18 : enemy ? 1.0 + (seed % 3) * 0.03 : 1);
    const b = arch.bulk * (this.isBoss ? 1.2 : enemy && kit.includes('raider') ? 1.06 : 1);
    this.bodyScale = new THREE.Vector3(b * 0.9, s, b * 0.9);
    this.body.scale.copy(this.bodyScale);
    this.faceYaw = enemy ? -Math.PI / 2 : Math.PI / 2;
    this.body.rotation.y = this.faceYaw;
    this.root.add(this.body);

    // ground shadow
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(this.isBoss ? 0.42 : 0.34, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.root.add(shadow);

    // select ring
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(this.isBoss ? 0.42 : 0.34, 0.022, 8, 32),
      mat(team === 'player' ? '#7ab0e8' : '#e07060', {
        metal: 0.4,
        rough: 0.4,
        emissive: team === 'player' ? '#204060' : '#401808',
        emissiveIntensity: 0.12,
      }),
    );
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.04;
    this.root.add(this.ring);

    // pelvis + belt
    const pelvis = this.mesh(new THREE.BoxGeometry(0.3, 0.16, 0.18), armorCol, bodyKind === 'iron' ? 0.45 : 0.08);
    pelvis.position.y = 0.78;
    this.body.add(pelvis);
    const belt = this.mesh(new THREE.BoxGeometry(0.32, 0.06, 0.2), enemy ? '#2a1810' : '#3a2a18', 0.15);
    belt.position.y = 0.88;
    this.body.add(belt);
    if (!enemy) {
      const buckle = this.mesh(new THREE.BoxGeometry(0.08, 0.05, 0.04), '#c8a040', 0.7);
      buckle.position.set(0, 0.88, 0.11);
      this.body.add(buckle);
    }

    // torso
    const torsoW = arch.female ? 0.3 : 0.36;
    const torso = this.mesh(
      new THREE.BoxGeometry(torsoW, 0.44, 0.22),
      armorCol,
      bodyKind === 'iron' ? 0.55 : 0.12,
    );
    torso.position.y = 1.1;
    this.body.add(torso);

    // player tabard stripe / enemy war sash
    if (!enemy) {
      const tabard = this.mesh(new THREE.BoxGeometry(torsoW * 0.55, 0.5, 0.06), '#3a5a78', 0.05);
      tabard.position.set(0, 1.05, 0.12);
      this.body.add(tabard);
      const stripe = this.mesh(new THREE.BoxGeometry(0.06, 0.48, 0.02), '#d4a04a', 0.35);
      stripe.position.set(0, 1.05, 0.15);
      this.body.add(stripe);
    } else if (!this.isBoss) {
      const sash = this.mesh(new THREE.BoxGeometry(torsoW * 1.05, 0.08, 0.24), '#5a2018', 0.05);
      sash.position.set(0, 1.0, 0);
      sash.rotation.z = 0.35;
      this.body.add(sash);
    }

    if (arch.female) {
      const chest = this.mesh(new THREE.SphereGeometry(0.09, 10, 8), armorCol);
      chest.scale.set(1.35, 0.85, 0.9);
      chest.position.set(0, 1.16, 0.06);
      this.body.add(chest);
    }

    // pauldrons
    this.addPauldron(-torsoW * 0.55, bodyKind, armorCol, metalHue, enemy);
    this.addPauldron(torsoW * 0.55, bodyKind, armorCol, metalHue, enemy, seed % 2 === 0 && enemy);

    // cape
    this.capeG = new THREE.Group();
    this.capeG.position.set(0, 1.28, -0.08);
    this.body.add(this.capeG);
    const capeCol = this.isBoss ? '#3a1810' : enemy ? '#2a2218' : '#2a3a52';
    const cape = this.mesh(new THREE.BoxGeometry(0.34, 0.55, 0.04), capeCol, 0.04);
    cape.position.set(0, -0.28, -0.06);
    this.capeG.add(cape);
    if (!enemy) {
      const trim = this.mesh(new THREE.BoxGeometry(0.28, 0.04, 0.02), '#c8a040', 0.5);
      trim.position.set(0, -0.52, -0.05);
      this.capeG.add(trim);
    }
    if (this.isBoss) {
      const plate = this.mesh(new THREE.BoxGeometry(0.38, 0.18, 0.12), '#6a6868', 0.65);
      plate.position.set(0, 1.22, 0.08);
      this.body.add(plate);
    }

    // head
    this.headG = new THREE.Group();
    this.headG.position.y = 1.42;
    this.body.add(this.headG);
    const head = this.mesh(new THREE.SphereGeometry(0.135, 16, 14), skinMid);
    head.position.y = 0.08;
    this.headG.add(head);

    for (const sx of [-1, 1]) {
      const ear = this.mesh(new THREE.SphereGeometry(0.035, 8, 6), skinDark);
      ear.position.set(sx * 0.125, 0.08, 0);
      this.headG.add(ear);
    }

    // Face: prefer dedicated face crop portraits
    const faceGeo = new THREE.PlaneGeometry(0.16, 0.18);
    const faceMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      roughness: 0.88,
      metalness: 0,
      depthWrite: false,
    });
    this.facePlane = new THREE.Mesh(faceGeo, faceMat);
    this.facePlane.position.set(0, 0.09, 0.125);
    this.headG.add(this.facePlane);
    this.materials.push(faceMat);
    // Prefer dedicated face portraits over full-body crop
    this.loadFaceTexture(faceMat, this.faceSrc, true);

    this.addHair(arch, hair.mid, hair.dark, enemy);

    if (arch.beard && !enemy) {
      const beard = this.mesh(new THREE.SphereGeometry(0.09, 10, 8), hair.dark);
      beard.scale.set(1.1, 0.75, 0.7);
      beard.position.set(0, -0.02, 0.08);
      this.headG.add(beard);
    } else if (enemy && seed % 3 !== 0) {
      const stubble = this.mesh(new THREE.SphereGeometry(0.08, 8, 6), '#2a2018');
      stubble.scale.set(1.05, 0.55, 0.65);
      stubble.position.set(0, 0.0, 0.09);
      this.headG.add(stubble);
    }

    // helm / enemy wrap / boss crown helm
    this.addHeadGear(visual, metalHue, enemy, seed);

    // legs / arms
    this.hipL = new THREE.Group();
    this.hipR = new THREE.Group();
    this.hipL.position.set(-0.09, 0.72, 0);
    this.hipR.position.set(0.09, 0.72, 0);
    this.body.add(this.hipL, this.hipR);
    this.makeLimb(this.hipL, legCol, skinMid, true);
    this.makeLimb(this.hipR, legCol, skinMid, true);

    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.armL.position.set(-torsoW * 0.58, 1.24, 0);
    this.armR.position.set(torsoW * 0.58, 1.24, 0);
    this.body.add(this.armL, this.armR);
    this.makeLimb(this.armL, armorCol, skinMid, false);
    this.makeLimb(this.armR, armorCol, skinMid, false);

    this.weaponG = new THREE.Group();
    this.weaponG.position.set(0, -0.48, 0.05);
    this.armR.add(this.weaponG);
    this.buildWeapon(this.weaponType, metalHue, visual.offhand || null, enemy);

    if (visual.accessory && !enemy) {
      const ring = this.mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12), '#c8a040', 0.8);
      ring.position.set(0, -0.52, 0.04);
      this.armL.add(ring);
    }

    // HP bars
    this.hpBarBg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.055),
      new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.72, depthWrite: false }),
    );
    this.hpBarFg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.038),
      new THREE.MeshBasicMaterial({
        color: team === 'player' ? 0x6a9a4e : this.isBoss ? 0xe04030 : 0xc45c26,
        depthWrite: false,
      }),
    );
    this.hpBarBg.position.y = this.isBoss ? 2.15 : 1.9;
    this.hpBarFg.position.y = this.hpBarBg.position.y;
    this.hpBarFg.position.z = 0.01;
    this.root.add(this.hpBarBg, this.hpBarFg);

    this.root.userData.figureId = id;
  }

  private addPauldron(
    x: number,
    bodyKind: string,
    armorCol: string,
    metal: string,
    enemy: boolean,
    skip = false,
  ) {
    if (skip) return;
    const col = bodyKind === 'iron' || this.isBoss ? metal || armorCol : armorCol;
    const p = this.mesh(
      new THREE.SphereGeometry(this.isBoss ? 0.12 : 0.09, 10, 8),
      col,
      bodyKind === 'iron' || this.isBoss ? 0.55 : 0.12,
    );
    p.scale.set(1.2, 0.7, 1.1);
    p.position.set(x, 1.28, 0);
    this.body.add(p);
    if (this.isBoss) {
      const spike = this.mesh(new THREE.ConeGeometry(0.04, 0.14, 5), metal, 0.7);
      spike.position.set(x, 1.42, 0);
      this.body.add(spike);
    }
  }

  private addHeadGear(visual: WarriorVisual, metalHue: string, enemy: boolean, seed: number) {
    if (this.isBoss) {
      const helm = this.mesh(new THREE.SphereGeometry(0.155, 14, 10), '#6a6868', 0.75);
      helm.scale.set(1.05, 0.78, 1.1);
      helm.position.y = 0.14;
      this.headG.add(helm);
      const visor = this.mesh(new THREE.BoxGeometry(0.22, 0.04, 0.08), '#1a1814', 0.2);
      visor.position.set(0, 0.1, 0.12);
      this.headG.add(visor);
      const crown = this.mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 6), '#e0c050', 0.65);
      crown.position.y = 0.3;
      this.headG.add(crown);
      for (let i = 0; i < 5; i++) {
        const sp = this.mesh(new THREE.ConeGeometry(0.025, 0.1, 4), '#e0c050', 0.6);
        const a = (i / 5) * Math.PI * 2;
        sp.position.set(Math.cos(a) * 0.1, 0.38, Math.sin(a) * 0.1);
        this.headG.add(sp);
      }
      return;
    }

    if (visual.helm && visual.helm !== 'none') {
      const helmCol = visual.helm === 'metal' ? (enemy ? '#6a6860' : '#a8b0b8') : '#8a5a36';
      const helm = this.mesh(
        new THREE.SphereGeometry(0.148, 14, 10),
        helmCol,
        visual.helm === 'metal' ? 0.7 : 0.15,
      );
      helm.scale.set(1, 0.72, 1.05);
      helm.position.y = 0.14;
      this.headG.add(helm);
      if (visual.helm === 'metal') {
        const visor = this.mesh(new THREE.BoxGeometry(0.2, 0.03, 0.06), '#1a1814', 0.15);
        visor.position.set(0, 0.09, 0.12);
        this.headG.add(visor);
      }
      return;
    }

    if (enemy && seed % 5 === 0) {
      // headwrap bandana
      const band = this.mesh(new THREE.TorusGeometry(0.13, 0.03, 6, 14), '#5a2018', 0.05);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.14;
      this.headG.add(band);
    }
  }

  private mesh(geo: THREE.BufferGeometry, color: string, metal = 0.1) {
    const m = mat(color, { metal, rough: metal > 0.4 ? 0.35 : 0.72 });
    this.materials.push(m);
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.meshes.push(mesh);
    return mesh;
  }

  private makeLimb(parent: THREE.Group, upperCol: string, lowerCol: string, isLeg: boolean) {
    const upper = this.mesh(
      isLeg ? new THREE.CapsuleGeometry(0.06, 0.22, 4, 8) : new THREE.CapsuleGeometry(0.05, 0.18, 4, 8),
      upperCol,
    );
    upper.position.y = isLeg ? -0.18 : -0.14;
    parent.add(upper);
    const lower = this.mesh(
      isLeg ? new THREE.CapsuleGeometry(0.05, 0.2, 4, 8) : new THREE.CapsuleGeometry(0.045, 0.16, 4, 8),
      lowerCol,
    );
    lower.position.y = isLeg ? -0.46 : -0.38;
    parent.add(lower);
    if (isLeg) {
      const foot = this.mesh(new THREE.BoxGeometry(0.1, 0.05, 0.16), '#2a2018');
      foot.position.set(0, -0.62, 0.03);
      parent.add(foot);
    } else {
      const hand = this.mesh(new THREE.SphereGeometry(0.045, 8, 6), lowerCol);
      hand.position.y = -0.52;
      parent.add(hand);
    }
  }

  private addHair(arch: Archetype, mid: string, dark: string, enemy: boolean) {
    if (arch.hair === 'baldish') return;
    const hairMid = enemy ? '#2a2018' : mid;
    const hairDark = enemy ? '#1a140e' : dark;
    if (arch.hair === 'crop' || arch.hair === 'short') {
      const cap = this.mesh(new THREE.SphereGeometry(0.138, 12, 10), hairMid);
      cap.scale.set(1.05, 0.7, 1.05);
      cap.position.y = 0.14;
      this.headG.add(cap);
    } else if (arch.hair === 'long' || arch.hair === 'braid') {
      const cap = this.mesh(new THREE.SphereGeometry(0.14, 12, 10), hairMid);
      cap.scale.set(1.08, 0.75, 1.08);
      cap.position.y = 0.14;
      this.headG.add(cap);
      const fall = this.mesh(new THREE.CapsuleGeometry(0.05, 0.35, 4, 8), hairDark);
      fall.position.set(arch.hair === 'braid' ? 0.08 : 0, -0.05, -0.1);
      fall.rotation.x = 0.3;
      this.headG.add(fall);
      if (arch.hair === 'braid') {
        const braid = this.mesh(new THREE.CapsuleGeometry(0.035, 0.4, 4, 6), hairMid);
        braid.position.set(-0.06, -0.15, -0.08);
        braid.rotation.x = 0.5;
        this.headG.add(braid);
      }
    }
  }

  private buildWeapon(wt: string, metal: string, offhand: string | null, enemy: boolean) {
    while (this.weaponG.children.length) {
      this.weaponG.remove(this.weaponG.children[0]);
    }
    if (!wt || wt === 'unarmed') {
      // bare hands — mesh already has hands on limbs
      if (offhand) {
        // shield only possible with free main-hand type; rare for unarmed
        const sh = this.mesh(
          new THREE.BoxGeometry(0.22, 0.28, 0.04),
          offhand === 'shield_wood' ? '#6a4428' : metal,
          0.35,
        );
        sh.position.set(-0.22, -0.2, 0.08);
        this.armL.add(sh);
      }
      return;
    }
    const mCol = enemy && wt !== 'bow' ? '#7a7060' : metal;

    if (wt === 'bow' || wt === 'crossbow') {
      const bow = this.mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 18, Math.PI), '#6a4428', 0.05);
      bow.rotation.y = Math.PI / 2;
      bow.rotation.z = Math.PI / 2;
      this.weaponG.add(bow);
      const string = this.mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.36, 4), '#c8b898', 0.05);
      string.rotation.z = Math.PI / 2;
      string.position.set(0.02, 0, 0);
      this.weaponG.add(string);
      if (wt === 'crossbow') {
        const stock = this.mesh(new THREE.BoxGeometry(0.08, 0.3, 0.05), '#5a3a20');
        stock.position.set(0.06, -0.04, 0);
        this.weaponG.add(stock);
        const prod = this.mesh(new THREE.BoxGeometry(0.28, 0.03, 0.03), mCol, 0.55);
        prod.position.set(0.1, 0.08, 0);
        this.weaponG.add(prod);
      }
    } else if (wt === 'spear') {
      const shaft = this.mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.0, 6), '#6a4428');
      shaft.rotation.z = 0.15;
      shaft.position.y = 0.22;
      this.weaponG.add(shaft);
      const tip = this.mesh(new THREE.ConeGeometry(0.045, 0.14, 6), mCol, 0.75);
      tip.position.set(0.07, 0.7, 0);
      tip.rotation.z = 0.15;
      this.weaponG.add(tip);
    } else if (wt === 'greatsword' || wt === 'axemace') {
      const hilt = this.mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.28, 6), '#3a2a18');
      hilt.position.y = 0.05;
      this.weaponG.add(hilt);
      if (wt === 'axemace') {
        const head = this.mesh(new THREE.BoxGeometry(0.22, 0.14, 0.07), mCol, 0.65);
        head.position.set(0.08, 0.24, 0);
        this.weaponG.add(head);
        const blade = this.mesh(new THREE.BoxGeometry(0.1, 0.18, 0.02), mCol, 0.7);
        blade.position.set(0.16, 0.24, 0);
        this.weaponG.add(blade);
      } else {
        const guard = this.mesh(new THREE.BoxGeometry(0.18, 0.04, 0.04), mCol, 0.6);
        guard.position.y = 0.16;
        this.weaponG.add(guard);
        const blade = this.mesh(new THREE.BoxGeometry(0.07, 0.62, 0.02), mCol, 0.72);
        blade.position.y = 0.48;
        this.weaponG.add(blade);
      }
    } else if (wt === 'thrown') {
      const k = this.mesh(new THREE.BoxGeometry(0.04, 0.24, 0.02), mCol, 0.5);
      k.position.y = 0.12;
      this.weaponG.add(k);
      const tip = this.mesh(new THREE.ConeGeometry(0.025, 0.08, 5), mCol, 0.6);
      tip.position.y = 0.28;
      this.weaponG.add(tip);
    } else {
      const hilt = this.mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 6), '#3a2a18');
      this.weaponG.add(hilt);
      const guard = this.mesh(new THREE.BoxGeometry(0.16, 0.035, 0.035), mCol, 0.65);
      guard.position.y = 0.1;
      this.weaponG.add(guard);
      const blade = this.mesh(new THREE.BoxGeometry(0.04, 0.46, 0.016), mCol, 0.78);
      blade.position.y = 0.34;
      this.weaponG.add(blade);
    }

    if (offhand) {
      const isWood = offhand === 'shield_wood';
      const shield = this.mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.045, 14),
        isWood ? '#8a5a2e' : enemy ? '#5a6068' : '#6a8aaa',
        isWood ? 0.1 : 0.55,
      );
      shield.rotation.x = Math.PI / 2;
      shield.position.set(-0.22, -0.35, 0.05);
      this.armL.add(shield);
      const boss = this.mesh(new THREE.SphereGeometry(0.04, 8, 6), '#c8a040', 0.6);
      boss.position.set(-0.22, -0.35, 0.08);
      this.armL.add(boss);
    }
  }

  private loadFaceTexture(faceMat: THREE.MeshStandardMaterial, src: string, isPortrait: boolean) {
    if (this.disposed || this.faceApplied) return;
    const img = getArtImage(src, () => this.loadFaceTexture(faceMat, src, isPortrait));
    if (!img || !img.naturalWidth) {
      if (isPortrait && isArtError(this.faceSrc)) {
        this.loadFaceTexture(faceMat, this.artSrc, false);
      }
      return;
    }
    if (this.faceApplied) return;
    try {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const sw = img.naturalWidth;
      const sh = img.naturalHeight;
      if (isPortrait || src.includes('face_') || src.includes('portraits')) {
        ctx.drawImage(img, 0, 0, sw, sh, 0, 0, 128, 128);
      } else {
        const srcH = sh * 0.32;
        const srcY = sh * 0.06;
        const srcW = sw * 0.45;
        const srcX = (sw - srcW) / 2;
        ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, 128, 128);
      }
      const g = ctx.createRadialGradient(64, 64, 28, 64, 64, 64);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      faceMat.map = tex;
      faceMat.opacity = 0.95;
      faceMat.needsUpdate = true;
      this.faceApplied = true;
      this.disposal.push(() => tex.dispose());
    } catch {
      /* ignore */
    }
  }

  setHp(ratio: number) {
    const r = Math.max(0, Math.min(1, ratio));
    this.hpBarFg.scale.x = Math.max(0.001, r);
    this.hpBarFg.position.x = -0.25 * (1 - r);
  }

  setActive(on: boolean) {
    this.active = on;
    const m = this.ring.material as THREE.MeshStandardMaterial;
    m.color.set(on ? '#f0d080' : this.team === 'player' ? '#7ab0e8' : '#e07060');
    m.emissive = new THREE.Color(on ? '#a08020' : '#000000');
    m.emissiveIntensity = on ? 0.4 : 0.08;
    this.ring.scale.setScalar(on ? 1.14 : 1);
  }

  hitFlash(amount = 1) {
    this.flash = Math.max(this.flash, amount);
  }

  playAttack() {
    this.attackPhase = 1;
  }

  setDead(v: boolean) {
    if (v && !this.dead) this.deathT = 0;
    this.dead = v;
  }

  update(
    dt: number,
    logicalX: number,
    logicalY: number,
    elev: number,
    cam: THREE.Camera,
    visible: boolean,
  ) {
    this.root.visible = visible;
    if (!visible) return;
    void logicalX;
    void logicalY;
    void elev;

    if (this.dead) {
      this.deathT = Math.min(1, this.deathT + dt * 1.4);
      const t = this.deathT;
      const ease = t * t * (3 - 2 * t);
      this.body.rotation.z = THREE.MathUtils.lerp(this.body.rotation.z, -Math.PI / 2.1, 0.08 + ease * 0.1);
      this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, 0.35 * ease, 0.1);
      this.body.position.y = THREE.MathUtils.lerp(this.body.position.y, 0.08, 0.1);
      this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, -0.4, 0.08);
      this.armR.rotation.x = THREE.MathUtils.lerp(this.armR.rotation.x, 0.5, 0.08);
      this.hpBarBg.visible = false;
      this.hpBarFg.visible = false;
      this.ring.visible = false;
      if (this.capeG) this.capeG.rotation.x = THREE.MathUtils.lerp(this.capeG.rotation.x, 0.6, 0.08);
      return;
    }

    this.hpBarBg.visible = true;
    this.hpBarFg.visible = true;
    this.ring.visible = true;
    this.body.rotation.z = THREE.MathUtils.lerp(this.body.rotation.z, 0, 0.15);
    this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, 0, 0.15);

    // idle breath
    this.idlePhase += dt * 1.6;
    const breath = Math.sin(this.idlePhase) * 0.012;
    this.body.position.y = this.baseY + (this.moving ? 0 : breath);
    this.body.scale.y = this.bodyScale.y * (this.moving ? 1 : 1 + breath * 0.6);

    // Continuous facing: faceYaw 0 = +Z (down grid), +π/2 = +X (right)
    {
      let dYaw = this.faceYaw - this.body.rotation.y;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      this.body.rotation.y += dYaw * Math.min(1, 0.22 + dt * 4);
    }
    const faceSx = Math.sin(this.faceYaw);
    const faceSz = Math.cos(this.faceYaw);

    if (this.capeG && !this.moving) {
      this.capeG.rotation.x = Math.sin(this.idlePhase * 0.7) * 0.04;
    } else if (this.capeG) {
      this.capeG.rotation.x = THREE.MathUtils.lerp(this.capeG.rotation.x, 0.25, 0.08);
    }

    if (this.moving) {
      this.walkPhase += dt * 5.2;
      const swing = Math.sin(this.walkPhase) * 0.48;
      this.hipL.rotation.x = swing;
      this.hipR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.65;
      this.armR.rotation.x = swing * 0.65;
      this.armL.rotation.z = 0;
      this.armR.rotation.z = 0;
    } else {
      const settle = 1 - Math.exp(-dt * 10);
      this.hipL.rotation.x = THREE.MathUtils.lerp(this.hipL.rotation.x, 0, settle);
      this.hipR.rotation.x = THREE.MathUtils.lerp(this.hipR.rotation.x, 0, settle);
      this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, 0.05, settle);
      this.armR.rotation.x = THREE.MathUtils.lerp(this.armR.rotation.x, 0.05, settle);
      this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, 0.08, settle);
      this.armR.rotation.z = THREE.MathUtils.lerp(this.armR.rotation.z, -0.08, settle);
    }

    if (this.attackPhase > 0) {
      // wind-up → strike → recover
      this.attackPhase = Math.max(0, this.attackPhase - dt * 2.2);
      const t = 1 - this.attackPhase;
      const wind = Math.sin(Math.min(1, t * 1.6) * Math.PI) * (t < 0.35 ? 1 : 0);
      const strike = t >= 0.2 && t < 0.75 ? Math.sin(((t - 0.2) / 0.55) * Math.PI) : 0;
      const a = Math.max(wind * 0.4, strike);
      if (this.weaponType === 'bow' || this.weaponType === 'crossbow' || this.weaponType === 'thrown') {
        this.armR.rotation.x = -1.1 * a;
        this.armR.rotation.z = -0.5 * a;
        this.armL.rotation.x = -0.6 * a;
        this.body.rotation.y += -0.12 * a;
      } else if (this.weaponType === 'spear') {
        this.armR.rotation.x = -0.4 * a;
        this.armR.rotation.z = -0.2 * a;
        this.weaponG.position.z = 0.05 + 0.25 * a;
        this.body.position.x = 0.08 * a * faceSx;
        this.body.position.z = 0.08 * a * faceSz;
      } else {
        this.armR.rotation.x = -1.6 * a;
        this.armR.rotation.z = -0.85 * a;
        this.armL.rotation.x = 0.3 * a;
        this.body.rotation.y += 0.3 * a;
      }
    } else {
      this.weaponG.position.z = 0.05;
      this.body.position.x = THREE.MathUtils.lerp(this.body.position.x, 0, 0.2);
      this.body.position.z = THREE.MathUtils.lerp(this.body.position.z, 0, 0.2);
    }

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 2.8);
      const pulse = 0.35 + Math.sin(this.flash * 28) * 0.45;
      for (const m of this.materials) {
        if ('emissive' in m && (m as THREE.MeshStandardMaterial).emissive) {
          (m as THREE.MeshStandardMaterial).emissive.setRGB(pulse * 0.85, 0.06, 0.03);
          (m as THREE.MeshStandardMaterial).emissiveIntensity = this.flash * 1.0;
        }
      }
    } else {
      for (const m of this.materials) {
        if ('emissiveIntensity' in m) {
          const mm = m as THREE.MeshStandardMaterial;
          if (mm.emissiveIntensity && mm.emissiveIntensity > 0.15) {
            mm.emissiveIntensity = Math.max(0, mm.emissiveIntensity - dt * 2);
            if (mm.emissiveIntensity < 0.12) {
              mm.emissiveIntensity = 0;
              mm.emissive.setRGB(0, 0, 0);
            }
          }
        }
      }
    }

    this.hpBarBg.quaternion.copy(cam.quaternion);
    this.hpBarFg.quaternion.copy(cam.quaternion);
  }

  dispose() {
    this.disposed = true;
    for (const fn of this.disposal) fn();
    this.disposal.length = 0;
    for (const m of this.materials) m.dispose();
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose?.();
      }
    });
  }
}
