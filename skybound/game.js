import { createArt, createBackdrop } from './art.js';
import { LEVELS } from './levels.js';
import { chapterAt, ROOST_EMBLEM_GOAL } from './campaign.js';
import { InputController } from './input.js';
import { Shell } from './shell.js';
import { SaveStore } from './saves.js';
import { AudioEngine } from './audio.js';
import { MOVE, overlaps, canLand, isStomp, attackBox, approach } from './mechanics.js';
import { navigationSurfaces, groundDirection, constrainFlight } from './enemy-navigation.js';

const Phaser = window.Phaser;
const audio = new AudioEngine();
audio.setSettings(SaveStore.getSettings());
const controls = new InputController();
controls.bind();
let shell;
let game;
const bodyRect = (object) => ({ x: object.body.x, y: object.body.y, width: object.body.width, height: object.body.height });
const emblemCount = (save) => Math.min(ROOST_EMBLEM_GOAL, save?.emblems?.length || 0);
const maxHealthFor = (save) => Math.max(save?.assists?.extraHealth ? 5 : 3,
  3 + Math.min(2, Math.floor(emblemCount(save) / 4)));

class Play extends Phaser.Scene {
  constructor() { super('Play'); }

  create(data = {}) {
    createArt(this);
    this.slotIndex = Number.isInteger(data.slot) ? data.slot : null;
    this.save = this.slotIndex === null ? null : (SaveStore.get(this.slotIndex) || SaveStore.create(this.slotIndex));
    this.areaIndex = this.save ? Math.min(3, Math.max(0, data.area ?? this.save.area)) : 0;
    this.level = LEVELS[this.areaIndex];
    this.currentChapter = null;
    this.chapterIntroRemaining = 0;
    this.clock = 0;
    this.pendingPlaytime = 0;
    this.mode = this.save ? 'playing' : 'title';
    this.facing = 1;
    this.invulnerableUntil = 0;
    this.hurtUntil = 0;
    this.attackUntil = 0;
    this.attackAnimationUntil = 0;
    this.attackReady = 0;
    this.coyoteUntil = 0;
    this.jumpBufferedUntil = 0;
    this.dropUntil = 0;
    this.gliding = false;
    this.glideToggled = false;
    this.deathUntil = 0;
    this.damageCount = 0;
    this.maxHealth = maxHealthFor(this.save);
    this.health = this.maxHealth;
    this.attackVictims = new Set();
    this.springReady = 0;
    this.bossEngaged = false;
    this.bossDefeated = false;
    this.bossState = null;
    this.areaFinished = false;
    this.visitedCheckpoints = new Set();
    this.collected = new Set(this.save?.emblems || []);
    const checkpoint = this.save && this.areaIndex === this.save.area && this.level.checkpoints.find((point) => point.id === this.save.checkpoint);
    this.checkpoint = checkpoint || { ...this.level.spawn, id: null };
    this.backdrop = createBackdrop(this, this.level.id, this.level.width, this.level.height);
    this.physics.world.setBounds(0, -160, this.level.width, this.level.height + 400);
    this.cameras.main.setBounds(0, 0, this.level.width, this.level.height);
    this.cameras.main.roundPixels = true;
    this.ground = this.physics.add.staticGroup();
    this.ledges = this.physics.add.group({ allowGravity: false, immovable: true });
    this.buildTerrain();
    // Distant optional ledges do not need dynamic physics until approached.
    for (const platform of this.ledges.getChildren()) platform.body.enable = Math.abs(platform.x - this.checkpoint.x) < 800;
    this.player = this.physics.add.sprite(this.checkpoint.x, this.checkpoint.y, 'boco-idle').setOrigin(0.5, 1).setDepth(8);
    this.player.body.setSize(18, 26).setOffset(7, 6);
    this.player.body.setMaxVelocity(150, 520).setCollideWorldBounds(true);
    this.previousFeet = this.player.y;
    this.previousVelocityY = 0;
    this.physics.add.collider(this.player, this.ground);
    this.physics.add.collider(this.player, this.ledges, undefined, (_player, platform) => {
      if (!platform.getData('oneWay')) return true;
      return canLand(this.previousFeet, this.player.body.velocity.y, platform.body.top, this.dropUntil, this.clock);
    });
    this.physics.add.overlap(this.player, this.springs, (_player, spring) => this.springContact(spring));
    this.enemies = this.physics.add.group();
    this.seeds = this.physics.add.group({ allowGravity: false });
    this.enemyData = new Map();
    this.buildEnemies();
    this.physics.add.collider(this.enemies, this.ground, undefined, (enemy) => !enemy.getData('flying'));
    this.physics.add.collider(this.enemies, this.ledges, undefined, (enemy, platform) => !enemy.getData('flying') && enemy.body.velocity.y >= 0 && enemy.body.bottom <= platform.body.top + 8);
    this.physics.add.overlap(this.player, this.enemies, (_player, enemy) => this.enemyContact(enemy));
    this.physics.add.overlap(this.player, this.seeds, (_player, seed) => { if (this.mode === 'playing') { this.damage(seed.x); seed.destroy(); } });
    this.pickups = this.physics.add.staticGroup();
    this.buildPickups();
    this.physics.add.overlap(this.player, this.pickups, (_player, pickup) => this.pickup(pickup));
    this.buildBoss();
    this.followPlayer();
    this.events.once('shutdown', () => {
      this.backdrop?.destroy();
      this.flushSave();
      controls.clear();
    });
    controls.clear();
    if (this.save) {
      shell.hide();
      audio.resume();
      this.currentChapter = chapterAt(this.level, this.player.x);
      this.backdrop.setChapter(this.currentChapter?.variant || 0);
      audio.startMusic(this.level.id, this.currentChapter?.variant || 0);
      shell.showToast(this.level.name);
      if (!SaveStore.storageAvailable) shell.showToast('Saving unavailable - export a backup');
    } else {
      this.physics.pause();
      if (data.menu === 'slots') shell.showSlots(); else shell.showTitle();
      audio.resume();
      audio.startMenuMusic();
    }
    this.refreshHud();
  }

