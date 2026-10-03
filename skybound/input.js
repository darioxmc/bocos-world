import { SaveStore } from './saves.js';

export const ACTIONS = Object.freeze(['left', 'right', 'up', 'down', 'jump', 'attack', 'glide', 'pause', 'confirm', 'back']);
export const DEFAULT_BINDINGS = Object.freeze({
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyW', 'ArrowUp'], attack: ['KeyZ', 'KeyJ'], glide: ['KeyX', 'KeyK'], pause: ['Enter', 'Escape'], confirm: ['Enter', 'Space'], back: ['Escape']
});
export const DEFAULT_PAD_BINDINGS = Object.freeze({left: [14], right: [15], up: [12], down: [13], jump: [0], attack: [2], glide: [1], pause: [9], confirm: [0], back: [1]});
const asArray = value => Array.isArray(value) ? value : value === undefined ? [] : [value];
const GESTURE_KEY = 'skybound:gesture-controls:v1';
const LEFT_HAND_KEY = 'skybound:left-handed:v1';
let gestureFallback = false;
let leftHandFallback = false;
export function getLeftHanded() {
  try { const saved = localStorage.getItem(LEFT_HAND_KEY); if (saved !== null) leftHandFallback = saved === 'true'; } catch { /* Keep the session preference when storage is blocked. */ }
  return leftHandFallback;
}
export function setLeftHanded(enabled) {
  leftHandFallback = Boolean(enabled);
  try { localStorage.setItem(LEFT_HAND_KEY, String(leftHandFallback)); } catch { /* The layout still changes when storage is blocked. */ }
  window.dispatchEvent(new CustomEvent('skybound:touch-layout', {detail:{leftHanded:leftHandFallback}}));
}
export function getGestureEnabled() {
  try { const saved = localStorage.getItem(GESTURE_KEY); if (saved !== null) gestureFallback = saved === 'true'; } catch { /* Keep the session preference when storage is blocked. */ }
  return gestureFallback;
}
export function setGestureEnabled(enabled) {
  gestureFallback = Boolean(enabled);
  try { localStorage.setItem(GESTURE_KEY, String(gestureFallback)); } catch { /* Input preferences still work for this session. */ }
  window.dispatchEvent(new CustomEvent('skybound:gestures', {detail:{enabled:gestureFallback}}));
}

export class InputController {
  constructor() {
    this.sources = new Map();
    this.pending = new Set();
    this.edges = new Set();
    this.keys = new Set();
    this.blockedKeys = new Set();
    this.pads = new Map();
    this.blockedPads = new Map();
    this.pointers = new Map();
    this.gestures = new Map();
    this.gestureEnabled = getGestureEnabled();
    this.listeners = [];
    this.menu = false;
    this.bound = false;
    this.settings = SaveStore.getSettings();
    this.bindings = DEFAULT_BINDINGS;
    this.padBindings = DEFAULT_PAD_BINDINGS;
    this.touchQuery = window.matchMedia('(pointer: coarse)');
  }

