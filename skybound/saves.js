const VERSION = 2;
const STORAGE_KEY = 'skybound:save-store:v2';
const LEGACY_STORAGE_KEY = 'skybound:save-store:v1';
const MAX_JSON_BYTES = 64 * 1024;
const AREAS = ['meadow', 'cliff', 'canopy', 'roost'];
const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'glide', 'pause', 'confirm', 'back'];
const SLOT_KEYS = ['version', 'name', 'area', 'checkpoint', 'health', 'defeated', 'emblems', 'playtime', 'completed', 'assists', 'updatedAt'];
const ASSIST_KEYS = ['extraHealth', 'reducedDamage', 'toggleGlide'];
const SETTING_KEYS = ['music', 'effects', 'muted', 'touchScale', 'touchMode', 'bindings', 'padBindings'];
const DEFAULT_ASSISTS = { extraHealth: false, reducedDamage: false, toggleGlide: false };
const DEFAULT_SETTINGS = { music: 0.35, effects: 0.6, muted: false, touchScale: 1, touchMode: 'auto', bindings: {}, padBindings: {} };

const copy = (value) => JSON.parse(JSON.stringify(value));
const fail = (message) => { throw new TypeError(message); };
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function object(value, keys, label, complete = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label} must be a plain object`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key)) fail(`Unknown ${label} field: ${String(key)}`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!own(descriptor, 'value')) fail(`${label} cannot contain accessors`);
  }
  if (complete && keys.some((key) => !own(value, key))) fail(`Incomplete ${label}`);
}

function number(value, min, max, label, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max ||
      (integer && !Number.isSafeInteger(value))) fail(`Invalid ${label}`);
}

function boolean(value, label) {
  if (typeof value !== 'boolean') fail(`Invalid ${label}`);
}

function string(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) fail(`Invalid ${label}`);
}

function identifiers(value, max, label, allowed) {
  if (!Array.isArray(value) || value.length > max || new Set(value).size !== value.length) fail(`Invalid ${label}`);
  for (const id of value) {
    string(id, 80, label);
    if (allowed && !allowed.includes(id)) fail(`Unknown ${label}: ${id}`);
  }
}

function assists(value, complete = true) {
  object(value, ASSIST_KEYS, 'assists', complete);
  for (const key of Object.keys(value)) boolean(value[key], key);
}

function slot(value, complete = true) {
  object(value, SLOT_KEYS, 'slot', complete);
  for (const key of Object.keys(value)) {
    const field = value[key];
    switch (key) {
      case 'version': if (field !== VERSION) fail('Unsupported save version'); break;
      case 'name': string(field, 40, 'name'); break;
      case 'area': number(field, 0, 3, 'area', true); break;
      case 'checkpoint': if (field !== null) string(field, 80, 'checkpoint'); break;
      case 'health': number(field, 0, 6, 'health', true); break;
      case 'defeated': identifiers(field, 4, 'defeated boss', AREAS); break;
      case 'emblems': identifiers(field, 256, 'emblem'); break;
      case 'playtime': number(field, 0, 315360000, 'playtime'); break;
      case 'completed': boolean(field, 'completed'); break;
      case 'assists': assists(field, complete); break;
      case 'updatedAt': number(field, 0, 8640000000000000, 'updatedAt', true); break;
    }
  }
}

function bindings(value, pad) {
  object(value, ACTIONS, pad ? 'padBindings' : 'bindings');
  for (const binding of Object.values(value)) {
    const entries = Array.isArray(binding) ? binding : [binding];
    if (!entries.length || entries.length > 4) fail('Invalid binding list');
    for (const entry of entries) {
      if (pad) number(entry, 0, 31, 'gamepad button', true);
      else {
        string(entry, 32, 'physical key');
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(entry)) fail('Invalid physical key');
      }
    }
  }
}

function settings(value, complete = true) {
  object(value, SETTING_KEYS, 'settings', complete);
  for (const key of Object.keys(value)) {
    switch (key) {
      case 'music': case 'effects': number(value[key], 0, 1, key); break;
      case 'muted': boolean(value[key], key); break;
      case 'touchScale': number(value[key], 0.5, 2, key); break;
      case 'touchMode': if (!['auto', 'on', 'off'].includes(value[key])) fail('Invalid touchMode'); break;
      case 'bindings': bindings(value[key], false); break;
      case 'padBindings': bindings(value[key], true); break;
    }
  }
}

function parse(json) {
  if (typeof json !== 'string' || json.length > MAX_JSON_BYTES) fail('Save JSON is too large or is not text');
  // The UTF-8 bound also limits non-ASCII imports, not just their JS character count.
  if (new TextEncoder().encode(json).byteLength > MAX_JSON_BYTES) fail('Save JSON is too large');
  try { return JSON.parse(json); } catch { fail('Invalid save JSON'); }
}

function index(value) {
  if (!Number.isInteger(value) || value < 0 || value > 2) throw new RangeError('Slot index must be 0, 1, or 2');
}

class Store {
  constructor() {
    this._state = { version: VERSION, slots: [null, null, null], settings: copy(DEFAULT_SETTINGS) };
    this._loaded = false;
    this._storageAvailable = false;
    this._storageError = null;
  }

  get storageAvailable() { this._load(); return this._storageAvailable; }
  get storageError() { this._load(); return this._storageError; }

  _load() {
    if (this._loaded) return;
    this._loaded = true;
    try {
      const storage = globalThis.localStorage;
      if (!storage) throw new Error('Local storage is unavailable');
      const json = storage.getItem(STORAGE_KEY);
      this._storageAvailable = true;
      if (json === null) {
        // Generation two intentionally starts fresh after the emblem rebalance,
        // but keeps the player's device, volume, and control preferences.
        const legacyJson = storage.getItem(LEGACY_STORAGE_KEY);
        if (legacyJson !== null) {
          try {
            const legacy = parse(legacyJson);
            settings(legacy.settings);
            this._state.settings = copy(legacy.settings);
          } catch { /* Invalid legacy data is discarded with the old slots. */ }
          storage.removeItem?.(LEGACY_STORAGE_KEY);
          storage.setItem(STORAGE_KEY, JSON.stringify(this._state));
        }
        return;
      }
      const state = parse(json);
      object(state, ['version', 'slots', 'settings'], 'store', true);
      if (state.version !== VERSION) fail('Unsupported store version');
      if (!Array.isArray(state.slots) || state.slots.length !== 3) fail('Invalid slots');
      state.slots.forEach((entry) => { if (entry !== null) slot(entry); });
      settings(state.settings);
      this._state = copy(state);
    } catch (error) {
      this._storageError = error.message;
      if (!(error instanceof TypeError)) this._storageAvailable = false;
    }
  }

  _commit(next) {
    // One whole-record write keeps progress and preferences atomic in localStorage.
    const json = JSON.stringify(next);
    if (new TextEncoder().encode(json).byteLength > MAX_JSON_BYTES) fail('Save store is too large');
    try {
      const storage = globalThis.localStorage;
      if (!storage) throw new Error('Local storage is unavailable');
      storage.setItem(STORAGE_KEY, json);
      this._storageAvailable = true;
      this._storageError = null;
    } catch (error) {
      this._storageAvailable = false;
      this._storageError = error.message;
    }
    this._state = next;
  }

  slots() { this._load(); return copy(this._state.slots); }

  get(at) { index(at); this._load(); return copy(this._state.slots[at]); }

  create(at) {
    index(at);
    this._load();
    const entry = {
      version: VERSION, name: `Boco ${at + 1}`, area: 0, checkpoint: null, health: 3,
      defeated: [], emblems: [], playtime: 0, completed: false,
      assists: copy(DEFAULT_ASSISTS), updatedAt: Date.now(),
    };
    const next = copy(this._state);
    next.slots[at] = entry;
    this._commit(next);
    return copy(entry);
  }

  save(at, patch) {
    index(at);
    this._load();
    slot(patch, false);
    const previous = this._state.slots[at];
    if (!previous) throw new Error('Cannot save an empty slot; create it first');
    const entry = { ...copy(previous), ...copy(patch) };
    if (own(patch, 'assists')) entry.assists = { ...previous.assists, ...copy(patch.assists) };
    entry.area = Math.max(previous.area, entry.area);
    entry.updatedAt = Date.now();
    slot(entry);
    const next = copy(this._state);
    next.slots[at] = entry;
    this._commit(next);
    return copy(entry);
  }

  delete(at) {
    index(at);
    this._load();
    const next = copy(this._state);
    next.slots[at] = null;
    this._commit(next);
  }

  export(at) {
    const entry = this.get(at);
    if (!entry) throw new Error('Cannot export an empty slot');
    return JSON.stringify(entry, null, 2);
  }

  import(at, json) {
    index(at);
    const entry = parse(json);
    slot(entry);
    this._load();
    const next = copy(this._state);
    next.slots[at] = copy(entry);
    this._commit(next);
    return copy(entry);
  }

  getSettings() { this._load(); return copy(this._state.settings); }

  saveSettings(patch) {
    this._load();
    settings(patch, false);
    const next = copy(this._state);
    next.settings = { ...next.settings, ...copy(patch) };
    settings(next.settings);
    this._commit(next);
    return copy(next.settings);
  }
}

export const SaveStore = new Store();