  buildTerrain() {
    for (const rect of this.level.terrain) {
      this.add.tileSprite(rect.x, rect.y, rect.w, rect.h, `${this.level.id}-fill`).setOrigin(0).setDepth(0);
      this.add.tileSprite(rect.x, rect.y, rect.w, Math.min(16, rect.h), `${this.level.id}-ground`).setOrigin(0).setDepth(1);
      const zone = this.add.zone(rect.x, rect.y, rect.w, rect.h).setOrigin(0);
      this.ground.add(zone);
    }
    for (const rect of this.level.platforms) {
      const sprite = this.add.tileSprite(rect.x, rect.y, rect.w, rect.h || 8, 'platform').setOrigin(0).setDepth(3);
      this.ledges.add(sprite);
      sprite.body.setAllowGravity(false).setImmovable(true);
      sprite.setData('oneWay', Boolean(rect.oneWay));
      sprite.setData('motion', rect.move ? { ...rect.move, origin: rect[rect.move.axis], dir: 1 } : null);
    }
    this.springs = this.physics.add.staticGroup();
    for (const point of this.level.springs || []) {
      const spring = this.springs.create(point.x, point.y, 'spring-bloom').setOrigin(0.5, 1).setDepth(4);
      spring.body.setSize(14, 6).setOffset(1, 2);
      spring.refreshBody();
    }
    this.chapterMarkers = [];
    for (const chapter of this.level.chapters?.filter(item => item.kind === 'act') || []) {
      const x = chapter.endX - 20;
      const surface = this.level.terrain.find(rect => x >= rect.x && x < rect.x + rect.w)?.y;
      if (surface !== undefined) this.chapterMarkers.push(this.add.image(x, surface, 'chapter-marker').setOrigin(0.5, 1).setDepth(4));
    }
    this.gustVisuals = this.level.gusts.map((gust) => {
      const strips = [];
      for (let y = gust.y; y < gust.y + gust.h; y += 32) strips.push(this.add.image(gust.x + gust.w / 2, y, 'gust').setAlpha(0.4).setDepth(2));
      return { ...gust, strips };
    });
  }

  followPlayer() {
    this.cameras.main.startFollow(this.player, true, 0.14, 0.32, -35, 0);
    this.cameras.main.setDeadzone(60, 20);
  }

  buildEnemies() {
    for (const entry of this.level.enemies) {
      const enemy = this.enemies.create(entry.x, entry.y, entry.type).setOrigin(0.5, 1).setDepth(6);
      const flying = entry.type === 'bird' || entry.type === 'moth';
      enemy.body.setSize(flying ? 22 : 23, flying ? 14 : 21).setOffset(flying ? 5 : 4, flying ? 10 : 11);
      enemy.body.setAllowGravity(!flying);
      enemy.setData('flying', flying);
      this.enemyData.set(enemy, { ...entry, startX: entry.x, startY: entry.y, dir: -1, timer: 0, phase: 'patrol', hp: entry.type === 'shellback' ? 2 : 1, dead: false,
        surfaces: navigationSurfaces(this.level, entry), worldWidth: this.level.width, worldHeight: this.level.height, suspended: false });
    }
  }

  buildPickups() {
    const add = (point, kind, key) => {
      const sprite = this.pickups.create(point.x, point.y, key).setOrigin(0.5, 1).setDepth(5);
      sprite.refreshBody();
      sprite.setData('kind', kind).setData('id', point.id);
      return sprite;
    };
    for (const point of this.level.flowers) add(point, 'flower', 'flower');
    if (this.collected.size < ROOST_EMBLEM_GOAL) {
      for (const point of this.level.emblems) if (!this.collected.has(point.id)) add(point, 'emblem', 'emblem');
    }
    for (const point of this.level.checkpoints) {
      const sprite = add(point, 'checkpoint', 'checkpoint');
      if (point.id === this.checkpoint.id) { this.visitedCheckpoints.add(point.id); sprite.setTint(0xffed88); }
    }
    add({ ...this.level.exit, id: 'exit' }, 'exit', 'exit');
  }

  buildBoss() {
    const spec = this.level.boss;
    this.boss = this.physics.add.sprite(spec.x, spec.y, `boss-${spec.type}`).setOrigin(0.5, 1).setDepth(7);
    const width = spec.type === 'moth' ? 20 : spec.type === 'bird' ? 38 : 46;
    this.boss.body.setSize(width, 44).setOffset((64 - width) / 2, 20).setAllowGravity(false).setImmovable(true);
    this.bossState = { hp: 6, max: 6, phase: 'sleep', until: 0, started: 0, facing: -1, hitUntil: 0,
      flashUntil: 0, targetX: 0, targetY: 0, volley: 0, openingShown: false };
    this.bossCue = this.add.image(spec.x, spec.y - 68, 'boss-warning').setOrigin(0.5, 1).setDepth(9).setVisible(false);
    this.bossOpenCue = this.add.image(spec.x, spec.y - 68, 'boss-vulnerable').setOrigin(0.5, 1).setDepth(9).setVisible(false);
    this.physics.add.overlap(this.player, this.boss, () => this.bossContact());
    const arena = spec.arena;
    this.gate = this.add.tileSprite(arena.x + arena.w - 12, arena.y, 12, arena.h, `${this.level.id}-ground`).setOrigin(0).setDepth(4);
    this.gateZone = this.add.zone(arena.x + arena.w - 12, arena.y, 12, arena.h).setOrigin(0);
    this.physics.add.existing(this.gateZone, true);
    this.physics.add.collider(this.player, this.gateZone, undefined, () => !this.bossDefeated);
    this.bossPlatforms = [];
    if (spec.type === 'plant') {
      for (const [dx, rise] of [[64, 32], [136, 64], [224, 32]]) {
        const ledge = this.add.tileSprite(arena.x + dx, spec.y - rise, 56, 8, 'platform').setOrigin(0).setDepth(4).setTint(0xd68bac).setVisible(false);
        this.ledges.add(ledge);
        ledge.body.setAllowGravity(false).setImmovable(true);
        ledge.setData('oneWay', true);
        ledge.body.enable = false;
        this.bossPlatforms.push(ledge);
      }
    }
  }

