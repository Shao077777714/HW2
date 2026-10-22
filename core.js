// Shared, renderer-independent game rules. Positions use feet coordinates.
export const TYPES = ['grass','dirt','stone','sand','log','leaves','planks','brick'];
export const NAMES = { grass:'草地', dirt:'泥土', stone:'石頭', sand:'沙子', log:'木頭', leaves:'樹葉', planks:'木板', brick:'磚塊' };
export const key = (x,y,z) => `${x},${y},${z}`;
export const inBounds = (x,y,z) => Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) && x >= -16 && x < 16 && y >= 0 && y < 32 && z >= -16 && z < 16;
export const digDuration = t => ({ stone:2, log:1.2, brick:1.5, leaves:.35 }[t] || .65);
export const ISLANDS = [
  { id:'grass', name:'草地島', en:'MEADOW', x:-7,z:-6,r:5.2, color:'#7cae5f', type:'grass' },
  { id:'water', name:'水之島', en:'TIDAL', x:7,z:-7,r:4, color:'#60b9ce', type:'sand' },
  { id:'fire', name:'火之島', en:'EMBER', x:-8,z:7,r:3.6, color:'#e8a362', type:'sand' },
  { id:'lava', name:'岩漿島', en:'MAGMA', x:2,z:7,r:3.7, color:'#e4784f', type:'stone' },
  { id:'hell', name:'地獄島', en:'NETHER', x:11,z:6,r:3.3, color:'#ae6578', type:'brick' }
];
export class World {
  constructor() { this.blocks = new Map(); this.zones=[]; this.revision=0; }
  get(x,y,z) { return this.blocks.get(key(x,y,z)); }
  set(x,y,z,type) {
    if (!inBounds(x,y,z) || !TYPES.includes(type)) return false;
    this.blocks.set(key(x,y,z),type); this.revision++; return true;
  }
  remove(x,y,z) { const ok=this.blocks.delete(key(x,y,z)); if(ok) this.revision++; return ok; }
  zoneAt(x,y,z) { return this.zones.find(a => x>=a.x && x<a.x+a.w && z>=a.z && z<a.z+a.d && y>=a.y-.05 && y<a.y+a.h); }
  boxHits(x,y,z,r=.29,h=1.75) {
    const hits=[];
    for(let a=Math.floor(x-r+1e-6);a<=Math.floor(x+r-1e-6);a++)
      for(let b=Math.floor(y+1e-6);b<=Math.floor(y+h-1e-6);b++)
        for(let c=Math.floor(z-r+1e-6);c<=Math.floor(z+r-1e-6);c++)
          if(this.get(a,b,c)) hits.push({x:a,y:b,z:c});
    return hits;
  }
  move(body,dx,dy,dz,r=.29,h=1.75) {
    const parts=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy),Math.abs(dz))/.12));
    let landed=false, ceiling=false;
    for(let n=0;n<parts;n++) {
      for(const [axis,d] of [['x',dx/parts],['z',dz/parts],['y',dy/parts]]) {
        if(!d) continue;
        body[axis]+=d;
        const hits=this.boxHits(body.x,body.y,body.z,r,h);
        if(hits.length) {
          if(axis==='y') {
            if(d<0) { body.y=Math.max(...hits.map(c=>c.y+1)); landed=true; }
            else { body.y=Math.min(...hits.map(c=>c.y-h)); ceiling=true; }
          } else {
            body[axis]=d>0 ? Math.min(...hits.map(c=>c[axis]-r)) : Math.max(...hits.map(c=>c[axis]+1+r));
          }
        }
      }
    }
    body.grounded=landed;
    if(landed || ceiling) body.vy=0;
    return {landed,ceiling};
  }
  safeAt(x,z) {
    for(let y=29;y>=0;y--) {
      const type=this.get(Math.floor(x),y,Math.floor(z));
      if(!type || type==='leaves' || type==='log') continue;
      const feet=y+1;
      if(!this.boxHits(x,feet,z).length && !this.zoneAt(x,feet,z)) return {x,y:feet,z,vy:0,grounded:true};
    }
    return null;
  }
  spawn(preferred={x:-7.5,z:-3.5}) {
    const first=this.safeAt(preferred.x,preferred.z);
    if(first && Math.hypot(first.x+7,first.z+6)<5.2) return first;
    for(let x=-11;x<=-3;x++) for(let z=-10;z<=-2;z++) {
      const p=this.safeAt(x+.5,z+.5); if(p && this.get(x,p.y-1,z)==='grass') return p;
    }
    return null;
  }
  ray(origin,dir,limit=5) {
    let x=Math.floor(origin.x), y=Math.floor(origin.y), z=Math.floor(origin.z), distance=0;
    const step={x:Math.sign(dir.x),y:Math.sign(dir.y),z:Math.sign(dir.z)};
    const delta={x:Math.abs(1/dir.x),y:Math.abs(1/dir.y),z:Math.abs(1/dir.z)};
    const next={};
    for(const a of ['x','y','z']) next[a]=dir[a]===0?Infinity:((step[a]>0?Math.floor(origin[a])+1:Math.floor(origin[a]))-origin[a])/dir[a];
    let previous=null;
    while(distance<=limit) {
      const type=this.get(x,y,z);
      if(type) return {x,y,z,type,previous,distance};
      previous={x,y,z};
      const axis=next.x<=next.y && next.x<=next.z?'x':next.y<=next.z?'y':'z';
      distance=next[axis]; if(!Number.isFinite(distance)) break;
      if(axis==='x') x+=step.x; else if(axis==='y') y+=step.y; else z+=step.z;
      next[axis]+=delta[axis];
    }
    return null;
  }
}
export function buildWorld(all=false) {
  const world=new World();
  for(const island of (all?ISLANDS:ISLANDS.slice(0,1))) {
    for(let x=Math.floor(island.x-island.r);x<=Math.ceil(island.x+island.r);x++)
      for(let z=Math.floor(island.z-island.r);z<=Math.ceil(island.z+island.r);z++) {
        const d=Math.hypot(x-island.x,z-island.z);
        const edge=island.r + .28*Math.sin(x*4.7+z*2.1);
        if(d>edge) continue;
        const depth=Math.max(2,Math.floor((1-d/(edge+1))*5));
        for(let y=11-depth;y<=10;y++) world.set(x,y,z,y===10?island.type:y>=9?'dirt':'stone');
      }
  }
  // Trees stay clear of the arrival point and connecting paths.
  for(const [x,z,h] of [[-9,-8,3],[-5,-9,3],[-10,-4,2]]) {
    for(let y=11;y<11+h;y++) world.set(x,y,z,'log');
    for(let a=-2;a<=2;a++) for(let c=-2;c<=2;c++) for(let b=0;b<=1;b++)
      if(Math.abs(a)+Math.abs(c)<=3 && !world.get(x+a,11+h+b,z+c)) world.set(x+a,11+h+b,z+c,'leaves');
    world.set(x,13+h,z,'leaves');
  }
  world.set(-6,11,-7,'dirt'); world.set(-5,11,-7,'stone');
  if(all) addThemes(world);
  return world;
}
export function addThemes(world) {
  // Two-cell-wide bridges join the five islands without leaving the 32³ world.
  for(let x=-7;x<=7;x++) for(const z of [-6,-5]) if(!world.get(x,10,z)) world.set(x,10,z,'planks');
  for(let z=-5;z<=7;z++) for(const x of [-8,-7]) if(!world.get(x,10,z)) world.set(x,10,z,'planks');
  for(let x=-8;x<=11;x++) for(const z of [7,8]) if(!world.get(x,10,z)) world.set(x,10,z,'planks');
  // Shallow pools: solid floor at y=9, walkable water at y=10.
  for(let x=6;x<=8;x++) for(let z=-9;z<=-7;z++) {world.remove(x,10,z);world.set(x,9,z,'sand');}
  world.zones.push({kind:'water',x:6,y:10,z:-9,w:3,d:3,h:1});
  for(const [x,z] of [[-9,5],[-7,5],[-10,7]]) world.zones.push({kind:'fire',x,y:11,z,w:1,d:1,h:1.1});
  for(let x=1;x<=3;x++) for(let z=5;z<=6;z++) {world.remove(x,10,z);world.set(x,9,z,'stone');}
  world.zones.push({kind:'lava',x:1,y:10,z:5,w:3,d:2,h:1.1});
  for(const [x,z] of [[10,4],[12,5]]) world.zones.push({kind:'fire',x,y:11,z,w:1,d:1,h:1.1});
  for(let y=11;y<=13;y++) {world.set(9,y,5,'brick');world.set(13,y,6,'brick');}
}
export class Game {
  constructor(world) {
    this.world=world; this.player=world.spawn(); this.dig=null; this.drops=[]; this.animals=[];
    this.inventory={grass:12,dirt:8,stone:8,sand:8,log:4,leaves:4,planks:24,brick:8};
    this.stats={mined:0,collected:0,placed:0}; this.restarts=0;
  }
  mine(target,held,dt) {
    if(!held || !target || !this.world.get(target.x,target.y,target.z)) {this.dig=null;return null;}
    const id=key(target.x,target.y,target.z);
    if(this.dig?.id!==id) this.dig={id,elapsed:0,target};
    this.dig.elapsed+=dt;
    if(this.dig.elapsed+1e-9<digDuration(target.type)) return null;
    const type=this.world.get(target.x,target.y,target.z);
    this.world.remove(target.x,target.y,target.z); this.dig=null; this.stats.mined++;
    const item={type,x:target.x+.5,y:target.y+.45,z:target.z+.5,vy:3.5,age:0,spin:0,picking:0};
    this.drops.push(item); return item;
  }
  place(target,type) {
    const p=target?.previous;
    if(!p || !inBounds(p.x,p.y,p.z) || this.world.get(p.x,p.y,p.z) || !(this.inventory[type]>0)) return false;
    if(!this.world.get(target.x,target.y,target.z)) return false;
    const overlaps=(a,r,h)=>a && p.x<a.x+r && p.x+1>a.x-r && p.y<a.y+h && p.y+1>a.y && p.z<a.z+r && p.z+1>a.z-r;
    if(overlaps(this.player,.29,1.75) || this.animals.some(a=>!a.hidden&&overlaps(a,.47,.95))) return false;
    // Static water, flame and lava regions cannot be replaced by inventory blocks.
    if(this.world.zones.some(a=>p.x<a.x+a.w&&p.x+1>a.x&&p.z<a.z+a.d&&p.z+1>a.z&&p.y<a.y+a.h&&p.y+1>a.y)) return false;
    if(!this.world.set(p.x,p.y,p.z,type)) return false;
    this.inventory[type]--; this.stats.placed++; return true;
  }
  updateDrops(dt) {
    for(let i=this.drops.length-1;i>=0;i--) {
      const d=this.drops[i]; d.age+=dt; d.spin+=dt;
      if(d.picking) {
        d.picking+=dt;
        const p=this.player;
        if(p) { const f=Math.min(1,dt*14);d.x+=(p.x-d.x)*f;d.y+=(p.y+.9-d.y)*f;d.z+=(p.z-d.z)*f; }
        if(d.picking>=.23) { this.inventory[d.type]++; this.stats.collected++;this.drops.splice(i,1); }
        continue;
      }
      d.vy-=15*dt;
      this.world.move(d,0,d.vy*dt,0,.12,.24);
      if(d.y < -4) {this.drops.splice(i,1);continue;}
      const p=this.player;
      if(p && d.age>.65 && Math.hypot(d.x-p.x,d.y-(p.y+.5),d.z-p.z)<1.45) d.picking=.001;
    }
  }
  respawn() { this.player=this.world.spawn(); this.dig=null; this.restarts++; return !!this.player; }
  updatePlayer(dt,input,yaw=0) {
    const p=this.player; if(!p) return 'blocked';
    const zone=this.world.zoneAt(p.x,p.y,p.z);
    if(zone && zone.kind!=='water') {this.respawn();return 'hazard';}
    let forward=(input.forward?1:0)-(input.back?1:0), side=(input.right?1:0)-(input.left?1:0);
    const length=Math.hypot(forward,side)||1; forward/=length;side/=length;
    const speed=zone?.kind==='water'?2.1:4.2;
    if(input.jump&&p.grounded) {p.vy=7;p.grounded=false;}
    p.vy-=19*dt;
    this.world.move(p,(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*speed*dt,p.vy*dt,(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*speed*dt);
    if(p.y < -3) {this.respawn();return 'fall';}
    const contact=this.world.zoneAt(p.x,p.y,p.z);
    if(contact&&contact.kind!=='water') {this.respawn();return 'hazard';}
    return contact?.kind||'walk';
  }
}
