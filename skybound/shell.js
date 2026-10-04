import { SaveStore } from './saves.js';
import { LEVELS } from './levels.js';
import { ROOST_EMBLEM_GOAL } from './campaign.js';
import { ACTIONS, DEFAULT_BINDINGS, DEFAULT_PAD_BINDINGS, getGestureEnabled, setGestureEnabled, getLeftHanded, setLeftHanded } from './input.js';

const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
};
/* Lucide v1.8.0 Pause, Volume2, VolumeX. ISC License.
 * Copyright (c) 2026 Lucide Icons and Contributors
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
const volumePath = 'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z';
const HUD_ICONS = {
  pause: [['rect', {x:14, y:3, width:5, height:18, rx:1}], ['rect', {x:5, y:3, width:5, height:18, rx:1}]],
  'volume-2': [['path', {d:volumePath}], ['path', {d:'M16 9a5 5 0 0 1 0 6'}], ['path', {d:'M19.364 18.364a9 9 0 0 0 0-12.728'}]],
  'volume-x': [['path', {d:volumePath}], ['line', {x1:22, x2:16, y1:9, y2:15}], ['line', {x1:16, x2:22, y1:9, y2:15}]]
};
const hudIcon = name => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({viewBox:'0 0 24 24', width:20, height:20, fill:'none', stroke:'currentColor', 'stroke-width':2, 'stroke-linecap':'round', 'stroke-linejoin':'round', 'aria-hidden':'true', focusable:'false', class:`lucide lucide-${name}`})) svg.setAttribute(key, String(value));
  for (const [tag, attributes] of HUD_ICONS[name]) {
    const shape = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, String(value));
    svg.append(shape);
  }
  return svg;
};
const array = value => Array.isArray(value) ? value : [value];
const keyName = code => String(code).replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '').replace('Space', 'Spacebar');
const padName = value => ({0:'A / Cross', 1:'B / Circle', 2:'X / Square', 3:'Y / Triangle', 4:'LB / L1', 5:'RB / R1', 6:'LT / L2', 7:'RT / R2', 8:'Select', 9:'Start', 12:'D-pad Up', 13:'D-pad Down', 14:'D-pad Left', 15:'D-pad Right'}[value] || `Button ${value}`);
const ASSISTS = {extraHealth:'Extra health', reducedDamage:'Reduced damage', toggleGlide:'Toggle glide'};
const playtimeLabel = value => {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
};

export class Shell {
  constructor({onStart, onTitleStart, onResume, onRestart, onExit, onSettings} = {}) {
    this.callbacks = {onStart, onTitleStart, onResume, onRestart, onExit, onSettings};
    this.overlay = document.getElementById('overlay');
    this.hud = document.getElementById('hud');
    this.toast = document.getElementById('toast');
    this.chapterCard = document.getElementById('chapter-card');
    this.activeSlot = null;
    this.titleStarted = false;
    this.view = '';
    this.capture = null;
    this.settings = SaveStore.getSettings();
    this.listeners = [];
    this.listen(window, 'skybound:navigate', event => this.navigate(event.detail?.actions || []));
    this.listen(window, 'skybound:binding', event => this.captureBinding(event.detail));
    this.listen(document, 'keydown', event => this.trapTab(event));
    const pause = document.getElementById('pause-button');
    if (pause) {
      pause.replaceChildren(hudIcon('pause'));
      this.listen(pause, 'click', () => window.dispatchEvent(new CustomEvent('skybound:pause', {detail:{reason:'button'}})));
    }
    const sound = document.getElementById('sound-button');
    if (sound) this.listen(sound, 'click', () => window.dispatchEvent(new CustomEvent('skybound:audio', {detail:{source:'button'}})));
    this.listen(window, 'skybound:audio-state', event => {
      if (typeof event.detail?.muted === 'boolean') this.updateAudioState(event.detail.muted);
    });
    this.listen(window, 'skybound:settings', event => {
      if (typeof event.detail?.muted === 'boolean') this.updateAudioState(event.detail.muted);
    });
    this.updateAudioState(Boolean(this.settings.muted));
    window.dispatchEvent(new CustomEvent('skybound:settings', {detail:this.settings}));
  }

  listen(target, type, callback) {
    target.addEventListener(type, callback);
    this.listeners.push(() => target.removeEventListener(type, callback));
  }
  invoke(name, ...args) { return this.callbacks[name]?.(...args); }
  safely(action) {
    try { return action(); } catch (error) { this.showToast(error?.message || 'Could not complete that action.'); return undefined; }
  }
  slotIndex(slot) {
    if (Number.isInteger(slot) && slot >= 0 && slot < 3) return slot;
    if (slot && typeof slot === 'object') {
      const index = SaveStore.slots().findIndex(saved => saved && (saved === slot || (saved.name === slot.name && saved.updatedAt === slot.updatedAt)));
      if (index >= 0) return index;
    }
    return this.activeSlot ?? 0;
  }
  button(text, action, className = '', label = '') {
    const button = node('button', className, text);
    button.type = 'button';
    if (label) { button.setAttribute('aria-label', label); button.title = label; }
    button.addEventListener('click', () => this.safely(action));
    return button;
  }
  open(view, heading, {title = false, settings = false} = {}) {
    this.capture = null;
    this.view = view;
    this.overlay.replaceChildren();
    this.overlay.hidden = false;
    this.overlay.className = title ? 'title' : '';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', heading);
    document.body.classList.add('menu-open');
    this.hud.hidden = true;
    window.dispatchEvent(new CustomEvent('skybound:menu', {detail:{open:true, view}}));
    const menu = node('div', settings ? 'menu settings-menu' : 'menu');
    if (!title) menu.append(node('h1', 'menu-heading', heading));
    this.overlay.append(menu);
    requestAnimationFrame(() => {
      if (this.view === view && !this.overlay.hidden) this.focusables()[0]?.focus({preventScroll:true});
    });
    return menu;
  }
  hide() {
    this.capture = null;
    this.view = '';
    this.overlay.hidden = true;
    this.overlay.replaceChildren();
    document.body.classList.remove('menu-open');
    this.hud.hidden = false;
    if (this.overlay.contains(document.activeElement)) document.activeElement.blur();
    window.dispatchEvent(new CustomEvent('skybound:menu', {detail:{open:false}}));
  }
  showTitle() {
    const menu = this.open('title', "Boco's World: Skybound", {title:true});
    const heading = node('h1', 'wordmark', "Boco's World");
    heading.append(node('small', '', 'SKYBOUND'));
    menu.append(heading);
    const actions = node('div', 'menu-actions');
    if (this.titleStarted) actions.append(this.button('Play', () => this.showSlots(), 'primary'));
    else actions.append(this.button('Start', async () => {
      await this.invoke('onTitleStart');
      this.startTitle();
    }, 'primary'));
    actions.append(this.button('Settings', () => this.showSettings(() => this.showTitle(), false)));
    menu.append(actions);
  }
  startTitle() {
    if (this.titleStarted) return;
    this.titleStarted = true;
    if (this.view === 'title') this.showTitle();
  }
  showSlots() {
    const menu = this.open('slots', 'Choose a Save');
    SaveStore.slots().forEach((slot, index) => {
      const row = node('div', 'slot-row');
      const main = this.button('', () => {
        this.activeSlot = index;
        if (slot) this.showWorld(index);
        else {
          const created = SaveStore.create(index);
          if (created) {
            this.showOpening(index);
            if (SaveStore.storageAvailable === false) this.showToast('Storage unavailable. Export from Saves to keep progress.');
          }
        }
      }, 'slot-main');
      main.append(node('strong', '', `${index + 1}  ${slot ? slot.name : 'New Game'}`));
      if (slot) {
        const area = LEVELS[slot.area]?.name || 'Skybound';
        const checkpoint = LEVELS[slot.area]?.checkpoints.find(point => point.id === slot.checkpoint);
        const summary = node('small', 'slot-summary');
        const emblems = Math.min(ROOST_EMBLEM_GOAL, slot.emblems?.length || 0);
        for (const text of [area, `${emblems}/${ROOST_EMBLEM_GOAL} emblems`, ...(emblems >= ROOST_EMBLEM_GOAL ? ['Wind Crest'] : []), `Time ${playtimeLabel(slot.playtime)}`, checkpoint?.name || (slot.checkpoint ? 'Checkpoint saved' : 'Area start'), ...(slot.completed ? ['Complete'] : [])]) summary.append(node('span', '', text), document.createTextNode(' '));
        main.append(summary);
      } else main.append(node('small', '', 'Empty'));
      const tools = node('div', 'slot-tools');
      tools.append(this.button('↑', () => this.importSlot(index), '', `Import save into slot ${index + 1}`));
      if (slot) tools.append(
        this.button('↓', () => this.exportSlot(index), '', `Export slot ${index + 1}`),
        this.button('×', () => this.confirmDelete(index), 'danger', `Delete slot ${index + 1}`)
      );
      row.append(main, tools);
      menu.append(row);
    });
    if (SaveStore.storageAvailable === false || SaveStore.available === false) menu.append(node('p', 'menu-note', 'Storage unavailable. Export to keep your save.'));
    else if (SaveStore.storageError) menu.append(node('p', 'menu-note', 'Previous saves could not be read.'));
    const actions = node('div', 'menu-actions');
    actions.append(this.button('Back', () => this.showTitle()));
    menu.append(actions);
  }
  confirmDelete(index) {
    const menu = this.open('delete', 'Delete Save?');
    menu.append(node('p', 'story-copy', `Slot ${index + 1}: ${SaveStore.get(index)?.name || 'Boco'}`));
    const actions = node('div', 'menu-actions');
    actions.append(this.button('Keep Save', () => this.showSlots(), 'primary'), this.button('Delete', () => {
      SaveStore.delete(index);
      if (this.activeSlot === index) this.activeSlot = null;
      this.showSlots();
    }, 'danger'));
    menu.append(actions);
  }
  importSlot(index) {
    if (SaveStore.get(index)) {
      const menu = this.open('import-confirm', 'Replace Save?');
      menu.append(node('p', 'story-copy', `Import over slot ${index + 1}?`));
      const actions = node('div', 'menu-actions');
      actions.append(this.button('Cancel', () => this.showSlots(), 'primary'), this.button('Choose File', () => this.chooseImport(index)));
      menu.append(actions);
    } else this.chooseImport(index);
  }
  chooseImport(index) {
    const file = node('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.hidden = true;
    file.addEventListener('change', async () => {
      try {
        if (!file.files[0]) return;
        if (file.files[0].size > 1024 * 1024) throw new Error('Save file is too large.');
        SaveStore.import(index, await file.files[0].text());
        this.activeSlot = index;
        this.showSlots();
        this.showToast('Save imported.');
      } catch (error) { this.showToast(error.message || 'Invalid save file.'); }
      finally { file.remove(); }
    }, {once:true});
    file.addEventListener('cancel', () => file.remove(), {once:true});
    this.overlay.append(file);
    file.click();
  }
  exportSlot(index) {
    const blob = new Blob([SaveStore.export(index)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const link = node('a');
    link.href = url;
    link.download = `boco-skybound-slot-${index + 1}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.showToast('Save exported.');
  }
  start(index, levelIndex) {
    this.activeSlot = index;
    this.notifySettings();
    this.hide();
    this.invoke('onStart', index, levelIndex);
  }
  showWorld(slot) {
    const index = this.slotIndex(slot);
    this.activeSlot = index;
    const saved = SaveStore.get(index);
    if (!saved) return this.showSlots();
    const menu = this.open('world', 'Choose an Area');
    menu.append(node('p', 'eyebrow', saved.name));
    const stack = node('div', 'menu-stack');
    const restored = ['meadow', 'cliff', 'canopy'].every(id => saved.defeated?.includes(id));
    const emblemCount = Math.min(ROOST_EMBLEM_GOAL, saved.emblems?.length || 0);
    const roostUnlocked = restored && emblemCount >= ROOST_EMBLEM_GOAL;
    const resume = this.button('Continue', () => this.start(index), 'primary');
    resume.disabled = saved.area === 3 && !roostUnlocked;
    stack.append(resume);
    LEVELS.forEach((level, levelIndex) => {
      const unlocked = levelIndex === 3 ? roostUnlocked : levelIndex <= saved.area;
      const beaten = saved.defeated?.includes(level.id);
      const button = this.button('', () => this.start(index, levelIndex), 'world-row');
      const copy = node('span');
      copy.append(node('strong', '', `${String(levelIndex + 1).padStart(2, '0')}  ${level.name}`));
      if (level.subtitle) copy.append(node('small', '', level.subtitle));
      button.append(copy, node('span', 'area-mark', !unlocked ? 'Locked' : beaten ? '★' : '›'));
      button.disabled = !unlocked;
      stack.append(button);
    });
    menu.append(stack);
    if (!roostUnlocked) menu.append(node('p', 'menu-note', `Sky Emblems: 4 and 8 restore Heart Flowers. Find all ${ROOST_EMBLEM_GOAL} to awaken the Wind Crest, then restore three gardens to open High Roost. Progress ${emblemCount}/${ROOST_EMBLEM_GOAL}.`));
    else menu.append(node('p', 'menu-note', 'Wind Crest awakened - Boco\'s attacks launch a short-range wind blade.'));
    const actions = node('div', 'menu-actions');
    actions.append(this.button('Saves', () => this.showSlots()), this.button('Settings', () => this.showSettings(() => this.showWorld(index))));
    menu.append(actions);
  }
  showPause() {
    const menu = this.open('pause', 'Paused');
    const stack = node('div', 'menu-stack');
    stack.append(
      this.button('Resume', () => { this.hide(); this.invoke('onResume'); }, 'primary'),
      this.button('Retry Checkpoint', () => this.confirmRestart()),
      this.button('Settings', () => this.showSettings(() => this.showPause())),
      this.button('Save & Exit', () => { this.hide(); this.invoke('onExit', 'slots'); })
    );
    menu.append(stack);
  }
  confirmRestart() {
    const menu = this.open('restart', 'Retry Checkpoint?');
    const actions = node('div', 'menu-actions');
    actions.append(this.button('Cancel', () => this.showPause(), 'primary'), this.button('Retry', () => { this.hide(); this.invoke('onRestart'); }));
    menu.append(actions);
  }
  showOpening(index, page = 0) {
    const pages = [
      ['A Quiet Morning', 'Above the meadow, the wind bells fell silent. The Sky Emblems had vanished, and the paths to the high roost were closing.'],
      ['A Small Promise', 'Boco tucked a feather beneath one wing. Somewhere beyond the cliffs, an old friend was waiting for the wind to return.'],
      ['Into the Wind', 'One leap. One brave little wingbeat. Boco set off toward the sky.']
    ];
    const [heading, copy] = pages[page];
    const menu = this.open('opening', heading);
    menu.append(node('span', 'story-number', `${page + 1} / ${pages.length}`), node('p', 'story-copy', copy));
    const actions = node('div', 'menu-actions');
    actions.append(this.button(page === pages.length - 1 ? 'Begin' : 'Next', () => page === pages.length - 1 ? this.start(index, 0) : this.showOpening(index, page + 1), 'primary'));
    if (page < pages.length - 1) actions.append(this.button('Skip', () => this.start(index, 0)));
    menu.append(actions);
  }
  showVictory(slot, levelIndex, isFinal) {
    const index = this.slotIndex(slot);
    this.activeSlot = index;
    const menu = this.open('victory', isFinal ? 'The Sky Is Open' : 'Area Clear');
    menu.append(node('div', 'victory-symbol', '★'), node('p', 'story-copy', `${LEVELS[levelIndex]?.name || 'Area'} restored.`));
    const count = Math.min(ROOST_EMBLEM_GOAL, SaveStore.get(index)?.emblems?.length || 0);
    menu.append(node('p', 'menu-note', count >= ROOST_EMBLEM_GOAL ? 'Wind Crest awakened - attacks now launch a wind blade' :
      `${count}/${ROOST_EMBLEM_GOAL} Sky Emblems - 4 and 8 restore Heart Flowers; 12 awaken the Wind Crest`));
    const actions = node('div', 'menu-actions');
    actions.append(this.button(isFinal ? 'Continue' : 'Next Area', () => isFinal ? this.showEnding(index) : this.start(index, Math.min(levelIndex + 1, LEVELS.length - 1)), 'primary'), this.button('Areas', () => this.showWorld(index)));
    menu.append(actions);
  }
  showEnding(slot) {
    const index = this.slotIndex(slot);
    this.activeSlot = index;
    const menu = this.open('ending', 'Home on the Wind');
    menu.append(node('div', 'victory-symbol', '★'), node('p', 'story-copy', 'The wind bells rang again. From the meadow to the highest roost, every feather caught the light. Boco was home, with a whole sky of adventures still ahead.'), node('p', 'eyebrow', 'THE END'));
    const actions = node('div', 'menu-actions');
    actions.append(this.button('Explore Again', () => this.showWorld(index), 'primary'), this.button('Title', () => { this.hide(); this.invoke('onExit', 'title'); }));
    menu.append(actions);
  }
  notifySettings() {
    this.settings = SaveStore.getSettings();
    const settings = {...this.settings};
    window.dispatchEvent(new CustomEvent('skybound:settings', {detail:settings}));
    this.invoke('onSettings', settings);
  }
  preference(patch) {
    const saved = SaveStore.saveSettings(patch);
    this.settings = saved || {...this.settings, ...patch};
    this.notifySettings();
    if (SaveStore.storageAvailable === false) this.showToast('Storage unavailable. Settings kept for this session.');
  }
  showSettings(returnTo = () => this.showTitle(), slotAssists = true) {
    this.returnSettings = returnTo;
    this.settings = SaveStore.getSettings();
    const menu = this.open('settings', 'Settings', {settings:true});
    const audio = this.section(menu, 'Audio');
    this.range(audio, 'Music', this.settings.music, 0, 1, .05, value => this.preference({music:value}), value => `${Math.round(value * 100)}%`);
    this.range(audio, 'Effects', this.settings.effects, 0, 1, .05, value => this.preference({effects:value}), value => `${Math.round(value * 100)}%`);
    this.toggle(audio, 'Mute', this.settings.muted, checked => this.preference({muted:checked}));
    const touch = this.section(menu, 'Touch');
    this.range(touch, 'Button size', this.settings.touchScale, .7, 1.35, .05, value => this.preference({touchScale:value}), value => `${Math.round(value * 100)}%`);
    const row = node('label', 'setting');
    row.append(node('span', '', 'Visibility'));
    const select = node('select');
    for (const [value, label] of [['auto','Auto'], ['on','On'], ['off','Off']]) { const option = node('option', '', label); option.value = value; select.append(option); }
    select.value = this.settings.touchMode || 'auto';
    select.addEventListener('change', () => this.safely(() => this.preference({touchMode:select.value})));
    row.append(select);
    touch.append(row);
    this.toggle(touch, 'Left-handed', getLeftHanded(), checked => setLeftHanded(checked));
    this.toggle(touch, 'Swipe gestures', getGestureEnabled(), checked => setGestureEnabled(checked));
    touch.append(node('p', 'menu-note', 'Drag: move  ·  Swipe up: jump  ·  Tap: attack  ·  Hold: glide'));
    if (slotAssists && this.activeSlot !== null && SaveStore.get(this.activeSlot)) {
      const assists = this.section(menu, `Assists / Slot ${this.activeSlot + 1}`);
      for (const [key, label] of Object.entries(ASSISTS)) this.toggle(assists, label, SaveStore.get(this.activeSlot).assists?.[key], checked => {
        const current = SaveStore.get(this.activeSlot);
        SaveStore.save(this.activeSlot, {assists:{...current.assists, [key]:checked}});
        this.notifySettings();
      });
    }
    const bindings = this.section(menu, 'Controls');
    const table = node('table', 'binding-table');
    const head = node('tr');
    for (const title of ['Action', 'Keyboard', 'Gamepad']) head.append(node('th', '', title));
    const thead = node('thead'); thead.append(head); table.append(thead);
    const tbody = node('tbody');
    for (const action of ACTIONS) {
      const tr = node('tr');
      tr.append(node('td', '', action[0].toUpperCase() + action.slice(1)));
      for (const type of ['keyboard', 'gamepad']) {
        const td = node('td');
        const button = this.button(this.bindingLabel(action, type), () => this.beginBinding(action, type, button), '', `Remap ${action} ${type}`);
        td.append(button); tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(tbody); bindings.append(table);
    bindings.append(node('p', 'menu-note', 'Arrows / D-pad: menu  ·  Enter / A: select  ·  Escape / B: back'));
    const actions = node('div', 'menu-actions');
    actions.append(this.button('Done', returnTo, 'primary'), this.button('Reset Controls', () => {
      this.preference({bindings:{}, padBindings:{}});
      this.showSettings(returnTo, slotAssists);
    }));
    menu.append(actions);
  }
  section(menu, title) { const section = node('fieldset', 'settings-section'); section.append(node('legend', '', title)); menu.append(section); return section; }
  range(parent, label, value, min, max, step, callback, format) {
    const row = node('label', 'setting');
    const text = node('span', '', label);
    const output = node('output', '', format(Number(value) || 0));
    const input = node('input');
    input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value ?? min;
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => { output.textContent = format(Number(input.value)); this.safely(() => callback(Number(input.value))); });
    row.append(text, input, output); parent.append(row);
  }
  toggle(parent, label, checked, callback) {
    const row = node('label', 'setting');
    const input = node('input'); input.type = 'checkbox'; input.checked = Boolean(checked);
    input.addEventListener('change', () => this.safely(() => callback(input.checked)));
    row.append(node('span', '', label), input); parent.append(row);
  }
  bindingLabel(action, type) {
    const defaults = type === 'keyboard' ? DEFAULT_BINDINGS : DEFAULT_PAD_BINDINGS;
    const custom = type === 'keyboard' ? this.settings.bindings : this.settings.padBindings;
    return array(custom?.[action] ?? defaults[action]).map(type === 'keyboard' ? keyName : padName).join(' / ');
  }
  beginBinding(action, type, button) {
    if (this.capture) this.cancelBinding();
    this.capture = {action, type, button};
    button.textContent = type === 'keyboard' ? 'Press key...' : 'Press button...';
    button.classList.add('listening');
    this.showToast('Escape cancels.');
  }
  cancelBinding() {
    if (!this.capture) return;
    const {action, type, button} = this.capture;
    button.textContent = this.bindingLabel(action, type);
    button.classList.remove('listening');
    this.capture = null;
  }
  captureBinding(detail) {
    if (!this.capture || !detail) return;
    detail.handled = true;
    if (detail.type === 'keyboard' && detail.value === 'Escape') return this.cancelBinding();
    if (detail.type !== this.capture.type || typeof detail.value === 'string' && detail.type === 'gamepad') return;
    const {action, type, button} = this.capture;
    const key = type === 'keyboard' ? 'bindings' : 'padBindings';
    this.safely(() => this.preference({[key]:{...(this.settings[key] || {}), [action]:[detail.value]}}));
    this.capture = null;
    button.textContent = this.bindingLabel(action, type);
    button.classList.remove('listening');
  }
  focusables() { return [...this.overlay.querySelectorAll('button:not(:disabled), input:not([hidden]), select, a[href]')].filter(element => element.getClientRects().length); }
  trapTab(event) {
    if (this.overlay.hidden || event.key !== 'Tab') return;
    const elements = this.focusables();
    if (!elements.length) return;
    const index = elements.indexOf(document.activeElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); elements.at(-1).focus(); }
    else if (!event.shiftKey && (index < 0 || index === elements.length - 1)) { event.preventDefault(); elements[0].focus(); }
  }
  navigate(actions) {
    if (this.overlay.hidden || this.capture) return;
    if (actions.includes('back')) return this.back();
    if (actions.includes('pause') && !actions.includes('confirm') && this.view === 'pause') return this.back();
    const elements = this.focusables();
    if (!elements.length) return;
    const current = document.activeElement;
    if (actions.includes('confirm')) {
      const target = elements.includes(current) ? current : elements[0];
      if (target.matches('input[type=checkbox]')) { target.checked = !target.checked; target.dispatchEvent(new Event('change', {bubbles:true})); }
      else if (target.matches('button, a')) target.click();
      return;
    }
    const direction = actions.includes('up') ? -1 : actions.includes('down') ? 1 : actions.includes('left') ? -1 : actions.includes('right') ? 1 : 0;
    if (!direction) return;
    if ((actions.includes('left') || actions.includes('right')) && current?.matches('input[type=range], select')) {
      if (current.matches('select')) {
        current.selectedIndex = Math.max(0, Math.min(current.options.length - 1, current.selectedIndex + direction));
        current.dispatchEvent(new Event('change', {bubbles:true}));
      } else {
        if (direction < 0) current.stepDown(); else current.stepUp();
        current.dispatchEvent(new Event('input', {bubbles:true}));
      }
      return;
    }
    const index = elements.indexOf(current);
    const next = elements[(index + direction + elements.length) % elements.length];
    next.focus({preventScroll:true}); next.scrollIntoView({block:'nearest'});
  }
  back() {
    if (this.capture) return this.cancelBinding();
    switch (this.view) {
      case 'settings': return this.returnSettings?.();
      case 'pause': this.hide(); return this.invoke('onResume');
      case 'restart': return this.showPause();
      case 'world': case 'delete': case 'import-confirm': return this.showSlots();
      case 'slots': return this.showTitle();
      case 'opening': return this.showSlots();
      case 'victory': case 'ending': return this.showWorld(this.activeSlot);
      default: break;
    }
  }
  updateHud(state) {
    if (this.hudState && Object.keys(state).every(key => state[key] === this.hudState[key])) return;
    this.hudState = { ...state };
    const {area, health, maxHealth, emblems, bossName, bossHealth, bossMax, bossVulnerable, gliding} = state;
    document.getElementById('hud-area').textContent = area ?? '';
    const maximum = Math.max(0, Math.min(12, Number(maxHealth) || 3));
    const current = Math.max(0, Math.min(maximum, Number(health) || 0));
    const flowers = document.getElementById('hud-health');
    if (flowers.dataset.health !== `${current}/${maximum}`) {
      flowers.replaceChildren();
      for (let index = 0; index < maximum; index++) {
        const flower = node('span', `health-flower${index < current ? '' : ' empty'}`);
        flower.setAttribute('aria-hidden', 'true');
        flowers.append(flower);
      }
      flowers.dataset.health = `${current}/${maximum}`;
    }
    flowers.setAttribute('aria-label', `Health ${current} of ${maximum}`);
    const emblemCount = Math.min(ROOST_EMBLEM_GOAL, Array.isArray(emblems) ? emblems.length : emblems ?? 0);
    const emblemCounter = document.getElementById('hud-emblems');
    emblemCounter.textContent = emblemCount >= ROOST_EMBLEM_GOAL ? `Crest ${emblemCount}/${ROOST_EMBLEM_GOAL}` : `Emblems ${emblemCount}/${ROOST_EMBLEM_GOAL}`;
    emblemCounter.setAttribute('aria-label', emblemCount >= ROOST_EMBLEM_GOAL ?
      `Wind Crest awakened; all ${ROOST_EMBLEM_GOAL} Sky Emblems collected` : `${emblemCount} of ${ROOST_EMBLEM_GOAL} Sky Emblems collected`);
    emblemCounter.title = `4 and 8 restore Heart Flowers; ${ROOST_EMBLEM_GOAL} awaken the Wind Crest and help unlock High Roost`;
    const boss = document.getElementById('hud-boss');
    boss.hidden = !bossName || !(bossMax > 0);
    boss.classList.toggle('vulnerable', Boolean(bossVulnerable));
    document.getElementById('hud-boss-name').textContent = bossName ? `${bossName}${bossVulnerable ? ' - OPEN' : ''}` : '';
    const meter = document.getElementById('hud-boss-meter');
    meter.max = Math.max(1, Number(bossMax) || 1); meter.value = Math.max(0, Number(bossHealth) || 0);
    document.getElementById('hud-glide').hidden = !gliding;
  }
  updateAudioState(muted) {
    const button = document.getElementById('sound-button');
    if (!button) return;
    const icon = muted ? 'volume-x' : 'volume-2';
    if (!button.querySelector(`.lucide-${icon}`)) button.replaceChildren(hudIcon(icon));
    const label = muted ? 'Unmute sound' : 'Mute sound';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(muted));
    button.title = label;
  }
  showToast(text) {
    clearTimeout(this.toastTimer);
    this.toast.textContent = text;
    this.toast.hidden = false;
    this.toastTimer = setTimeout(() => { this.toast.hidden = true; }, 3200);
  }
  showChapter(chapter, area) {
    if (!this.chapterCard) return;
    document.getElementById('chapter-area').textContent = area || '';
    document.getElementById('chapter-number').textContent = `ACT ${chapter.act} / ${chapter.count}`;
    document.getElementById('chapter-name').textContent = chapter.name || '';
    document.getElementById('chapter-style').textContent = chapter.style || '';
    document.getElementById('chapter-tagline').textContent = chapter.tagline || '';
    this.chapterCard.hidden = false;
    this.hud.hidden = true;
  }
  hideChapter() {
    if (!this.chapterCard) return;
    this.chapterCard.hidden = true;
    if (this.overlay.hidden) this.hud.hidden = false;
  }
  destroy() { this.listeners.splice(0).forEach(remove => remove()); clearTimeout(this.toastTimer); this.hideChapter(); this.hide(); }
}
