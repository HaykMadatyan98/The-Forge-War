import { App } from './ui/app.js';
import { setLang } from './i18n.js';
import { loadSave } from './game/save.js';

// Dev helpers: ?dev=1
const params = new URLSearchParams(location.search);
if (params.get('dev') === '1') {
  window.__TFW_DEV__ = {
    give(state) {
      state.gold += 9999;
      for (const k of Object.keys(state.resources)) state.resources[k] = (state.resources[k] || 0) + 50;
      state.sparks += 5;
    },
  };
  console.info('[TFW] dev mode: window.__TFW_DEV__');
}

const saved = loadSave();
if (saved?.lang) setLang(saved.lang);

const root = document.getElementById('app');
// eslint-disable-next-line no-new
new App(root);