  pickup(sprite) {
    if (this.mode !== 'playing' || this.deathUntil) return;
    const kind = sprite.getData('kind');
    const id = sprite.getData('id');
    if (kind === 'flower') {
      if (this.health >= this.maxHealth) return;
      this.health = Math.min(this.maxHealth, this.health + 1);
      sprite.destroy();
      audio.effect('flower');
    } else if (kind === 'emblem') {
      if (this.collected.has(id)) return;
      const previous = Math.min(ROOST_EMBLEM_GOAL, this.collected.size);
      this.collected.add(id);
      sprite.destroy();
      const progress = Math.min(ROOST_EMBLEM_GOAL, this.collected.size);
      const patch = { emblems: [...this.collected] };
      if (progress >= ROOST_EMBLEM_GOAL && ['meadow', 'cliff', 'canopy'].every(area => this.save.defeated?.includes(area))) {
        Object.assign(patch, { area: 3, checkpoint: null });
      }
      this.persist(patch);
      const previousMaximum = this.maxHealth;
      this.maxHealth = maxHealthFor(this.save);
      if (this.maxHealth > previousMaximum) this.health = this.maxHealth;
      if (progress >= ROOST_EMBLEM_GOAL) {
        for (const pickup of [...this.pickups.getChildren()]) if (pickup.getData('kind') === 'emblem') pickup.destroy();
      }
      audio.effect('flower');
      if ((previous < 4 && progress >= 4) || (previous < 8 && progress >= 8)) {
        shell.showToast(`Heart Flower restored - max health ${this.maxHealth}`);
      } else if (previous < ROOST_EMBLEM_GOAL && progress >= ROOST_EMBLEM_GOAL) {
        shell.showToast('All Sky Emblems found - High Roost seal restored');
      } else {
        const next = progress < 4 ? 4 : progress < 8 ? 8 : ROOST_EMBLEM_GOAL;
        shell.showToast(`Sky Emblem ${progress}/${ROOST_EMBLEM_GOAL} - next blessing at ${next}`);
      }
    } else if (kind === 'checkpoint') {
      if (this.visitedCheckpoints.has(id)) return;
      this.visitedCheckpoints.add(id);
      this.checkpoint = this.level.checkpoints.find((point) => point.id === id);
      this.health = this.maxHealth;
      sprite.setTint(0xffed88);
      this.persist(this.areaIndex === this.save.area ? { checkpoint: id, health: this.health } : {});
      audio.effect('checkpoint');
      shell.showToast(this.checkpoint.name || 'Checkpoint');
    } else if (kind === 'exit' && this.bossDefeated && !this.areaFinished) {
      this.finishArea();
    }
    this.refreshHud();
  }

  persist(patch = {}) {
    if (this.slotIndex === null) return;
    this.save = SaveStore.save(this.slotIndex, { ...patch, playtime: this.save.playtime + this.pendingPlaytime });
    this.pendingPlaytime = 0;
  }

