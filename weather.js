// Reuse a fixed pool. No particles are allocated on weather toggles.
export class Rain {
  constructor(count=240) {this.count=count;this.active=false;this.particles=Array.from({length:count},()=>({x:0,y:0,z:0}));}
  reset(p,center) {p.x=center.x+(Math.random()-.5)*20;p.z=center.z+(Math.random()-.5)*20;p.y=center.y+5+Math.random()*12;}
  set(active,center) {this.active=active;if(active)for(const p of this.particles)this.reset(p,center);}
  update(dt,center,world) {
    if(!this.active)return;
    for(const p of this.particles) {
      p.y-=13*dt;p.x-=.65*dt;
      if(p.y<center.y-10||Math.abs(p.x-center.x)>11||Math.abs(p.z-center.z)>11||world.get(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z)))this.reset(p,center);
    }
  }
}
