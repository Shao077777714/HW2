export class Animals {
  constructor(game, count=3) {
    this.game=game;this.seed=701;this.agents=[];
    const homes=[{x:-5.5,z:-3.5},{x:-8.5,z:-2.5},{x:-3.5,z:-5.5},{x:-6.5,z:-8.5},{x:-8.5,z:-9.5},{x:-4.5,z:-6.5}];
    for(let i=0;i<Math.min(count,6);i++) {
      const a={kind:['pig','sheep','dog'][i%3],home:homes[i],x:0,y:11,z:0,vy:0,heading:i*2.1,timer:0,walking:true,hidden:true,phase:0,walked:0,stops:0,turns:0,retry:0};
      const p=this.spawn(a.home);if(p)Object.assign(a,p,{hidden:false});
      this.agents.push(a);
    }
    game.animals=this.agents;
  }
  random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  safe(x,y,z) {
    const w=this.game.world;
    if(Math.hypot(x+7,z+6)>4.8 || w.boxHits(x,y,z,.47,.95).length)return false;
    for(const dx of [-.47,.47])for(const dz of [-.47,.47]) {
      const t=w.get(Math.floor(x+dx),Math.floor(y-.05),Math.floor(z+dz));
      if(!t||t==='leaves'||t==='log'||w.zoneAt(x+dx,y,z+dz))return false;
    }
    return true;
  }
  spawn(home) {
    const w=this.game.world;const p=w.safeAt(home.x,home.z);
    if(p&&w.get(Math.floor(p.x),p.y-1,Math.floor(p.z))==='grass'&&this.safe(p.x,p.y,p.z))return p;
    for(let x=-11;x<=-3;x++)for(let z=-10;z<=-2;z++) {
      const b=w.safeAt(x+.5,z+.5);
      if(b&&w.get(x,b.y-1,z)==='grass'&&this.safe(b.x,b.y,b.z))return b;
    }
    return null;
  }
  update(dt) {
    const w=this.game.world;
    for(const a of this.agents) {
      if(a.hidden) {a.retry-=dt;if(a.retry<=0){const p=this.spawn(a.home);if(p)Object.assign(a,p,{hidden:false});a.retry=2;}continue;}
      a.timer-=dt;
      if(a.timer<=0) {a.walking=this.random()>.25;a.heading+=(this.random()-.5)*2.8;a.turns++;if(!a.walking)a.stops++;a.timer=.8+this.random()*2.2;}
      const hasFloor=w.get(Math.floor(a.x),Math.floor(a.y-.05),Math.floor(a.z));
      let dx=0,dz=0;
      if(a.walking&&hasFloor) {
        const sx=Math.sin(a.heading),sz=Math.cos(a.heading);
        if(this.safe(a.x+sx*.68,a.y,a.z+sz*.68)) {dx=sx*.72*dt;dz=sz*.72*dt;a.phase+=dt*8;}
        else {a.heading+=1.15+this.random()*1.7;a.turns++;a.timer=.3;}
      }
      const before={x:a.x,z:a.z};
      a.vy-=19*dt;w.move(a,dx,a.vy*dt,dz,.47,.95);
      a.walked+=Math.hypot(a.x-before.x,a.z-before.z);
      if(a.y < -3) {const p=this.spawn(a.home);if(p)Object.assign(a,p);else {a.hidden=true;a.retry=2;}}
    }
  }
}