  flushSave() {
    if (this.save && this.pendingPlaytime > 0) this.persist();
  }

  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.physics.pause();
    this.tweens.pauseAll();
    controls.clear();
    audio.pause();
    this.flushSave();
    shell.showPause();
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.save = SaveStore.get(this.slotIndex);
    this.maxHealth = maxHealthFor(this.save);
    this.health = Math.min(this.maxHealth, this.health);
    this.mode = 'playing';
    this.physics.resume();
    this.tweens.resumeAll();
    controls.clear();
    this.jumpBufferedUntil = 0;
    this.previousFeet = this.player.body.bottom;
    shell.hide();
    audio.resume();
    this.refreshHud();
  }

  update(_time, delta) {
    controls.update();
    if (!this.player) return;
    const dt = Math.min(delta / 1000, 1 / 30);
    this.backdrop.update(this.cameras.main, this.clock * 1000);
    if (this.mode === 'title') {
      this.clock += dt;
      this.player.setTexture(`boco-run${Math.floor(this.clock * 9) % 6}`);
      return;
    }
    if (this.mode === 'boss-intro') {
      this.clock += dt;
      this.updateBossIntro();
      return;
    }
    if (this.mode === 'chapter') {
      this.clock += dt;
      this.chapterIntroRemaining -= dt;
      if (this.chapterIntroRemaining <= 0) this.finishChapterIntro();
      return;
    }
    if (this.mode !== 'playing') return;
    if (controls.pressed('pause')) { this.pause(); return; }
    this.clock += dt;
    this.pendingPlaytime += dt;
    if (this.pendingPlaytime > 15) this.persist();
    if (this.deathUntil) {
      if (this.clock >= this.deathUntil) this.respawn();
      return;
    }
    this.updatePlatforms();
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateAttack();
    for (const seed of this.seeds.getChildren()) if (this.clock > seed.getData('expires') || seed.y > this.level.height + 60) seed.destroy();
    this.animatePlayer();
    if (this.player.y > this.level.height + 45) this.die();
    this.previousFeet = this.player.body.bottom;
    this.previousVelocityY = this.player.body.velocity.y;
    this.refreshHud();
  }

  updatePlatforms() {
    for (const platform of this.ledges.getChildren()) {
      if (!this.bossPlatforms.includes(platform)) {
        const nearby = Math.abs(platform.x - this.player.x) < 800;
        if (platform.body.enable !== nearby) {
          platform.body.enable = nearby;
          if (nearby) platform.body.reset(platform.x, platform.y);
          else platform.body.setVelocity(0, 0);
        }
        if (!nearby) continue;
      }
      const motion = platform.getData('motion');
      if (!motion) continue;
      if (platform[motion.axis] >= motion.origin + motion.distance) motion.dir = -1;
      if (platform[motion.axis] <= motion.origin) motion.dir = 1;
      platform.body.setVelocity(motion.axis === 'x' ? motion.dir * motion.speed : 0, motion.axis === 'y' ? motion.dir * motion.speed : 0);
    }
    for (const gust of this.gustVisuals) gust.strips.forEach((strip, i) => {
      strip.y = gust.y + ((i * 32 - this.clock * 36) % gust.h + gust.h) % gust.h;
      strip.setAlpha(0.2 + Math.sin(this.clock * 3 + i) * 0.1);
    });
  }

  updatePlayer(dt) {
    const body = this.player.body;
    const grounded = body.blocked.down || body.touching.down;
    if (grounded) { this.coyoteUntil = this.clock + MOVE.coyote; this.glideToggled = false; }
    if (controls.pressed('jump')) this.jumpBufferedUntil = this.clock + MOVE.buffer;
    const crouching = grounded && controls.down('down');
    const standing = { x: this.player.x - 9, y: this.player.y - 26, width: 18, height: 26 };
    const ceiling = this.level.terrain.some((rect) => overlaps(standing, { x: rect.x, y: rect.y, width: rect.w, height: rect.h }));
    const lowBody = crouching || (body.height === 18 && ceiling);
    if (body.height !== (lowBody ? 18 : 26)) body.setSize(18, lowBody ? 18 : 26, false).setOffset(7, lowBody ? 14 : 6);
    if (this.jumpBufferedUntil > this.clock && this.coyoteUntil > this.clock) {
      if (controls.down('down')) {
        this.dropUntil = this.clock + 0.22;
        body.setVelocityY(70);
      } else {
        body.setVelocityY(-MOVE.jump);
        audio.effect('jump');
      }
      this.coyoteUntil = 0;
      this.jumpBufferedUntil = 0;
    }
    if (!controls.down('jump') && body.velocity.y < -150) body.setVelocityY(-150);
    const direction = Number(controls.down('right')) - Number(controls.down('left'));
    if (this.clock >= this.hurtUntil) {
      body.setVelocityX(approach(body.velocity.x, direction * MOVE.speed * (crouching ? 0.35 : 1), dt * (direction ? MOVE.acceleration : MOVE.braking)));
      if (direction) this.facing = direction;
    }
    if (this.save.assists.toggleGlide && controls.pressed('glide')) this.glideToggled = !this.glideToggled;
    const wantingGlide = this.save.assists.toggleGlide ? this.glideToggled : controls.down('glide');
    const wasGliding = this.gliding;
    this.gliding = !grounded && (body.velocity.y >= 0 || wasGliding) && wantingGlide && this.clock >= this.hurtUntil;
    body.setGravityY(this.gliding ? -MOVE.gravity + 180 : 0);
    if (this.gliding) {
      body.setVelocityY(Math.min(body.velocity.y, MOVE.glideFall));
      if (!wasGliding) audio.effect('glide');
      for (const gust of this.level.gusts) if (overlaps(bodyRect(this.player), { x: gust.x, y: gust.y, width: gust.w, height: gust.h })) body.setVelocityY(-115);
    }
    if (controls.pressed('attack') && this.clock >= this.attackReady && this.clock >= this.hurtUntil) {
      this.attackUntil = this.clock + 0.14;
      this.attackAnimationUntil = this.clock + 0.3;
      this.attackReady = this.clock + 0.3;
      this.attackVictims.clear();
      audio.effect('peck');
    }
    this.player.setFlipX(this.facing < 0);
  }

  springContact(spring) {
    if (this.mode !== 'playing' || this.clock < this.springReady || this.player.body.velocity.y < -40) return;
    if (this.player.body.bottom > spring.body.top + 10) return;
    this.player.setVelocityY(-365);
    this.coyoteUntil = 0;
    this.springReady = this.clock + 0.22;
    this.gliding = false;
    audio.effect('spring');
  }

  animatePlayer() {
    const body = this.player.body;
    const grounded = body.blocked.down || body.touching.down;
    let key = 'boco-idle';
    if (this.clock < this.hurtUntil) key = 'boco-hurt';
    else if (this.clock < this.attackAnimationUntil) {
      const elapsed = 0.3 - (this.attackAnimationUntil - this.clock);
      const frame = elapsed < 0.05 ? 0 : elapsed < 0.14 ? 1 : elapsed < 0.23 ? 2 : 3;
      key = `boco-${grounded ? 'peck' : 'swipe'}${frame}`;
    }
    else if (this.gliding) key = `boco-glide${Math.floor(this.clock * 6) % 2}`;
    else if (!grounded) key = body.velocity.y < 0 ? 'boco-jump' : 'boco-fall';
    else if (controls.down('down')) key = 'boco-duck';
    else if (Math.abs(body.velocity.x) > 8) key = `boco-run${Math.floor(this.clock * 10) % 6}`;
    this.player.setTexture(key);
    this.player.setAlpha(this.clock < this.invulnerableUntil && Math.floor(this.clock * 12) % 2 ? 0.6 : 1);
  }

  updateEnemies(dt) {
    for (const [enemy, state] of this.enemyData) {
      if (!enemy.active || state.dead) continue;
      const body = enemy.body;
      const distance = Math.abs(enemy.x - this.player.x);
      if (distance > (state.suspended ? 600 : 720)) {
        if (!state.suspended) {
          state.sleepVelocity = { x: body.velocity.x, y: body.velocity.y };
          state.suspended = true;
          body.enable = false;
        }
        continue;
      }
      if (state.suspended) {
        state.suspended = false;
        body.enable = true;
        body.reset(enemy.x, enemy.y);
        body.setVelocity(state.sleepVelocity.x, state.sleepVelocity.y);
      }
      state.timer -= dt;
      if (state.type === 'bird' || state.type === 'moth') {
        const flight = state.type === 'bird' ? 25 : 15;
        if (Math.abs(enemy.x - state.startX) >= (state.range || 55)) state.dir = enemy.x > state.startX ? -1 : 1;
        body.setVelocityX(state.dir * flight);
        const bob = state.type === 'bird' ? 5 : 16;
        const targetY = state.startY + Math.sin(this.clock * 2 + state.startX) * bob;
        body.setVelocityY((targetY - enemy.y) * 4);
        if (state.type === 'bird' && state.phase === 'patrol' && Math.abs(enemy.x - this.player.x) < 100 && state.timer <= 0) {
          state.phase = 'warn'; state.timer = 0.6;
        }
        if (state.phase === 'warn') {
          enemy.setTint(0xffcc78);
          body.setVelocity(0, 0);
          if (state.timer < 0.08) { state.phase = 'dive'; state.timer = 0.55; state.targetX = this.player.x; state.targetY = Math.min(this.player.y - 14, state.startY + 65); }
        } else if (state.phase === 'dive') {
          enemy.clearTint();
          const angle = Math.atan2(state.targetY - enemy.y, state.targetX - enemy.x);
          body.setVelocity(Math.cos(angle) * 115, Math.sin(angle) * 115);
          if (state.timer <= 0) { state.phase = 'patrol'; state.timer = 2.5; }
        }
        constrainFlight(enemy, state, dt);
      } else if (state.type === 'plant') {
        body.setVelocityX(0);
        if (state.timer <= 0 && Math.abs(enemy.x - this.player.x) < 210) { state.phase = state.phase === 'warn' ? 'patrol' : 'warn'; state.timer = state.phase === 'warn' ? 0.7 : 2.8; if (state.phase === 'patrol') this.fireSeed(enemy.x, enemy.y - 18, this.player.x, this.player.y - 15, 85); }
        if (state.phase === 'warn') enemy.setTint(0xffd68c); else enemy.clearTint();
      } else if (state.type === 'hopper') {
        body.setVelocityX(0);
        if (state.timer <= 0 && Math.abs(enemy.x - this.player.x) < 145 && (body.blocked.down || body.touching.down)) {
          state.phase = state.phase === 'warn' ? 'patrol' : 'warn';
          state.timer = state.phase === 'warn' ? 0.55 : 2.3;
          if (state.phase === 'patrol') {
            state.dir = this.player.x < enemy.x ? -1 : 1;
            body.setVelocity(groundDirection(enemy, state, 65, dt) * 65, -210);
          }
        }
        if (!body.blocked.down && !body.touching.down && state.phase === 'patrol') body.setVelocityX(groundDirection(enemy, state, 65, dt) * 65);
        if (state.phase === 'warn') enemy.setTint(0xffdb7b); else enemy.clearTint();
      } else {
        const speed = state.type === 'shellback' ? 22 : 33;
        body.setVelocityX(groundDirection(enemy, state, speed, dt) * speed);
      }
      const frame = Math.floor(this.clock * (enemy.getData('flying') ? 10 : 8)) % 4;
      const texture = `${state.type}-${enemy.getData('flying') ? 'flap' : 'run'}${frame}`;
      const baseTexture = this.textures.exists(texture) ? texture : state.type;
      enemy.setTexture(this.clock < (state.hitUntil || 0) ? `${baseTexture}-hit` : baseTexture);
      enemy.setFlipX(state.dir < 0);
    }
  }

  enemyContact(enemy) {
    const state = this.enemyData.get(enemy);
    if (!state || state.dead || this.mode !== 'playing' || this.deathUntil) return;
    if (isStomp(this.previousFeet, this.previousVelocityY, enemy.body.top)) {
      this.player.setVelocityY(controls.down('jump') ? -MOVE.jump : -210);
      this.coyoteUntil = 0;
      if (state.type !== 'shellback' && state.type !== 'plant') this.killEnemy(enemy);
      else audio.effect('peck');
    } else this.damage(enemy.x);
  }

  killEnemy(enemy) {
    const state = this.enemyData.get(enemy);
    if (!state || state.dead) return;
    state.dead = true;
    enemy.body.enable = false;
    enemy.setTexture(`${state.type}-hit`).clearTint();
    audio.effect('peck');
    this.tweens.add({ targets: enemy, y: enemy.y + 25, angle: this.facing * 60, alpha: 0, delay: 80, duration: 260, onComplete: () => { this.enemyData.delete(enemy); enemy.destroy(); } });
  }

  updateAttack() {
    if (this.clock >= this.attackUntil) return;
    const attack = attackBox(this.player.x, this.player.y, this.facing, !(this.player.body.blocked.down || this.player.body.touching.down));
    for (const [enemy, state] of this.enemyData) {
      if (!enemy.active || state.dead || this.attackVictims.has(enemy) || !overlaps(attack, bodyRect(enemy))) continue;
      this.attackVictims.add(enemy);
      if (state.type === 'shellback') {
        const front = state.dir > 0 ? this.player.x > enemy.x : this.player.x < enemy.x;
        if (!front) { audio.effect('peck'); continue; }
      }
      state.hp--;
      if (state.hp <= 0) this.killEnemy(enemy);
      else { state.hitUntil = this.clock + 0.24; enemy.setTexture(`${state.type}-hit`).clearTint(); state.dir *= -1; audio.effect('hit'); }
    }
    for (const seed of this.seeds.getChildren()) if (overlaps(attack, bodyRect(seed))) seed.destroy();
    if (this.boss?.active && !this.bossDefeated && overlaps(attack, bodyRect(this.boss))) this.hitBoss();
  }

  damage(sourceX) {
    if (this.mode !== 'playing' || this.clock < this.invulnerableUntil || this.deathUntil) return;
    this.damageCount++;
    const cost = this.save.assists.reducedDamage && this.damageCount % 2 === 1 ? 0 : 1;
    this.health -= cost;
    this.invulnerableUntil = this.clock + 1.05;
    this.hurtUntil = this.clock + 0.28;
    this.attackUntil = 0;
    this.player.setVelocity((this.player.x < sourceX ? -1 : 1) * 95, -140);
    this.gliding = false;
    audio.effect('hit');
    if (this.health <= 0) this.die();
    this.refreshHud();
  }

  die() {
    if (this.deathUntil || this.mode !== 'playing') return;
    this.health = 0;
    this.deathUntil = this.clock + 0.65;
    this.player.setTexture('boco-hurt').setAlpha(0.65);
    this.player.setVelocity(0, 0);
    this.player.body.enable = false;
    audio.effect('hit');
    this.refreshHud();
  }

  respawn() {
    this.deathUntil = 0;
    this.attackUntil = 0;
    this.attackAnimationUntil = 0;
    this.health = this.maxHealth;
    this.player.body.enable = true;
    this.player.body.reset(this.checkpoint.x, this.checkpoint.y);
    this.player.setVelocity(0, 0).setAlpha(1);
    this.previousFeet = this.checkpoint.y;
    this.previousVelocityY = 0;
    this.invulnerableUntil = this.clock + 1.1;
    this.hurtUntil = 0;
    this.coyoteUntil = 0;
    this.dropUntil = 0;
    this.gliding = false;
    this.glideToggled = false;
    controls.clear();
    this.seeds.clear(true, true);
    if (this.bossEngaged && !this.bossDefeated) {
      this.bossEngaged = false;
      Object.assign(this.bossState, { hp: 6, phase: 'sleep', until: 0, started: 0, hitUntil: 0, flashUntil: 0, volley: 0, openingShown: false });
      this.boss.body.reset(this.level.boss.x, this.level.boss.y);
      this.setBossTexture(`boss-${this.level.boss.type}`);
      this.boss.clearTint().setAlpha(1);
      this.bossCue.setVisible(false);
      this.bossOpenCue.setVisible(false);
      this.boss.setVelocity(0, 0);
      for (const ledge of this.bossPlatforms) { ledge.setVisible(false); ledge.body.enable = false; }
      this.cameras.main.setBounds(0, 0, this.level.width, this.level.height);
      audio.setMusicChapter(this.currentChapter?.variant || 0);
    }
    this.refreshHud();
  }

  fireSeed(x, y, targetX, targetY, speed = 95) {
    if (this.seeds.countActive() >= 16) return;
    const seed = this.seeds.create(x, y, 'seed').setDepth(7);
    const angle = Math.atan2(targetY - y, targetX - x);
    seed.body.setSize(6, 6).setOffset(1, 1).setAllowGravity(false);
    seed.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    seed.setData('expires', this.clock + 4);
  }

  startBossIntro() {
    const spec = this.level.boss;
    const arena = spec.arena;
    const state = this.bossState;
    this.bossEngaged = true;
    this.mode = 'boss-intro';
    state.phase = 'intro';
    state.started = this.clock;
    state.until = this.clock + 1.65;
    state.targetX = this.player.x;
    state.targetY = this.player.y - 10;
    this.player.setVelocity(0, 0);
    this.physics.pause();
    controls.clear();
    this.cameras.main.stopFollow();
    this.cameras.main.pan((this.player.x + this.boss.x) / 2, arena.y + arena.h / 2, 850, 'Sine.easeInOut');
    this.boss.setAlpha(0);
    this.bossOpenCue.setVisible(false);
    this.tweens.add({ targets: this.boss, alpha: 1, duration: 520, delay: 180, ease: 'Sine.easeOut' });
    audio.startMusic(this.level.id, 6, 'boss');
    audio.effect('boss');
    shell.showToast(spec.name);
  }

  updateBossIntro() {
    const state = this.bossState;
    const key = this.bossAnimationTexture(this.level.boss.type, state);
    this.setBossTexture(key);
    this.boss.setFlipX(this.player.x < this.boss.x);
    if (this.clock < state.until) return;
    state.phase = 'warn';
    state.started = this.clock;
    state.until = this.clock + 1.25;
    this.mode = 'playing';
    this.physics.resume();
    this.cameras.main.setBounds(this.level.boss.arena.x, Math.max(0, this.level.boss.arena.y - 20), this.level.boss.arena.w, Math.max(240, this.level.boss.arena.h));
    this.followPlayer();
    controls.clear();
    this.previousFeet = this.player.body.bottom;
  }

  updateBoss(dt) {
    if (this.bossDefeated) return;
    const spec = this.level.boss;
    const arena = spec.arena;
    const boss = this.boss;
    const state = this.bossState;
    if (!this.bossEngaged) {
      this.bossCue.setVisible(false);
      this.bossOpenCue.setVisible(false);
      if (this.player.x < arena.x + 20) return;
      this.startBossIntro();
      return;
    }
    const phase = state.hp <= 2 ? 3 : state.hp <= 4 ? 2 : 1;
    const minX = arena.x + 40, maxX = arena.x + arena.w - 38;
    this.player.x = Math.max(arena.x + 10, Math.min(this.player.x, arena.x + arena.w - 22));
    if (state.phase === 'warn') {
      boss.setVelocity(0, 0);
      boss.setTint(Math.floor(this.clock * 6) % 2 ? 0xffa574 : 0xffd778);
      this.bossCue.setVisible(true).setPosition(boss.x, boss.y - 66).setAlpha(0.65 + Math.sin(this.clock * 12) * 0.3);
      if (this.clock >= state.until) {
        state.phase = 'attack';
        state.started = this.clock;
        state.until = this.clock + (spec.type === 'plant' ? 1.2 : 1.8);
        state.facing = this.player.x < boss.x ? -1 : 1;
        state.targetX = this.player.x;
        state.targetY = Math.min(spec.y - 10, this.player.y - 12);
        state.volley = 0;
        boss.clearTint();
        this.bossCue.setVisible(false);
      }
    } else if (state.phase === 'attack') {
      if (spec.type === 'beetle') {
        boss.setVelocity(state.facing * (120 + phase * 20), 0);
        if (boss.x <= minX || boss.x >= maxX) this.bossRecover(1.9 - phase * 0.15);
      } else if (spec.type === 'plant') {
        boss.setVelocity(0, 0);
        const volley = Math.floor((this.clock - (state.until - 1.2)) / 0.35);
        if (volley >= state.volley && state.volley < phase + 1) {
          this.fireSeed(boss.x, boss.y - 35, state.targetX, state.targetY, 90);
          state.volley++;
        }
      } else {
        const angle = Math.atan2(state.targetY - boss.y, state.targetX - boss.x);
        boss.setVelocity(Math.cos(angle) * (105 + phase * 15), Math.sin(angle) * (105 + phase * 15));
        if (Math.hypot(boss.x - state.targetX, boss.y - state.targetY) < 18 || boss.x < minX || boss.x > maxX) this.bossRecover(1.8);
      }
      if (this.clock >= state.until) this.bossRecover(1.7);
    } else if (state.phase === 'recover') {
      boss.setTint(0xfff3b0);
      if (spec.type === 'moth' || spec.type === 'bird') {
        const restY = spec.y - 12;
        boss.setVelocityY((restY - boss.y) * 3);
      }
      if (this.clock >= state.until) {
        state.phase = 'return'; state.started = this.clock; state.until = this.clock + 1.2;
      }
    } else if (state.phase === 'return') {
      for (const ledge of this.bossPlatforms) { ledge.setVisible(false); ledge.body.enable = false; }
      boss.clearTint();
      boss.setVelocity((spec.x - boss.x) * 3, (spec.y - boss.y) * 3);
      if (this.clock >= state.until) { state.phase = 'warn'; state.started = this.clock; state.until = this.clock + Math.max(0.75, 1.2 - phase * 0.1); }
    }
    if (boss.x < minX || boss.x > maxX) { boss.x = Math.max(minX, Math.min(maxX, boss.x)); boss.body.updateFromGameObject(); }
    if (boss.y > spec.y) { boss.y = spec.y; boss.body.updateFromGameObject(); }
    boss.setFlipX(state.facing < 0);
    const animation = this.bossAnimationTexture(spec.type, state);
    this.setBossTexture(`${animation}${this.clock < (state.flashUntil || 0) ? '-hit' : ''}`);
    boss.setAlpha(this.clock < state.hitUntil && Math.floor(this.clock * 12) % 2 ? 0.5 : 1);
    const open = state.phase === 'recover';
    this.bossOpenCue.setVisible(open).setPosition(boss.x, boss.y - 67)
      .setAlpha(open ? 0.72 + Math.sin(this.clock * 14) * 0.28 : 0);
  }

  bossAnimationTexture(type, state) {
    const phase = state.phase === 'sleep' || state.phase === 'intro' ? 'idle' : state.phase;
    const counts = { idle: 4, warn: 4, attack: 6, recover: 4, return: 4 };
    const count = counts[phase] || 4;
    const speed = phase === 'attack' ? 10 : phase === 'warn' ? 7 : 5;
    const frame = Math.floor(Math.max(0, this.clock - (state.started || 0)) * speed) % count;
    return `boss-${type}-${phase}${frame}`;
  }

  setBossTexture(key) {
    const fallback = `boss-${this.level.boss.type}`;
    const damageFallback = `${fallback}-hit`;
    let resolved = fallback;
    if (this.textures.exists(key)) resolved = key;
    else if (key.endsWith('-hit') && this.textures.exists(damageFallback)) resolved = damageFallback;
    this.boss.setTexture(resolved);
  }

  bossRecover(duration) {
    const state = this.bossState;
    state.phase = 'recover';
    state.started = this.clock;
    state.until = this.clock + duration;
    this.boss.setVelocity(0, 0);
    this.bossOpenCue.setVisible(true).setPosition(this.boss.x, this.boss.y - 67).setAlpha(1);
    audio.effect('opening');
    if (!state.openingShown) {
      state.openingShown = true;
      shell.showToast('Opening! Strike while the guardian rests');
    }
    for (const ledge of this.bossPlatforms) { ledge.setVisible(true); ledge.body.enable = true; }
  }

  bossContact() {
    if (!this.bossEngaged || this.bossDefeated || this.mode !== 'playing' || this.deathUntil) return;
    const stomping = isStomp(this.previousFeet, this.previousVelocityY, this.boss.body.top);
    const dangerous = ['warn', 'attack', 'return'].includes(this.bossState.phase);
    if (stomping) {
      this.player.setVelocityY(controls.down('jump') ? -MOVE.jump : -225);
      if (this.bossState.phase === 'recover') this.hitBoss();
      else if (dangerous) this.damage(this.boss.x);
    } else if (dangerous) this.damage(this.boss.x);
  }

  hitBoss() {
    const state = this.bossState;
    if (!this.bossEngaged || this.bossDefeated || state.phase !== 'recover' || this.clock < state.hitUntil) return;
    state.hitUntil = this.clock + 0.7;
    state.flashUntil = this.clock + 0.24;
    this.setBossTexture(`boss-${this.level.boss.type}-hit`);
    this.boss.clearTint();
    state.hp--;
    audio.effect('hit');
    if (state.hp > 0) return;
    this.bossDefeated = true;
    this.bossCue.setVisible(false);
    this.bossOpenCue.setVisible(false);
    this.boss.body.enable = false;
    this.boss.setVelocity(0, 0);
    this.seeds.clear(true, true);
    this.gate.destroy();
    this.gateZone.body.enable = false;
    for (const ledge of this.bossPlatforms) { ledge.setVisible(false); ledge.body.enable = false; }
    this.cameras.main.setBounds(0, 0, this.level.width, this.level.height);
    this.health = this.maxHealth;
    const defeated = [...new Set([...this.save.defeated, this.level.id])];
    const roostReady = ['meadow', 'cliff', 'canopy'].every(id => defeated.includes(id)) && this.collected.size >= ROOST_EMBLEM_GOAL;
    const nextArea = this.areaIndex === 2 && !roostReady ? 2 : Math.min(3, this.areaIndex + 1);
    const patch = { defeated, health: this.health, completed: this.save.completed || this.areaIndex >= 2 };
    if (nextArea > this.save.area) Object.assign(patch, { area: nextArea, checkpoint: null });
    this.persist(patch);
    this.tweens.add({ targets: this.boss, y: this.boss.y + 30, angle: 25, alpha: 0, duration: 650, onComplete: () => this.boss.destroy() });
    audio.setMusicChapter(6);
    audio.effect('win');
    shell.showToast('Garden restored');
  }

  startChapterIntro(chapter) {
    if (this.mode !== 'playing' || chapter?.kind !== 'act') return;
    this.mode = 'chapter';
    this.chapterIntroRemaining = 1.8;
    this.physics.pause();
    controls.clear();
    shell.showChapter(chapter, this.level.name);
    audio.effect('chapter');
  }

  finishChapterIntro() {
    if (this.mode !== 'chapter') return;
    this.mode = 'playing';
    this.chapterIntroRemaining = 0;
    this.physics.resume();
    controls.clear();
    this.previousFeet = this.player.body.bottom;
    shell.hideChapter();
  }

  finishArea() {
    this.areaFinished = true;
    this.mode = 'victory';
    this.physics.pause();
    this.player.setTexture('boco-win').setAlpha(1);
    controls.clear();
    this.flushSave();
    audio.effect('win');
    shell.showVictory(this.slotIndex, this.areaIndex, this.areaIndex >= 2);
  }

  refreshHud() {
    const chapter = chapterAt(this.level, this.player.x);
    if (chapter?.id !== this.currentChapter?.id) {
      const previous = this.currentChapter;
      this.currentChapter = chapter;
      this.backdrop.setChapter(chapter?.variant || 0);
      if (this.save && !this.bossEngaged) audio.setMusicChapter(chapter?.variant || 0);
      if (previous && chapter?.kind === 'act') this.startChapterIntro(chapter);
    }
    shell.updateHud({ area: chapter?.name || this.level.name, health: this.health, maxHealth: this.maxHealth, emblems: this.collected.size,
      bossName: this.bossEngaged && !this.bossDefeated ? this.level.boss.name : '', bossHealth: this.bossState?.hp || 0,
      bossMax: this.bossState?.max || 6, bossVulnerable: this.bossEngaged && this.bossState?.phase === 'recover', gliding: this.gliding });
  }
}

