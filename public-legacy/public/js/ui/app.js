import {
  BLUEPRINTS,
  MINEABLE,
  REGIONS,
  SMELT_RECIPES,
  GEAR_SLOTS,
  WEAPON_TYPES,
  WEAPON_PROFILES,
  MAP_W,
  MAP_H,
  STAT_CAP,
} from '../data/catalog.js';
import { t, rarityClass, setLang, getLang } from '../i18n.js';
import {
  canEquipHands,
  createWarrior,
  deployCap,
  dismantleReturn,
  effectiveStats,
  hasMats,
  inventoryCap,
  itemSellValue,
  listResearchable,
  primaryWeaponType,
  rosterCap,
  spendMats,
  addResource,
} from '../game/state.js';
import { formatEta, jobProgress, startCraftJob, startMineJob, startResearch, startSmeltJob, tickJobs } from '../game/jobs.js';
import { writeSave, hasSave, clearSave } from '../game/save.js';
import { startBattle, applyVictoryRewards, findMission } from '../game/battle.js';
import { BattleView } from './battleView.js';

/**
 * App shell — screens: boot | hub | deploy | battle | levelup
 */
export class App {
  constructor(root) {
    this.root = root;
    this.state = null;
    this.screen = 'boot';
    this.hubTab = 'campaign';
    this.battle = null;
    this.battleView = null;
    this.deploy = null;
    this.levelUps = null;
    this.msg = '';
    this.tickTimer = setInterval(() => this.pulse(), 500);
    this.render();
  }

  pulse() {
    if (!this.state) return;
    const done = tickJobs(this.state);
    if (done.length) {
      writeSave(this.state);
      if (this.screen === 'hub') this.render();
    } else if (this.screen === 'hub' && (this.state.mine.jobs.length || this.state.forge.jobs.length || this.state.research.queue)) {
      // update progress bars lightly
      const bars = this.root.querySelectorAll('[data-job-progress]');
      if (bars.length) this.render();
    }
  }

  setMessage(m) {
    this.msg = m;
    setTimeout(() => {
      if (this.msg === m) {
        this.msg = '';
        if (this.screen === 'hub') this.render();
      }
    }, 2500);
  }

  render() {
    if (this.screen === 'boot') return this.renderBoot();
    if (this.screen === 'hub') return this.renderHub();
    if (this.screen === 'deploy') return this.renderDeploy();
    if (this.screen === 'battle') return this.renderBattle();
    if (this.screen === 'levelup') return this.renderLevelUp();
  }

  renderBoot() {
    const cont = hasSave();
    this.root.innerHTML = `
      <div class="screen boot">
        <div class="boot-card">
          <h1>${t('gameTitle')}</h1>
          <p class="tag">${t('tagline')}</p>
          <p class="muted">${t('chooseLang')}</p>
          <div class="actions">
            <button type="button" data-lang="en" class="${getLang() === 'en' ? 'primary' : ''}">English</button>
            <button type="button" data-lang="ru" class="${getLang() === 'ru' ? 'primary' : ''}">Русский</button>
            <hr style="border:none;border-top:1px solid var(--line);margin:0.5rem 0" />
            <button type="button" class="primary" id="btn-new">${t('newGame')}</button>
            <button type="button" id="btn-cont" ${cont ? '' : 'disabled'}>${t('continue')}</button>
          </div>
          <p class="muted" style="margin-top:1rem;font-size:0.85rem">${t('youAreSmith')}</p>
        </div>
      </div>
    `;
    this.root.querySelectorAll('[data-lang]').forEach((b) => {
      b.onclick = () => {
        setLang(b.getAttribute('data-lang'));
        this.render();
      };
    });
    this.root.querySelector('#btn-new').onclick = () => this.newGame();
    this.root.querySelector('#btn-cont').onclick = () => this.continueGame();
  }

  async newGame() {
    if (hasSave() && !confirm(t('saveWarn'))) return;
    const { createInitialState } = await import('../game/state.js');
    this.state = createInitialState(getLang());
    writeSave(this.state);
    this.screen = 'hub';
    this.hubTab = 'campaign';
    this.render();
  }

