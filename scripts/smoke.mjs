import { createInitialState, createItemFromBlueprint } from '../public-legacy/public/js/game/state.js';
import { startMineJob, tickJobs, startCraftJob } from '../public-legacy/public/js/game/jobs.js';
import { startBattle, getActive } from '../public-legacy/public/js/game/battle.js';
import { masteryMult } from '../public-legacy/public/js/game/combat.js';

const s = createInitialState('en');
startMineJob(s, 'copper_ore');
s.mine.jobs[0].endsAt = Date.now() - 1;
tickJobs(s);
s.resources.copper_bar = 10;
s.resources.scrap_leather = 5;
const craft = startCraftJob(s, 'bp_copper_sword');
if (craft.ok) { s.forge.jobs[0].endsAt = Date.now() - 1; tickJobs(s); }
const b = startBattle(s, 'fields_1', 'normal', s.warriors.map(w => w.id).slice(0,2), [{x:1,y:2},{x:1,y:4}]);
if (!b || !getActive(b)) throw new Error('battle');
console.log('smoke OK (legacy engine mirror)', { units: b.units.length, mult: masteryMult(10) });