  bind() {
    if (this.bound) return this;
    this.bound = true;
    this.menu = document.body.classList.contains('menu-open');
    this.listen(window, 'keydown', event => this.keyDown(event));
    this.listen(window, 'keyup', event => this.keyUp(event));
    this.listen(window, 'blur', () => {
      // Mobile focus changes do not imply backgrounding. Preserve active touches
      // while visible; visibilitychange/pagehide handle actual app departure.
      if (document.hidden || !(this.touchQuery.matches || navigator.maxTouchPoints > 0)) this.suspend('focus-lost');
      else {
        this.releasePrefix('key:');
        this.keys.clear();
        this.blockedKeys.clear();
      }
    });
    this.listen(document, 'visibilitychange', () => { if (document.hidden) this.suspend('page-hidden'); });
    this.listen(window, 'pagehide', () => this.suspend('page-hidden'));
    this.listen(window, 'gamepaddisconnected', event => {
      this.pads.delete(event.gamepad.index);
      this.releasePrefix(`pad:${event.gamepad.index}:`);
      this.suspend('controller-disconnected');
    });
    this.listen(window, 'skybound:settings', event => this.applySettings(event.detail || {}));
    this.listen(window, 'skybound:gestures', event => {
      this.gestureEnabled = Boolean(event.detail?.enabled);
      this.clear();
    });
    this.listen(window, 'skybound:touch-layout', event => {
      document.body.classList.toggle('left-handed', Boolean(event.detail?.leftHanded));
      this.clear();
    });
    this.listen(window, 'skybound:menu', event => {
      this.menu = Boolean(event.detail?.open);
      this.clear();
    });
    this.listen(this.touchQuery, 'change', () => this.touchVisibility());
    const touchControls = document.getElementById('touch-controls');
    if (touchControls) {
      // Keep rapid taps in buttons, labels and gaps from becoming browser zoom.
      // Pointer events still own gameplay; menus retain native touch behavior.
      const preventControlGesture = event => { if (!this.menu && event.cancelable) event.preventDefault(); };
      this.listen(touchControls, 'touchend', preventControlGesture, { passive: false });
      this.listen(touchControls, 'dblclick', preventControlGesture);
    }
    const dpad = document.getElementById('dpad');
    if (dpad) {
      this.listen(dpad, 'pointerdown', event => this.touchStart(event, dpad, 'dpad'));
      this.listen(dpad, 'pointermove', event => this.touchMove(event, dpad));
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.listen(dpad, type, event => this.touchEnd(event));
    }
    document.querySelectorAll('[data-action]').forEach(button => {
      this.listen(button, 'pointerdown', event => this.touchStart(event, button, button.dataset.action));
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.listen(button, type, event => this.touchEnd(event));
      this.listen(button, 'contextmenu', event => event.preventDefault());
    });
    const field = document.getElementById('game-mount');
    if (field) {
      this.listen(field, 'pointerdown', event => this.gestureStart(event, field));
      this.listen(field, 'pointermove', event => this.gestureMove(event));
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.listen(field, type, event => this.gestureEnd(event));
    }
    this.applySettings(this.settings);
    document.body.classList.toggle('left-handed', getLeftHanded());
    const tick = () => {
      if (!this.bound) return;
      this.pollGamepads();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    return this;
  }

  listen(target, type, callback, options) {
    target.addEventListener(type, callback, options);
    this.listeners.push(() => target.removeEventListener(type, callback, options));
  }

  applySettings(settings) {
    this.settings = {...this.settings, ...settings};
    this.bindings = {...DEFAULT_BINDINGS, ...(this.settings.bindings || {})};
    this.padBindings = {...DEFAULT_PAD_BINDINGS, ...(this.settings.padBindings || {})};
    const scale = Math.max(.7, Math.min(1.35, Number(this.settings.touchScale) || 1));
    document.documentElement.style.setProperty('--touch-scale', scale);
    document.documentElement.style.setProperty('--controls', `${Math.max(144, Math.ceil(140 * scale))}px`);
    this.touchVisibility();
    this.clear();
  }

  touchVisibility() {
    const mode = this.settings.touchMode || 'auto';
    document.body.classList.toggle('touch-visible', mode === 'on' || (mode === 'auto' && (this.touchQuery.matches || navigator.maxTouchPoints > 0)));
  }

  actionsFor(binding, value) {
    return ACTIONS.filter(action => asArray(binding[action]).includes(value));
  }

  keyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const editable = event.target?.matches?.('input, select, textarea, [contenteditable="true"]');
    const actions = this.actionsFor(this.bindings, event.code);
    if (editable && this.menu) {
      // Sliders retain native left/right adjustment, but must not trap menu navigation.
      const menuNavigation = ['Escape', 'ArrowUp', 'ArrowDown'].includes(event.code);
      const nativeSelect = event.target.matches('select') && event.code !== 'Escape';
      const textEntry = event.target.matches('textarea, [contenteditable="true"], input:not([type="range"]):not([type="checkbox"])') && event.code !== 'Escape';
      if (!menuNavigation || nativeSelect || textEntry) return;
    }
    if (actions.length || (this.menu && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Space'].includes(event.code))) event.preventDefault();
    if (event.repeat || this.keys.has(event.code)) return;
    this.keys.add(event.code);
    const physical = {type:'keyboard', value:event.code};
    window.dispatchEvent(new CustomEvent('skybound:binding', {detail:physical}));
    if (physical.handled) return;
    if (this.blockedKeys.has(event.code)) return;
    // Canonical menu keys remain available even after gameplay remapping.
    const canonical = {ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down', Enter:'confirm', Space:'confirm', Escape:'back'};
    this.activate(`key:${event.code}`, actions, this.menu && canonical[event.code] ? [canonical[event.code]] : actions, {type:'keyboard', value:event.code});
  }

  keyUp(event) {
    this.keys.delete(event.code);
    this.blockedKeys.delete(event.code);
    this.sources.delete(`key:${event.code}`);
  }

  activate(source, actions, navigation = actions, physical = {}) {
    if (this.menu) {
      if (navigation.length) window.dispatchEvent(new CustomEvent('skybound:navigate', {detail:{actions:navigation, ...physical}}));
      return;
    }
    const previous = new Set(ACTIONS.filter(action => this.down(action)));
    const next = new Set(actions);
    this.sources.set(source, next);
    for (const action of next) if (!previous.has(action)) this.pending.add(action);
  }

  pollGamepads() {
    if (!navigator.getGamepads || document.hidden) return;
    const active = new Set();
    for (const pad of navigator.getGamepads()) {
      if (!pad || !pad.connected) continue;
      active.add(pad.index);
      const current = new Set();
      pad.buttons.forEach((button, index) => { if (button.pressed || button.value > .5) current.add(index); });
      const old = this.pads.get(pad.index) || new Set();
      const blocked = this.blockedPads.get(pad.index) || new Set();
      for (const button of [...blocked]) if (!current.has(button)) blocked.delete(button);
      for (const button of old) if (typeof button === 'number' && !current.has(button)) this.sources.delete(`pad:${pad.index}:${button}`);
      // Save physical state before dispatch, since opening a menu clears inputs synchronously.
      this.pads.set(pad.index, current);
      this.blockedPads.set(pad.index, blocked);
      for (const button of current) {
        if (old.has(button) || blocked.has(button)) continue;
        const physical = {type:'gamepad', value:button, index:pad.index};
        window.dispatchEvent(new CustomEvent('skybound:binding', {detail:physical}));
        if (physical.handled) continue;
        const actions = this.actionsFor(this.padBindings, button);
        const canonical = {0:'confirm', 1:'back', 12:'up', 13:'down', 14:'left', 15:'right'};
        this.activate(`pad:${pad.index}:${button}`, actions, this.menu && canonical[button] ? [canonical[button]] : actions, {type:'gamepad', value:button});
      }
      const x = pad.axes[0] || 0;
      const y = pad.axes[1] || 0;
      for (const [direction, held] of [['left',x < -.5], ['right',x > .5], ['up',y < -.5], ['down',y > .5]]) {
        const source = `pad:${pad.index}:axis:${direction}`;
        const token = `axis:${direction}`;
        if (!held) { this.sources.delete(source); blocked.delete(token); }
        else if (!blocked.has(token) && !old.has(token)) this.activate(source, [direction], [direction], {type:'gamepad', value:token});
        if (held) current.add(token);
      }
    }
    for (const index of this.pads.keys()) if (!active.has(index)) {
      this.pads.delete(index);
      this.releasePrefix(`pad:${index}:`);
      this.suspend('controller-disconnected');
    }
  }

  touchStart(event, element, action) {
    if (this.menu || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    element.setPointerCapture?.(event.pointerId);
    this.pointers.set(event.pointerId, {element, action});
    if (action === 'dpad') this.touchMove(event, element);
    else { this.activate(`touch:${event.pointerId}`, [action]); element.classList.add('active'); }
  }

  touchMove(event, element) {
    if (this.pointers.get(event.pointerId)?.action !== 'dpad') return;
    event.preventDefault();
    const rect = element.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * 2 - 1;
    const y = (event.clientY - rect.top) / rect.height * 2 - 1;
    const directions = [];
    if (Math.hypot(x, y) > .22) {
      if (Math.abs(x) > .32) directions.push(x < 0 ? 'left' : 'right');
      if (Math.abs(y) > .32) directions.push(y < 0 ? 'up' : 'down');
    }
    this.activate(`touch:${event.pointerId}`, directions);
    this.paintDpad(element);
  }

  touchEnd(event) {
    const pointer = this.pointers.get(event.pointerId);
    this.pointers.delete(event.pointerId);
    this.sources.delete(`touch:${event.pointerId}`);
    if (!pointer) return;
    if (pointer.action === 'dpad') this.paintDpad(pointer.element);
    else if (![...this.pointers.values()].some(other => other.element === pointer.element)) pointer.element.classList.remove('active');
  }

  paintDpad(element) {
    const directions = new Set();
    for (const [id, pointer] of this.pointers) if (pointer.action === 'dpad') for (const action of this.sources.get(`touch:${id}`) || []) directions.add(action);
    element.dataset.directions = [...directions].join(' ');
  }

  gestureStart(event, element) {
    if (!this.gestureEnabled || this.menu || event.pointerType !== 'touch') return;
    event.preventDefault();
    element.setPointerCapture?.(event.pointerId);
    const gesture = {element, x:event.clientX, y:event.clientY, start:performance.now(), moved:false, jumped:false, held:false};
    this.gestures.set(event.pointerId, gesture);
    gesture.timer = setTimeout(() => {
      if (!this.gestures.has(event.pointerId) || gesture.moved || this.menu) return;
      gesture.held = true;
      this.activate(`gesture:${event.pointerId}`, ['glide']);
    }, 300);
  }
  gestureMove(event) {
    const gesture = this.gestures.get(event.pointerId);
    if (!gesture) return;
    event.preventDefault();
    const rect = gesture.element.getBoundingClientRect();
    const x = (event.clientX - gesture.x) * 320 / rect.width;
    const y = (event.clientY - gesture.y) * 240 / rect.height;
    if (Math.hypot(x, y) > 8) { gesture.moved = true; clearTimeout(gesture.timer); }
    const actions = [];
    if (x < -10) actions.push('left');
    if (x > 10) actions.push('right');
    if (gesture.held) actions.push('glide');
    if (y < -20 && !gesture.jumped) {
      gesture.jumped = true;
      actions.push('jump');
    }
    this.activate(`gesture:${event.pointerId}`, actions);
  }
  gestureEnd(event) {
    const gesture = this.gestures.get(event.pointerId);
    if (!gesture) return;
    clearTimeout(gesture.timer);
    if (event.type === 'pointerup' && !gesture.moved && !gesture.held && performance.now() - gesture.start < 300) this.activate(`gesture:${event.pointerId}`, ['attack']);
    this.sources.delete(`gesture:${event.pointerId}`);
    this.gestures.delete(event.pointerId);
  }

  releasePrefix(prefix) { for (const key of this.sources.keys()) if (key.startsWith(prefix)) this.sources.delete(key); }
  update() {
    this.pollGamepads();
    this.edges = new Set(this.pending);
    this.pending.clear();
  }
  down(action) { return !this.menu && [...this.sources.values()].some(actions => actions.has(action)); }
  pressed(action) { return !this.menu && this.edges.has(action); }
  clear() {
    for (const key of this.keys) this.blockedKeys.add(key);
    for (const [index, pressed] of this.pads) this.blockedPads.set(index, new Set(pressed));
    this.sources.clear();
    this.pending.clear();
    this.edges.clear();
    for (const [id, pointer] of this.pointers) {
      pointer.element.classList.remove('active');
      pointer.element.dataset.directions = '';
      try { if (pointer.element.hasPointerCapture?.(id)) pointer.element.releasePointerCapture(id); } catch { /* A cancelled pointer can already be released. */ }
    }
    this.pointers.clear();
    for (const [id, gesture] of this.gestures) {
      clearTimeout(gesture.timer);
      try { if (gesture.element.hasPointerCapture?.(id)) gesture.element.releasePointerCapture(id); } catch { /* Capture may already have ended. */ }
    }
    this.gestures.clear();
  }
  suspend(reason) {
    this.clear();
    // Keyup is not guaranteed after losing focus.
    this.keys.clear();
    this.blockedKeys.clear();
    window.dispatchEvent(new CustomEvent('skybound:pause', {detail:{reason}}));
  }
  destroy() {
    this.bound = false;
    cancelAnimationFrame(this.raf);
    this.listeners.splice(0).forEach(remove => remove());
    this.clear();
    this.keys.clear();
    this.pads.clear();
  }
}