  async continueGame() {
    const { loadSave } = await import('../game/save.js');
    const s = loadSave();
    if (!s) return;
    this.state = s;
    setLang(s.lang || getLang());
    tickJobs(this.state);
    writeSave(this.state);
    this.screen = 'hub';
    this.render();
  }

  renderHub() {
    const s = this.state;
    const resChips = ['copper_ore', 'iron_ore', 'softwood', 'scrap_hide', 'coal']
      .map((k) => `<span class="resource-chip">${t(k)} <b>${s.resources[k] || 0}</b></span>`)
      .join('');

    this.root.innerHTML = `
      <div class="hub">
        <nav class="hub-nav">
          <div class="hub-brand">${t('gameTitle')}</div>
          ${this.navBtn('campaign', t('campaign'))}
          ${this.navBtn('mine', t('mine'))}
          ${this.navBtn('forge', t('forge'))}
          ${this.navBtn('research', t('research'))}
          ${this.navBtn('barracks', t('barracks'))}
          ${this.navBtn('tavern', t('tavern'))}
          ${this.navBtn('inventory', t('inventory'))}
          <div style="flex:1"></div>
          <button type="button" class="ghost" id="btn-boot">${t('settings')}</button>
        </nav>
        <div class="hub-main">
          <div class="topbar">
            <span class="resource-chip">${t('gold')} <b>${s.gold}</b></span>
            <span class="resource-chip">${t('sparks')} <b>${s.sparks}</b></span>
            ${resChips}
            <span class="resource-chip">${t('inventory')} <b>${s.inventory.length}/${inventoryCap(s)}</b></span>
            ${this.msg ? `<span class="warn">${this.msg}</span>` : ''}
          </div>
          <div class="panel" id="hub-panel"></div>
        </div>
      </div>
    `;
    this.root.querySelectorAll('[data-tab]').forEach((b) => {
      b.onclick = () => {
        this.hubTab = b.getAttribute('data-tab');
        this.render();
      };
    });
    this.root.querySelector('#btn-boot').onclick = () => {
      this.screen = 'boot';
      this.render();
    };
    const panel = this.root.querySelector('#hub-panel');
    if (this.hubTab === 'campaign') this.viewCampaign(panel);
    if (this.hubTab === 'mine') this.viewMine(panel);
    if (this.hubTab === 'forge') this.viewForge(panel);
    if (this.hubTab === 'research') this.viewResearch(panel);
    if (this.hubTab === 'barracks') this.viewBarracks(panel);
    if (this.hubTab === 'tavern') this.viewTavern(panel);
    if (this.hubTab === 'inventory') this.viewInventory(panel);
  }

  navBtn(id, label) {
    return `<button type="button" data-tab="${id}" class="${this.hubTab === id ? 'active' : ''}">${label}</button>`;
  }