const scene = () => game?.scene.getScene('Play');
const begin = (slotIndex, area) => {
  const slot = SaveStore.get(slotIndex) || SaveStore.create(slotIndex);
  const target = area ?? slot.area;
  const roostReady = ['meadow', 'cliff', 'canopy'].every(id => slot.defeated.includes(id)) && (slot.emblems?.length || 0) >= ROOST_EMBLEM_GOAL;
  if ((target > slot.area && !(target === 3 && roostReady)) || (target === 3 && !roostReady)) {
    shell.showWorld(slotIndex);
    shell.showToast(`Restore three gardens and find ${ROOST_EMBLEM_GOAL} Sky Emblems`); return;
  }
  controls.clear();
  void audio.unlock();
  scene().scene.restart({ slot: slotIndex, area: target });
};

shell = new Shell({
  onStart: begin,
  onResume: () => scene()?.resume(),
  onRestart: () => { const play = scene(); if (play?.save) { play.resume(); play.respawn(); } },
  onExit: (menu = 'slots') => { audio.stopMusic(); controls.clear(); scene()?.scene.restart({ menu }); },
  onSettings: (settings) => audio.setSettings(settings),
});

game = new Phaser.Game({
  type: Phaser.CANVAS,
  width: 320, height: 240, parent: 'game-mount', backgroundColor: '#80d8d1',
  pixelArt: true, roundPixels: true, antialias: false,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 320, height: 240 },
  physics: { default: 'arcade', arcade: { gravity: { y: MOVE.gravity }, fixedStep: true, fps: 60, debug: false } },
  audio: { noAudio: true },
  scene: Play,
  input: { keyboard: false },
  fps: { target: 60, forceSetTimeOut: false },
});
window.addEventListener('skybound:pause', () => scene()?.pause());
window.addEventListener('skybound:settings', (event) => {
  audio.setSettings(event.detail);
  window.dispatchEvent(new CustomEvent('skybound:audio-state', { detail: { muted: event.detail.muted } }));
});
window.addEventListener('skybound:audio', () => {
  const settings = SaveStore.getSettings();
  const needsUnlock = !audio.context || audio.context.state !== 'running';
  void audio.unlock();
  const updated = SaveStore.saveSettings({ muted: needsUnlock ? false : !settings.muted });
  window.dispatchEvent(new CustomEvent('skybound:settings', { detail: updated }));
});
window.addEventListener('pagehide', () => scene()?.flushSave());

// Inspection hooks are available in the local preview for browser verification.
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  window.skybound = { game, get scene() { return scene(); }, saves: SaveStore, controls, audio, get shell() { return shell; } };
}
