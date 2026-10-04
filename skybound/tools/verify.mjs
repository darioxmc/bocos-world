import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const runtime = process.env.SKYBOUND_DEPENDENCIES || 'C:/Users/dario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = require(path.join(runtime, 'playwright'));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) console.log('HTTP error', response.status(), response.url()); });
await mkdir('qa', { recursive: true });
try {
  await page.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.skybound?.scene?.player, { timeout: 15000 });
  await page.screenshot({ path: 'qa/desktop-title.png', fullPage: true });
  console.log('Title:', await page.locator('#overlay').innerText());
  if (await page.getByRole('button', { name: 'Start', exact: true }).count()) await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  console.log('Slots:', await page.locator('#overlay').innerText());
  await page.screenshot({ path: 'qa/desktop-slots.png', fullPage: true });
  await page.evaluate(() => {
    window.skybound.saves.create(0);
    window.skybound.scene.scene.restart({ slot: 0, area: 0 });
  });
  await page.waitForFunction(() => window.skybound.scene.mode === 'playing');
  await page.waitForTimeout(600);
  const sound=await page.evaluate(async()=>{
    const audio=skybound.audio;
    await audio.unlock();
    const analyser=audio.context.createAnalyser();analyser.fftSize=2048;
    audio._master.connect(analyser);
    audio.effect('flower');
    await new Promise(resolve=>setTimeout(resolve,80));
    const samples=new Float32Array(2048);analyser.getFloatTimeDomainData(samples);
    const rms=Math.sqrt(samples.reduce((sum,value)=>sum+value*value,0)/samples.length);
    analyser.disconnect();audio._master.disconnect(analyser);
    return{state:audio.context.state,rms};
  });
  assert.equal(sound.state,'running');
  assert(sound.rms>0.0001,'Web Audio produces a nonzero signal after a gesture');
  await page.screenshot({ path: 'qa/desktop-meadow.png', fullPage: true });
  console.log('Scene:', await page.evaluate(() => ({ mode: skybound.scene.mode, x: skybound.scene.player.x, y: skybound.scene.player.y, grounded: skybound.scene.player.body.blocked.down, body: {x:skybound.scene.player.body.x,y:skybound.scene.player.body.y,width:skybound.scene.player.body.width,height:skybound.scene.player.body.height} })));
  const before = await page.evaluate(() => skybound.scene.player.x);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(220);
  await page.keyboard.down('Space');
  await page.waitForTimeout(180);
  const jumping = await page.evaluate(() => ({ x: skybound.scene.player.x, y: skybound.scene.player.y }));
  assert(jumping.x > before + 20, 'keyboard movement advances player');
  assert(jumping.y < 185, 'jump lifts player above ground');
  await page.keyboard.up('Space');
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('KeyX');
  await page.waitForTimeout(280);
  assert(await page.evaluate(() => skybound.scene.gliding), 'glide activates on descent');
  await page.screenshot({path:'qa/desktop-glide.png',fullPage:true});
  await page.keyboard.up('KeyX');
  await page.waitForTimeout(450);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => skybound.scene.mode === 'paused');
  const pausedX = await page.evaluate(() => skybound.scene.player.x);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => skybound.scene.player.x), pausedX);
  await page.getByRole('button', {name:'Resume',exact:true}).click();
  await page.waitForFunction(() => skybound.scene.mode === 'playing');
  // A flower heals without adding damage immunity; successive collision hits do not stack.
  const healthCheck = await page.evaluate(() => {
    const s = skybound.scene;
    s.health = 2; s.invulnerableUntil = 0;
    const flower = s.pickups.getChildren().find(p => p.getData('kind') === 'flower');
    s.pickup(flower);
    const immunity = s.invulnerableUntil;
    s.damage(s.player.x + 20); s.damage(s.player.x + 20);
    return {health:s.health, immunity};
  });
  assert.equal(healthCheck.immunity, 0);
  assert.equal(healthCheck.health, 2);
  // Test the actual Arcade collider with a beetle stomp and a grounded peck.
  const collisionCheck = await page.evaluate(() => {
    const s = skybound.scene;
    const enemy = [...s.enemyData.keys()][0];
    s.previousFeet = enemy.body.top - 1; s.previousVelocityY = 150;
    s.enemyContact(enemy);
    const stomped = s.enemyData.get(enemy).dead;
    const other = [...s.enemyData.keys()].find(e => !s.enemyData.get(e).dead && s.enemyData.get(e).type === 'beetle');
    s.player.body.reset(other.x - 20, other.y);
    s.facing = 1; s.attackUntil = s.clock + 1; s.attackVictims.clear();
    s.updateAttack();
    return {stomped, pecked:s.enemyData.get(other).dead};
  });
  assert(collisionCheck.stomped && collisionCheck.pecked);
  // Visit all areas and defeat each boss through its explicit vulnerability gate.
  await page.evaluate(() => skybound.saves.save(0,{area:3,defeated:['meadow','cliff','canopy']}));
  for (let area=0; area<4; area++) {
    await page.evaluate(area => skybound.scene.scene.restart({slot:0,area}),area);
    await page.waitForFunction(area => skybound.scene.areaIndex === area && skybound.scene.mode === 'playing',area);
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const s=skybound.scene, spec=s.level.boss;
      s.player.body.reset(spec.arena.x+90,spec.y);
      s.previousFeet=spec.y; s.invulnerableUntil=s.clock+30;
      s.updateBoss(0.016);
    });
    await page.waitForTimeout(500);
    await page.screenshot({path:`qa/area-${area}-boss.png`,fullPage:true});
    const bossCheck=await page.evaluate(() => {
      const s=skybound.scene;
      const hp=s.bossState.hp;
      s.bossState.phase='warn'; s.hitBoss();
      const protectedHp=s.bossState.hp;
      for(let n=0;n<6;n++) {s.bossState.phase='recover';s.bossState.hitUntil=0;s.hitBoss();}
      return {hp,protectedHp,defeated:s.bossDefeated,gateDisabled:!s.gateZone.body.enable};
    });
    assert.equal(bossCheck.hp,bossCheck.protectedHp);
    assert(bossCheck.defeated && bossCheck.gateDisabled);
    await page.evaluate(() => skybound.scene.finishArea());
    await page.waitForFunction(() => skybound.scene.mode === 'victory');
    assert(await page.locator('#overlay').isVisible());
  }
  // Export a reusable raster sprite atlas and inspect real canvas pixels.
  const atlas = await page.evaluate(() => {
    const canvas=document.createElement('canvas'); canvas.width=512; canvas.height=128;
    const ctx=canvas.getContext('2d');
    const keys=['boco-idle',...Array.from({length:6},(_,n)=>`boco-run${n}`),'boco-jump','boco-fall','boco-glide0','boco-glide1','boco-duck','boco-peck','boco-swipe','boco-hurt','boco-win','beetle','shellback','hopper','plant','bird','moth','boss-beetle','boss-moth','boss-plant','boss-bird'];
    let x=0,y=0;
    for(const key of keys) {const source=skybound.scene.textures.get(key).getSourceImage(); if(x+source.width>512){x=0;y+=64;} ctx.drawImage(source,x,y);x+=source.width;}
    const gameCtx=document.querySelector('#game-mount canvas').getContext('2d');
    const pixels=gameCtx.getImageData(0,0,320,240).data;
    const colors=new Set();for(let i=0;i<pixels.length;i+=4)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
    return {url:canvas.toDataURL('image/png'),colors:colors.size};
  });
  assert(atlas.colors>30,'canvas contains rendered pixel assets');
  await writeFile('qa/sprite-atlas.png',Buffer.from(atlas.url.split(',')[1],'base64'));
  // Simulate a standard connected controller, including menu and gameplay handoff.
  await page.evaluate(() => {
    window.testPad={index:0,id:'QA Standard Controller',mapping:'standard',connected:true,axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};
    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[testPad]});
    skybound.scene.scene.restart({slot:0,area:0});
  });
  await page.waitForFunction(() => skybound.scene.areaIndex===0 && skybound.scene.mode==='playing');
  await page.waitForFunction(() => skybound.scene.player.body.blocked.down || skybound.scene.player.body.touching.down);
  const padStart=await page.evaluate(() => ({x:skybound.scene.player.x,y:skybound.scene.player.y}));
  await page.evaluate(() => {testPad.axes[0]=1;testPad.buttons[0]={pressed:true,value:1};});
  await page.waitForFunction(start=>skybound.scene.player.x>start.x+10 && skybound.scene.player.y<start.y-18,padStart,{timeout:5000});
  await page.evaluate(() => {testPad.axes[0]=0;testPad.buttons[0]={pressed:false,value:0};testPad.connected=false;});
  await page.waitForFunction(() => skybound.scene.mode==='paused');
  await page.getByRole('button',{name:'Resume',exact:true}).click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(() => skybound.scene.mode==='paused');
  assert.deepEqual(errors, []);
  await context.close();
  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const phone=await mobile.newPage();
  phone.on('pageerror',error=>errors.push(error.message));
  await phone.goto('http://127.0.0.1:8770/',{waitUntil:'networkidle'});
  await phone.waitForFunction(()=>window.skybound?.scene?.player);
  await phone.screenshot({path:'qa/iphone14-title.png',fullPage:true});
  if (await phone.getByRole('button',{name:'Start',exact:true}).count()) await phone.getByRole('button',{name:'Start',exact:true}).tap();
  await phone.getByRole('button',{name:'Play',exact:true}).click();
  await phone.locator('.slot-main').first().click();
  await phone.getByRole('button',{name:'Skip',exact:true}).click();
  await phone.waitForFunction(()=>skybound.scene.mode==='playing');
  await phone.waitForTimeout(250);
  await phone.screenshot({path:'qa/iphone14-meadow.png',fullPage:true});
  const mobileLayout=await phone.evaluate(()=>{
    const screen=document.querySelector('.screen').getBoundingClientRect();
    const controls=document.querySelector('#touch-controls').getBoundingClientRect();
    const canvas=document.querySelector('canvas');
    return {screenBottom:screen.bottom,controlsTop:controls.top,controlsBottom:controls.bottom,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,ratio:canvas.clientWidth/canvas.clientHeight};
  });
  assert(!mobileLayout.overflow && mobileLayout.controlsBottom<=mobileLayout.height);
  assert(mobileLayout.screenBottom<=mobileLayout.controlsTop);
  assert(Math.abs(mobileLayout.ratio-4/3)<0.01);
  // Pointer events exercise multiple touches and sliding direction on the actual controller.
  const touchCheck=await phone.evaluate(()=>{
    const dpad=document.querySelector('#dpad'),jump=document.querySelector('[data-action=jump]');
    const d=dpad.getBoundingClientRect(),j=jump.getBoundingClientRect();
    const send=(target,type,id,x,y)=>target.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,bubbles:true}));
    // Synthetic events have no native pointer capture; bypass that one browser method.
    dpad.setPointerCapture=()=>{};jump.setPointerCapture=()=>{};
    send(dpad,'pointerdown',1,d.right-10,d.top+d.height/2);
    send(jump,'pointerdown',2,j.left+j.width/2,j.top+j.height/2);
    const both=skybound.controls.down('right')&&skybound.controls.down('jump');
    send(dpad,'pointermove',1,d.left+10,d.top+d.height/2);
    const sliding=skybound.controls.down('left')&&!skybound.controls.down('right')&&skybound.controls.down('jump');
    send(jump,'pointerup',2,j.left,j.top);
    const independentRelease=skybound.controls.down('left')&&!skybound.controls.down('jump');
    send(dpad,'pointercancel',1,d.left,d.top);
    return {both,sliding,independentRelease,clear:!skybound.controls.down('left')};
  });
  assert(Object.values(touchCheck).every(Boolean));
  await phone.setViewportSize({width:844,height:390});
  await phone.waitForTimeout(250);
  await phone.screenshot({path:'qa/iphone14-landscape.png',fullPage:true});
  const landscape=await phone.evaluate(()=>{
    const screen=document.querySelector('.screen').getBoundingClientRect(),left=document.querySelector('.control-left').getBoundingClientRect(),right=document.querySelector('.control-right').getBoundingClientRect();
    return {fit:screen.bottom<=innerHeight&&right.right<=innerWidth&&left.left>=0,separate:left.right<=screen.left&&right.left>=screen.right};
  });
  assert(landscape.fit&&landscape.separate);
  await phone.evaluate(async()=>{
    const input=await import('/input.js');input.setLeftHanded(true);
    const settings=skybound.saves.saveSettings({touchScale:1.35});
    window.dispatchEvent(new CustomEvent('skybound:settings',{detail:settings}));
  });
  await phone.waitForTimeout(100);
  await phone.screenshot({path:'qa/iphone14-left-handed.png',fullPage:true});
  for(const viewport of [{width:844,height:390},{width:390,height:844},{width:430,height:932},{width:932,height:430}]) {
    await phone.setViewportSize(viewport);
    await phone.waitForTimeout(80);
    const fit=await phone.evaluate(()=>{
      const targets=[...document.querySelectorAll('.touch-action'),document.querySelector('#dpad'),document.querySelector('.screen')];
      return targets.every(element=>{const r=element.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})&&document.documentElement.scrollWidth<=innerWidth;
    });
    assert(fit,`large left-handed controls fit ${viewport.width}x${viewport.height}`);
  }
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log('Browser QA passed: keyboard, glide, combat, all bosses, controller, multi-touch, portrait and landscape.');
} finally {
  console.log('Errors:', JSON.stringify(errors));
  await browser.close();
}