  viewCampaign(panel) {
    const s = this.state;
    panel.innerHTML = `
      <div class="panel-header">
        <div>
          <h2>${t('campaign')}</h2>
          <p class="muted">${t('tutorialHint')}</p>
        </div>
        <div class="muted">${t('deployCap')}: ${deployCap(s)} · ${t('rosterCap')}: ${s.warriors.length}/${rosterCap(s)}</div>
      </div>
      <div class="stack"></div>
    `;
    const stack = panel.querySelector('.stack');
    for (const region of REGIONS) {
      const unlocked = s.campaign.unlockedRegions.includes(region.id);
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<h3>${t(region.id)}</h3><p class="muted">${t('story_' + region.id)}</p><div class="stack" style="margin-top:0.5rem"></div>`;
      const inner = card.querySelector('.stack');
      if (!unlocked) {
        inner.innerHTML = `<span class="badge">${t('locked')}</span>`;
      } else {
        for (const m of region.missions) {
          const cleared = s.campaign.cleared[m.id];
          const row = document.createElement('div');
          row.className = 'card';
          row.style.background = '#15110e';
          row.innerHTML = `
            <div class="row" style="justify-content:space-between">
              <div>
                <b>${t(m.id)}</b> ${m.boss ? `<span class="badge">${t('boss')}</span>` : ''}
                ${cleared ? `<span class="muted">✓ ${cleared}</span>` : ''}
                <div class="muted">Foes ${m.enemies} · Lv${m.enemyLvl}</div>
              </div>
              <div class="row">
                <select data-diff>
                  <option value="normal">${t('normal')}</option>
                  <option value="hard">${t('hard')}</option>
                  <option value="brutal">${t('brutal')}</option>
                </select>
                <button type="button" class="primary" data-fight="${m.id}">${t('fight')}</button>
              </div>
            </div>`;
          inner.appendChild(row);
        }
      }
      stack.appendChild(card);
    }
    panel.querySelectorAll('[data-fight]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-fight');
        const sel = btn.parentElement.querySelector('[data-diff]');
        this.beginDeploy(id, sel.value);
      };
    });
  }

  viewMine(panel) {
    const s = this.state;
    const now = Date.now();
    panel.innerHTML = `
      <div class="panel-header">
        <div>
          <h2>${t('mine')}</h2>
          <p class="muted">${t('slots')}: ${s.mine.slots}</p>
        </div>
      </div>
      <h3>${t('queue')}</h3>
      <div class="grid-cards" id="mine-jobs"></div>
      <h3 style="margin-top:1rem">${t('startMine')}</h3>
      <div class="grid-cards" id="mine-res"></div>
      <h3 style="margin-top:1rem">${t('refining')}</h3>
      <div class="grid-cards" id="mine-smelt"></div>
    `;
    const jobs = panel.querySelector('#mine-jobs');
    if (!s.mine.jobs.length) jobs.innerHTML = `<div class="card muted">${t('emptySlot')}</div>`;
    for (const j of s.mine.jobs) {
      const p = Math.round(jobProgress(j, now) * 100);
      const label = j.type === 'mine' ? t(j.resource) : t(SMELT_RECIPES[j.recipeId]?.output || j.recipeId);
      jobs.innerHTML += `<div class="card" data-job-progress>
        <b>${label}</b>
        <div class="muted">${formatEta(j.endsAt - now)}</div>
        <div class="progress"><i style="width:${p}%"></i></div>
      </div>`;
    }
    const resBox = panel.querySelector('#mine-res');
    for (const r of MINEABLE) {
      const lvl = s.mine.levels[r] || 1;
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `<h3>${t(r)}</h3><div class="muted">Lv ${lvl}</div>
        <button type="button" class="primary" style="margin-top:0.5rem">${t('startMine')}</button>`;
      div.querySelector('button').onclick = () => {
        const res = startMineJob(s, r);
        if (!res.ok) this.setMessage(res.err);
        else {
          writeSave(s);
          this.render();
        }
      };
      resBox.appendChild(div);
    }
    const smeltBox = panel.querySelector('#mine-smelt');
    for (const [id, recipe] of Object.entries(SMELT_RECIPES)) {
      const cost = Object.entries(recipe.input)
        .map(([k, n]) => `${t(k)}×${n}`)
        .join(', ');
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `<h3>${t(recipe.output)}</h3>
        <div class="muted">${cost}</div>
        <div class="muted">Have: ${s.resources[recipe.output] || 0}</div>
        <button type="button" style="margin-top:0.5rem" ${hasMats(s, recipe.input) ? '' : 'disabled'}>${t('refining')}</button>`;
      div.querySelector('button').onclick = () => {
        const res = startSmeltJob(s, id);
        if (!res.ok) this.setMessage(t(res.err === 'no_mats' ? 'noMats' : res.err));
        else {
          writeSave(s);
          this.render();
        }
      };
      smeltBox.appendChild(div);
    }
  }

  viewForge(panel) {
    const s = this.state;
    const now = Date.now();
    panel.innerHTML = `
      <div class="panel-header">
        <div>
          <h2>${t('forge')}</h2>
          <p class="muted">${t('slots')}: ${s.forge.slots} ·
            ${Object.entries(s.forge.branches)
              .map(([k, b]) => `${k} ${b.level}`)
              .join(' · ')}
          </p>
        </div>
      </div>
      <div class="grid-cards" id="forge-jobs"></div>
      <div class="grid-cards" id="forge-bps" style="margin-top:1rem"></div>
    `;
    const jobs = panel.querySelector('#forge-jobs');
    if (!s.forge.jobs.length) jobs.innerHTML = `<div class="card muted">${t('emptySlot')}</div>`;
    for (const j of s.forge.jobs) {
      const p = Math.round(jobProgress(j, now) * 100);
      jobs.innerHTML += `<div class="card" data-job-progress>
        <b>${j.blueprintId}</b>
        <div class="muted">${formatEta(j.endsAt - now)}</div>
        <div class="progress"><i style="width:${p}%"></i></div>
      </div>`;
    }
    const box = panel.querySelector('#forge-bps');
    for (const bp of Object.values(BLUEPRINTS)) {
      const open = s.research.unlocked.includes(bp.id);
      const cost = Object.entries(bp.cost || {})
        .map(([k, n]) => `${t(k)}×${n}`)
        .join(', ');
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `
        <h3>${bp.id.replace('bp_', '')} <span class="badge">${bp.branch}</span></h3>
        <div class="muted">${open ? t('unlocked') : t('locked')} · T${bp.tier}</div>
        <div class="muted">${cost}</div>
        <div class="muted">${Object.entries(bp.base || {})
          .map(([k, v]) => `${k} ${v}`)
          .join(', ')}</div>
        <button type="button" class="primary" style="margin-top:0.5rem" ${open && hasMats(s, bp.cost) ? '' : 'disabled'}>${t('craft')}</button>`;
      div.querySelector('button').onclick = () => {
        const res = startCraftJob(s, bp.id);
        if (!res.ok) {
          if (res.err === 'no_mats') this.setMessage(t('noMats'));
          else if (res.err === 'inv_full') this.setMessage(t('invFull'));
          else this.setMessage(res.err);
        } else {
          writeSave(s);
          this.render();
        }
      };
      box.appendChild(div);
    }
  }

  viewResearch(panel) {
    const s = this.state;
    const list = listResearchable(s);
    const q = s.research.queue;
    panel.innerHTML = `
      <div class="panel-header"><h2>${t('research')}</h2></div>
      <div class="card" style="margin-bottom:1rem">
        ${
          q
            ? `${t('researching')}: <b>${q.blueprintId}</b> · ${formatEta(q.endsAt - Date.now())}
               <div class="progress" data-job-progress><i style="width:${Math.round(jobProgress(q) * 100)}%"></i></div>`
            : `<span class="muted">${t('emptySlot')}</span>`
        }
      </div>
      <div class="grid-cards" id="tech-list"></div>
    `;
    const box = panel.querySelector('#tech-list');
    for (const tech of list) {
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `<h3>${tech.blueprintId}</h3>
        <div class="muted">${t('gold')}: ${tech.gold}</div>
        <button type="button" class="primary" ${s.research.queue || s.gold < tech.gold ? 'disabled' : ''}>${t('researchStart')}</button>`;
      div.querySelector('button').onclick = () => {
        const res = startResearch(s, tech);
        if (!res.ok) this.setMessage(res.err === 'no_gold' ? t('noGold') : res.err);
        else {
          writeSave(s);
          this.render();
        }
      };
      box.appendChild(div);
    }
    if (!list.length) box.innerHTML = `<div class="card muted">OK</div>`;
  }

  viewBarracks(panel) {
    const s = this.state;
    panel.innerHTML = `
      <div class="panel-header">
        <div>
          <h2>${t('barracks')}</h2>
          <p class="muted">${t('deployCap')} ${deployCap(s)} · ${t('rosterCap')} ${rosterCap(s)} · Lv ${s.barracksLevel}</p>
        </div>
      </div>
      <div class="stack" id="war-list"></div>
    `;
    const list = panel.querySelector('#war-list');
    for (const w of s.warriors) {
      const st = effectiveStats(w, s.items);
      const wt = primaryWeaponType(w, s.items);
      const stars = w.mastery[wt]?.stars || 0;
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `
        <div class="row" style="justify-content:space-between">
          <div>
            <h3 class="${rarityClass(w.rarity)}">${w.name}</h3>
            <div class="muted">${t('level')} ${w.level} · ${t(wt)} ★${stars} · <span class="${rarityClass(w.rarity)}">${t(w.rarity)}</span></div>
            <div class="muted">${t('hp')} ${st.hp} · ${t('atk')} ${st.atk} · ${t('def')} ${st.def} · ${t('spd')} ${st.spd} · ${t('acc')} ${st.acc}</div>
            <div class="muted">${t('mastery')}: ${WEAPON_TYPES.map((k) => `${k[0]}${w.mastery[k]?.stars || 0}`).join(' ')}</div>
          </div>
          <div class="stack">
            <input data-rename value="${w.name}" style="background:#110e0c;border:1px solid var(--line);border-radius:4px;padding:0.35rem;color:inherit" />
            <button type="button" data-save-name>${t('rename')}</button>
            <select data-slot>
              ${GEAR_SLOTS.map((slot) => `<option value="${slot}">${t(slot)}: ${w.equip[slot] ? (s.items[w.equip[slot]]?.blueprintId || '') : t('none')}</option>`).join('')}
            </select>
            <select data-item>
              <option value="">${t('none')}</option>
              ${s.inventory
                .map((id) => s.items[id])
                .filter(Boolean)
                .map((it) => `<option value="${it.id}">${it.blueprintId} (${t(it.rarity)})</option>`)
                .join('')}
            </select>
            <button type="button" class="primary" data-equip>${t('equip')}</button>
            <button type="button" data-unequip>${t('unequip')}</button>
          </div>
        </div>`;
      div.querySelector('[data-save-name]').onclick = () => {
        w.name = div.querySelector('[data-rename]').value.slice(0, 16) || w.name;
        writeSave(s);
        this.render();
      };
      div.querySelector('[data-equip]').onclick = () => {
        const slot = div.querySelector('[data-slot]').value;
        const itemId = div.querySelector('[data-item]').value;
        if (!itemId) return;
        const item = s.items[itemId];
        if (!item || item.slot !== slot) {
          this.setMessage('slot');
          return;
        }
        if (!canEquipHands(w, item, s.items)) {
          this.setMessage('2H/offhand');
          return;
        }
        for (const ow of s.warriors) {
          for (const sl of GEAR_SLOTS) {
            if (ow.equip[sl] === itemId) ow.equip[sl] = null;
          }
        }
        w.equip[slot] = itemId;
        if (item.slot === 'weapon' && WEAPON_PROFILES[item.weaponType]?.hands === 2) {
          w.equip.offhand = null;
        }
        writeSave(s);
        this.render();
      };
      div.querySelector('[data-unequip]').onclick = () => {
        const slot = div.querySelector('[data-slot]').value;
        w.equip[slot] = null;
        writeSave(s);
        this.render();
      };
      list.appendChild(div);
    }
  }

  viewTavern(panel) {
    const s = this.state;
    const costGold = 40 + s.warriors.length * 15;
    const costSpark = 1;
    panel.innerHTML = `
      <div class="panel-header">
        <div>
          <h2>${t('tavern')}</h2>
          <p class="muted">${t('rosterCap')}: ${s.warriors.length}/${rosterCap(s)}</p>
        </div>
      </div>
      <div class="grid-cards">
        <div class="card">
          <h3>${t('hire')} — ${t('gold')}</h3>
          <p class="muted">${costGold} ${t('gold')} · same pool</p>
          <button type="button" class="primary" id="hire-g" ${s.gold < costGold || s.warriors.length >= rosterCap(s) ? 'disabled' : ''}>${t('hire')}</button>
        </div>
        <div class="card">
          <h3>${t('hire')} — ${t('sparks')}</h3>
          <p class="muted">${costSpark} ${t('sparks')}</p>
          <button type="button" id="hire-s" ${s.sparks < costSpark || s.warriors.length >= rosterCap(s) ? 'disabled' : ''}>${t('hire')}</button>
        </div>
      </div>
    `;
    const hire = (pay) => {
      if (s.warriors.length >= rosterCap(s)) return;
      if (pay === 'gold') {
        if (s.gold < costGold) return this.setMessage(t('noGold'));
        s.gold -= costGold;
      } else {
        if (s.sparks < costSpark) return;
        s.sparks -= costSpark;
      }
      const w = createWarrior({ lang: getLang() });
      s.warriors.push(w);
      writeSave(s);
      this.hubTab = 'barracks';
      this.render();
    };
    panel.querySelector('#hire-g').onclick = () => hire('gold');
    panel.querySelector('#hire-s').onclick = () => hire('sparks');
  }

  viewInventory(panel) {
    const s = this.state;
    panel.innerHTML = `
      <div class="panel-header"><h2>${t('inventory')}</h2></div>
      <table class="table"><thead><tr>
        <th>Item</th><th>${t('c')}</th><th>Stats</th><th></th>
      </tr></thead><tbody id="inv-body"></tbody></table>
    `;
    const body = panel.querySelector('#inv-body');
    for (const id of s.inventory) {
      const it = s.items[id];
      if (!it) continue;
      const equipped = s.warriors.some((w) => GEAR_SLOTS.some((sl) => w.equip[sl] === id));
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${it.blueprintId}</td>
        <td class="${rarityClass(it.rarity)}">${t(it.rarity)}</td>
        <td class="muted">${Object.entries(it.stats)
          .map(([k, v]) => `${k}+${v}`)
          .join(' ')}</td>
        <td class="row">
          <button type="button" data-sell ${equipped ? 'disabled' : ''}>${t('sell')} (${itemSellValue(it)})</button>
          <button type="button" data-dis ${equipped ? 'disabled' : ''}>${t('dismantle')}</button>
        </td>`;
      tr.querySelector('[data-sell]').onclick = () => {
        s.gold += itemSellValue(it);
        s.inventory = s.inventory.filter((x) => x !== id);
        delete s.items[id];
        writeSave(s);
        this.render();
      };
      tr.querySelector('[data-dis]').onclick = () => {
        const ret = dismantleReturn(it);
        for (const [k, n] of Object.entries(ret)) addResource(s, k, n);
        s.inventory = s.inventory.filter((x) => x !== id);
        delete s.items[id];
        writeSave(s);
        this.render();
      };
      body.appendChild(tr);
    }
  }

