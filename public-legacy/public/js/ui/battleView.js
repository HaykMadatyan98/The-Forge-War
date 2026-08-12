import { MAP_W, MAP_H } from '../data/catalog.js';
import {
  attackPreview,
  getActive,
  moveRange,
  tryMove,
  tryAttack,
  endUnitTurn,
  runEnemyAi,
  visibleTiles,
} from '../game/battle.js';
import { canAttack as canAtk } from '../game/combat.js';
import { t } from '../i18n.js';

export class BattleView {
  /**
   * @param {HTMLElement} root
   * @param {object} battle
   * @param {(ev:string, data?:any)=>void} onEvent
   */
  constructor(root, battle, onEvent) {
    this.root = root;
    this.battle = battle;
    this.onEvent = onEvent;
    this.hover = null;
    this.reach = null;
    this.cell = 36;
    this._bind();
    this.renderShell();
    this.draw();
    this._aiTimer = null;
    this.maybeAi();
  }

  _bind() {
    this.root.innerHTML = '';
  }

  renderShell() {
    this.root.innerHTML = `
      <div class="battle-wrap">
        <div class="battle-stage">
          <div class="battle-toolbar">
            <strong id="bt-active"></strong>
            <span class="muted" id="bt-round"></span>
            <span class="muted" id="bt-preview"></span>
            <span style="flex:1"></span>
            <button type="button" id="bt-end">${t('endTurn')}</button>
            <button type="button" class="ghost" id="bt-forfeit">${t('forfeit')}</button>
          </div>
          <canvas id="battle-canvas" width="800" height="400"></canvas>
        </div>
        <div class="battle-side">
          <div>
            <h3>${t('squad')}</h3>
            <div class="unit-list" id="bt-units"></div>
          </div>
          <div>
            <h3>${t('log')}</h3>
            <div class="log" id="bt-log"></div>
          </div>
        </div>
      </div>
    `;
    this.canvas = this.root.querySelector('#battle-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.root.querySelector('#bt-end').onclick = () => {
      endUnitTurn(this.battle);
      this.afterAction();
    };
    this.root.querySelector('#bt-forfeit').onclick = () => this.onEvent('forfeit');

    this.canvas.addEventListener('mousemove', (e) => this.onMove(e));
    this.canvas.addEventListener('click', (e) => this.onClick(e));
    this.canvas.addEventListener('mouseleave', () => {
      this.hover = null;
      this.draw();
    });
  }

  resize() {
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth;
    const h = Math.max(320, parent.clientHeight - 48);
    this.cell = Math.floor(Math.min(w / MAP_W, h / MAP_H));
    this.canvas.width = this.cell * MAP_W;
    this.canvas.height = this.cell * MAP_H;
    this.draw();
  }

