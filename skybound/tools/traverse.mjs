import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const runtime=process.env.SKYBOUND_DEPENDENCIES||'C:/Users/dario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {chromium}=require(path.join(runtime,'playwright'));
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:1024,height:768}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:8770/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.skybound?.scene?.player);
  await page.evaluate(()=>{skybound.saves.create(0);skybound.saves.save(0,{area:3,defeated:['meadow','cliff','canopy']});});
  for(let area=0;area<4;area++) {
    if(area) {
      await page.reload({waitUntil:'networkidle'});
      await page.waitForFunction(()=>window.skybound?.scene?.player);
    }
    await page.evaluate(area=>skybound.scene.scene.restart({slot:0,area}),area);
    await page.waitForFunction(area=>skybound.scene.areaIndex===area&&skybound.scene.mode==='playing',area);
    await page.waitForTimeout(80);
    const route=await page.evaluate(()=>{
      skybound.game.loop.stop();
      const s=skybound.scene,c=skybound.controls;
      s.invulnerableUntil=10000;
      for(const enemy of s.enemies.getChildren())enemy.body.enable=false;
      // Disable combat only: terrain and platform bodies remain the real Arcade bodies.
      let resets=0,jumps=0,stalled=0,lastX=s.player.x,holdUntil=-1;
      const target=s.level.boss.arena.x+24;
      for(let frame=0;frame<9000;frame++) {
        const p=s.player,grounded=p.body.blocked.down||p.body.touching.down;
        const next=s.level.terrain.find(rect=>rect.x>p.x+2);
        const current=s.level.terrain.find(rect=>p.x>=rect.x&&p.x<rect.x+rect.w);
        let jump=false;
        if(grounded&&next) {
          const distance=next.x-p.x;
          if(next.y<p.body.bottom-4&&distance<28)jump=true;
          if(current&&next.x>current.x+current.w&&current.x+current.w-p.x<22)jump=true;
        }
        if(grounded&&stalled>20)jump=true;
        c.sources.set('qa:move',new Set(['right']));
        if(jump){c.pending.add('jump');jumps++;holdUntil=frame+22;}
        c.sources.set('qa:hold',new Set(frame<=holdUntil?['jump']:[]));
        s.physics.world.update(frame*1000/60,1000/60);
        s.physics.world.postUpdate();
        s.update(frame*1000/60,1000/60);
        if(s.deathUntil){resets++;s.respawn();}
        if(Math.abs(p.x-lastX)<0.1)stalled++;else stalled=0;
        lastX=p.x;
        if(p.x>=target)return{area:s.level.id,reached:true,frames:frame,jumps,resets,x:p.x};
        if(stalled>240)return{area:s.level.id,reached:false,reason:'blocked',frames:frame,jumps,resets,x:p.x,y:p.y};
      }
      return{area:s.level.id,reached:false,reason:'timeout',jumps,resets,x:s.player.x,y:s.player.y};
    });
    console.log(JSON.stringify(route));
    assert(route.reached,`${route.area} mandatory route is traversable`);
    assert.equal(route.resets,0,`${route.area} requires no fall recovery`);
  }
  assert.deepEqual(errors,[]);
  console.log('All four mandatory routes traversed using actual Arcade bodies.');
} finally {await browser.close();}