  beginDeploy(missionId, difficulty) {
    const cap = deployCap(this.state);
    this.deploy = {
      missionId,
      difficulty,
      selected: this.state.warriors.slice(0, cap).map((w) => w.id),
      positions: {},
    };
    // default positions in left 3 columns
    this.deploy.selected.forEach((id, i) => {
      this.deploy.positions[id] = { x: 1, y: Math.min(9, 1 + i) };
    });
    this.screen = 'deploy';
    this.render();
  }

  renderDeploy() {
    const s = this.state;
    const cap = deployCap(s);
    const d = this.deploy;
    this.root.innerHTML = `
      <div class="screen" style="padding:1rem">
        <div class="panel-header">
          <div>
            <h2>${t('fight')}: ${t(d.missionId)}</h2>
            <p class="muted">${d.difficulty} · pick up to ${cap}, click tiles col 0-2</p>
          </div>
          <div class="row">
            <button type="button" id="dep-back">${t('backHub')}</button>
            <button type="button" class="primary" id="dep-go">${t('fight')}</button>
          </div>
        </div>
        <div class="row" style="align-items:flex-start;gap:1rem">
          <div class="stack" style="min-width:220px" id="dep-list"></div>
          <canvas id="dep-canvas" width="400" height="200" style="border:1px solid var(--line);background:#10130f"></canvas>
        </div>
      </div>
    `;
    const list = this.root.querySelector('#dep-list');
    for (const w of s.warriors) {
      const on = d.selected.includes(w.id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = on ? 'primary' : '';
      b.textContent = `${on ? '✓ ' : ''}${w.name} (${t(primaryWeaponType(w, s.items))})`;
      b.onclick = () => {
        if (on) d.selected = d.selected.filter((x) => x !== w.id);
        else if (d.selected.length < cap) {
          d.selected.push(w.id);
          if (!d.positions[w.id]) d.positions[w.id] = { x: 1, y: d.selected.length };
        }
        this.render();
      };
      list.appendChild(b);
    }
    this.root.querySelector('#dep-back').onclick = () => {
      this.screen = 'hub';
      this.render();
    };
    this.root.querySelector('#dep-go').onclick = () => this.launchBattle();

    const canvas = this.root.querySelector('#dep-canvas');
    const ctx = canvas.getContext('2d');
    const cell = 20;
    canvas.width = MAP_W * cell;
    canvas.height = MAP_H * cell;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        ctx.fillStyle = x < 3 ? '#1a2830' : '#152018';
        ctx.fillRect(x * cell, y * cell, cell, cell);
        ctx.strokeStyle = '#0005';
        ctx.strokeRect(x * cell, y * cell, cell, cell);
      }
    }
    d.selected.forEach((id, i) => {
      const p = d.positions[id] || { x: 1, y: i };
      ctx.fillStyle = '#4a8fd4';
      ctx.fillRect(p.x * cell + 3, p.y * cell + 3, cell - 6, cell - 6);
    });
    let placing = d.selected[0];
    canvas.onclick = (e) => {
      const r = canvas.getBoundingClientRect();
      const x = Math.floor(((e.clientX - r.left) / r.width) * MAP_W);
      const y = Math.floor(((e.clientY - r.top) / r.height) * MAP_H);
      if (x > 2) return;
      if (!placing) placing = d.selected[0];
      // cycle place selection
      const occupied = Object.entries(d.positions).find(([, p]) => p.x === x && p.y === y);
      if (occupied) {
        placing = occupied[0];
        return;
      }
      if (placing) d.positions[placing] = { x, y };
      // next unplaced
      const idx = d.selected.indexOf(placing);
      placing = d.selected[(idx + 1) % d.selected.length];
      this.render();
    };
  }

  launchBattle() {
    const d = this.deploy;
    if (!d.selected.length) return;
    const positions = d.selected.map((id) => d.positions[id] || { x: 1, y: 1 });
    this.battle = startBattle(this.state, d.missionId, d.difficulty, d.selected, positions);
    if (!this.battle) return;
    this.screen = 'battle';
    this.render();
  }

  renderBattle() {
    if (this.battleView) this.battleView.destroy();
    this.root.innerHTML = `<div id="battle-root"></div>`;
    const mount = this.root.querySelector('#battle-root');
    this.battleView = new BattleView(mount, this.battle, (ev) => {
      if (ev === 'forfeit') {
        this.battle.mode = 'defeat';
        this.endBattle();
      }
      if (ev === 'victory' || ev === 'defeat') this.endBattle();
    });
    this.battleView.refresh();
  }

  endBattle() {
    if (this.battleView) this.battleView.destroy();
    this.battleView = null;
    if (this.battle.mode === 'victory') {
      const { levelUps } = applyVictoryRewards(this.state, this.battle);
      writeSave(this.state);
      if (levelUps.some((l) => l.freePoints > 0)) {
        this.levelUps = levelUps;
        this.screen = 'levelup';
      } else {
        this.screen = 'hub';
        this.setMessage(t('victory'));
      }
    } else {
      // free retry — return hub
      this.screen = 'hub';
      this.setMessage(t('defeat'));
    }
    this.battle = null;
    this.render();
  }

  renderLevelUp() {
    const s = this.state;
    const pending = s.warriors.filter((w) => w.freePoints > 0);
    if (!pending.length) {
      this.screen = 'hub';
      this.render();
      return;
    }
    const w = pending[0];
    const keys = ['hp', 'atk', 'def', 'spd', 'acc', 'eva', 'crit', 'blk', 'sta'];
    this.root.innerHTML = `
      <div class="screen boot">
        <div class="boot-card" style="width:min(520px,100%)">
          <h2>${t('levelUp')} — ${w.name}</h2>
          <p class="muted">${t('level')} ${w.level} · ${t('pointsLeft')}: <b id="pts">${w.freePoints}</b></p>
          <div class="stack" id="pts-list"></div>
          <button type="button" class="primary" id="pts-ok" style="margin-top:1rem">${t('confirm')}</button>
        </div>
      </div>
    `;
    const list = this.root.querySelector('#pts-list');
    for (const k of keys) {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.justifyContent = 'space-between';
      row.innerHTML = `<span>${t(k)} (${w.points[k] || 0})</span>
        <button type="button" data-k="${k}">+1</button>`;
      row.querySelector('button').onclick = () => {
        if (w.freePoints <= 0) return;
        if ((w.base[k] || 0) + (w.points[k] || 0) >= STAT_CAP && k !== 'hp' && k !== 'sta') return;
        w.points[k] = (w.points[k] || 0) + 1;
        w.freePoints -= 1;
        this.root.querySelector('#pts').textContent = w.freePoints;
      };
      list.appendChild(row);
    }
    this.root.querySelector('#pts-ok').onclick = () => {
      writeSave(s);
      this.renderLevelUp();
    };
  }
}