  tileAt(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * MAP_W);
    const y = Math.floor(((e.clientY - r.top) / r.height) * MAP_H);
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
    return { x, y };
  }

  onMove(e) {
    this.hover = this.tileAt(e);
    this.updatePreview();
    this.draw();
  }

  updatePreview() {
    const el = this.root.querySelector('#bt-preview');
    const active = getActive(this.battle);
    if (!el || !this.hover || !active || active.team !== 'player') {
      if (el) el.textContent = '';
      return;
    }
    const target = this.battle.units.find((u) => u.x === this.hover.x && u.y === this.hover.y && u.hp > 0);
    if (target && target.team === 'enemy') {
      const p = attackPreview(this.battle, active, target);
      if (p) el.textContent = `${t('hitPreview')} ${p.hit}% · ${t('dmgPreview')} ~${p.avgDmg}`;
      else el.textContent = '';
    } else el.textContent = '';
  }

  onClick(e) {
    if (this.battle.mode !== 'play') return;
    const active = getActive(this.battle);
    if (!active || active.team !== 'player') return;
    const tile = this.tileAt(e);
    if (!tile) return;

    const target = this.battle.units.find((u) => u.x === tile.x && u.y === tile.y && u.hp > 0);
    if (target && target.team === 'enemy') {
      const res = tryAttack(this.battle, active, target);
      if (res.ok) {
        if (active.acted) {
          endUnitTurn(this.battle);
          this.afterAction();
        } else this.refresh();
      }
      return;
    }
    if (!target) {
      if (tryMove(this.battle, active, tile.x, tile.y)) this.refresh();
    }
  }

  afterAction() {
    this.refresh();
    if (this.battle.mode === 'victory') this.onEvent('victory');
    else if (this.battle.mode === 'defeat') this.onEvent('defeat');
    else this.maybeAi();
  }

  maybeAi() {
    clearTimeout(this._aiTimer);
    const active = getActive(this.battle);
    if (!active || this.battle.mode !== 'play') return;
    if (active.team === 'enemy') {
      this._aiTimer = setTimeout(() => {
        runEnemyAi(this.battle);
        this.afterAction();
      }, 350);
    } else {
      this.computeReach();
    }
  }

  computeReach() {
    const active = getActive(this.battle);
    if (active && active.team === 'player' && !active.acted) {
      this.reach = moveRange(active, this.battle.map, this.battle.units);
    } else this.reach = null;
  }

  refresh() {
    this.computeReach();
    this.updateHeader();
    this.updateLists();
    this.draw();
  }

  updateHeader() {
    const active = getActive(this.battle);
    const a = this.root.querySelector('#bt-active');
    const r = this.root.querySelector('#bt-round');
    if (a) a.textContent = active ? `${t('yourTurn')}: ${active.name}` : '';
    if (r) r.textContent = `R${this.battle.round}`;
  }

  updateLists() {
    const box = this.root.querySelector('#bt-units');
    const log = this.root.querySelector('#bt-log');
    const active = getActive(this.battle);
    if (box) {
      box.innerHTML = this.battle.units
        .filter((u) => u.team === 'player' || u.hp > 0)
        .map((u) => {
          const pct = Math.round((u.hp / u.maxHp) * 100);
          return `<div class="unit-pill ${active && active.id === u.id ? 'active' : ''}">
            <div><b>${u.name}</b> <span class="muted">${u.team === 'enemy' ? 'E' : 'P'} · ${u.weaponType}</span></div>
            <div class="hpbar"><i style="width:${pct}%;background:${u.team === 'enemy' ? 'var(--bad)' : 'var(--good)'}"></i></div>
          </div>`;
        })
        .join('');
    }
    if (log) log.innerHTML = this.battle.log.map((l) => `<div>${l}</div>`).join('');
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const c = this.cell;
    const vis = visibleTiles(this.battle);
    const reachSet = new Set((this.reach?.reach || []).map((p) => `${p.x},${p.y}`));
    const active = getActive(this.battle);

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const cell = this.battle.map[y][x];
        const key = `${x},${y}`;
        const seen = vis.has(key);
        let col = cell.block ? '#2a2218' : cell.moveCost > 1 ? '#1c2a18' : '#1a2218';
        if (cell.height === 1) col = '#2a3020';
        if (cell.height >= 2) col = '#3a4830';
        if (cell.cover === 1) col = '#243028';
        if (cell.cover === 2) col = '#2c3830';
        if (!seen) col = '#0a0a0a';
        ctx.fillStyle = col;
        ctx.fillRect(x * c, y * c, c, c);
        ctx.strokeStyle = '#0006';
        ctx.strokeRect(x * c, y * c, c, c);
        if (seen && reachSet.has(key) && active?.team === 'player') {
          ctx.fillStyle = '#d4a04a33';
          ctx.fillRect(x * c, y * c, c, c);
        }
        // deploy tint
        if (x < 3) {
          ctx.fillStyle = '#4a7ac810';
          ctx.fillRect(x * c, y * c, c, c);
        }
      }
    }

    // attack range ring
    if (active && active.team === 'player' && !active.acted) {
      for (const u of this.battle.units) {
        if (u.team !== 'enemy' || u.hp <= 0) continue;
        if (!vis.has(`${u.x},${u.y}`)) continue;
        if (canAtk(active, u, this.battle.map, active.weaponType)) {
          ctx.strokeStyle = '#c45c26aa';
          ctx.lineWidth = 2;
          ctx.strokeRect(u.x * c + 2, u.y * c + 2, c - 4, c - 4);
        }
      }
    }

    for (const u of this.battle.units) {
      if (u.hp <= 0) {
        // body blocks — draw fallen marker
        if (!vis.has(`${u.x},${u.y}`)) continue;
        ctx.fillStyle = '#4448';
        ctx.beginPath();
        ctx.arc(u.x * c + c / 2, u.y * c + c / 2, c * 0.22, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (u.team === 'enemy' && !vis.has(`${u.x},${u.y}`)) continue;
      const isAct = active && active.id === u.id;
      ctx.fillStyle = u.team === 'player' ? '#4a8fd4' : u.isBoss ? '#a33' : '#b45a3a';
      const pad = isAct ? 3 : 5;
      ctx.fillRect(u.x * c + pad, u.y * c + pad, c - pad * 2, c - pad * 2);
      if (isAct) {
        ctx.strokeStyle = '#f0d080';
        ctx.lineWidth = 2;
        ctx.strokeRect(u.x * c + 2, u.y * c + 2, c - 4, c - 4);
        // soft camera pan: scroll parent — skipped for canvas centering
      }
      // hp
      const hpW = (c - 8) * (u.hp / u.maxHp);
      ctx.fillStyle = '#0008';
      ctx.fillRect(u.x * c + 4, u.y * c + c - 7, c - 8, 3);
      ctx.fillStyle = u.team === 'player' ? '#6a9a4e' : '#c45c26';
      ctx.fillRect(u.x * c + 4, u.y * c + c - 7, hpW, 3);
    }

    if (this.hover && vis.has(`${this.hover.x},${this.hover.y}`)) {
      ctx.strokeStyle = '#fff8';
      ctx.lineWidth = 1;
      ctx.strokeRect(this.hover.x * c + 1, this.hover.y * c + 1, c - 2, c - 2);
    }

    this.updateHeader();
    this.updateLists();
  }

  destroy() {
    clearTimeout(this._aiTimer);
  }
}
