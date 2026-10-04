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
  let mainFrames=0;
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
      for(const enemy of s.enemies.getChildren()) { enemy.disableBody(true,true); s.enemyData.get(enemy).dead=true; }
      // Disable combat only: terrain and platform bodies remain the real Arcade bodies.
      let resets=0,jumps=0,stalled=0,lastX=s.player.x,maxX=s.player.x,holdUntil=-1;
      const falls=[];
      const target=s.level.boss.arena.x+24;
      for(let frame=0;frame<60000;frame++) {
        const p=s.player,grounded=p.body.blocked.down||p.body.touching.down;
        const surfaces=[...s.level.terrain,...s.ledges.getChildren().filter(platform=>platform.body.enable).map(platform=>({x:platform.x,y:platform.y,w:platform.width,h:platform.height}))];
        const opening=!s.level.chapters?.[1]||p.x<s.level.chapters[1].x;
        const current=opening?s.level.terrain.find(rect=>p.x>=rect.x&&p.x<rect.x+rect.w):surfaces.filter(rect=>p.x>=rect.x-2&&p.x<rect.x+rect.w+2&&Math.abs(rect.y-p.body.bottom)<4).sort((a,b)=>a.y-b.y)[0];
        const next=opening?s.level.terrain.find(rect=>rect.x>p.x+2):surfaces.filter(rect=>rect.x>p.x+2&&rect.x-p.x<120).sort((a,b)=>a.x-b.x||a.y-b.y)[0];
        let jump=false;
        if(grounded&&next) {
          const distance=next.x-p.x;
          if(next.y<p.body.bottom-4&&distance<42)jump=true;
          if(current&&current.x+current.w-p.x<(opening?22:24))jump=true;
        }
        if(grounded&&stalled>20)jump=true;
        c.sources.set('qa:move',new Set(['right']));
        if(jump){c.pending.add('jump');jumps++;holdUntil=frame+22;}
        c.sources.set('qa:hold',new Set(frame<=holdUntil?['jump']:[]));
        c.sources.set('qa:glide',new Set(!grounded?['glide']:[]));
        s.physics.world.update(frame*1000/60,1000/60);
        s.physics.world.postUpdate();
        s.update(frame*1000/60,1000/60);
        maxX=Math.max(maxX,p.x);
        if(s.deathUntil){resets++;if(falls.length<8)falls.push({x:p.x,y:p.y,checkpoint:s.checkpoint.id});s.respawn();}
        if(Math.abs(p.x-lastX)<0.1)stalled++;else stalled=0;
        lastX=p.x;
        if(p.x>=target)return{area:s.level.id,reached:true,frames:frame,jumps,resets,x:p.x,maxX,falls};
        if(stalled>240)return{area:s.level.id,reached:false,reason:'blocked',frames:frame,jumps,resets,x:p.x,y:p.y,maxX,falls};
      }
      return{area:s.level.id,reached:false,reason:'timeout',jumps,resets,x:s.player.x,y:s.player.y,maxX,falls};
    });
    console.log(JSON.stringify(route));
    if(area<3)mainFrames+=route.frames;
    assert(route.reached,`${route.area} mandatory route is traversable`);
    assert.equal(route.resets,0,`${route.area} requires no fall recovery`);
  }
  assert.deepEqual(errors,[]);
  assert(mainFrames/60>=1080, 'Shortened main route should retain at least eighteen minutes of movement and platforming');
  console.log(`Measured main-route movement: ${(mainFrames/3600).toFixed(2)} minutes, excluding combat and exploration.`);
  console.log('All four mandatory routes traversed using actual Arcade bodies.');
} finally {await browser.close();}
