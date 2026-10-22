import * as THREE from './vendor/three.module.js';
import {buildWorld,Game,TYPES,NAMES,ISLANDS,key,digDuration} from './core.js';
import {Animals} from './animals.js';
import {Rain} from './weather.js';

const $=id=>document.getElementById(id);
const canvas=$('scene');
let renderer;
try { renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'}); }
catch { $('loading').innerHTML='<p>此瀏覽器無法啟動 WebGL，請使用支援 WebGL 的 Chrome 或 Edge。</p>'; throw new Error('WebGL unavailable'); }
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setClearColor(0xc9e3e9);
const scene=new THREE.Scene(); scene.fog=new THREE.Fog(0xc9e3e9,48,125);
scene.add(new THREE.HemisphereLight(0xf4fbff,0x8c9570,2.3));
const sun=new THREE.DirectionalLight(0xffefd0,2.6);sun.position.set(-12,32,16);scene.add(sun);
const camera=new THREE.PerspectiveCamera(49,innerWidth/innerHeight,.06,170);
camera.rotation.order='YXZ';
const clock=new THREE.Clock();
let world=buildWorld(true), game=new Game(world), worldMesh, worldVersion=-1;
let playing=false, started=false, blocked=false, yaw=-.588, pitch=-.30, held=false, selected=0, target=null;
let rainy=false, toastUntil=0, fpsTime=0,fpsFrames=0,uiTimer=0, lastCounts='',time=0;
const keys=new Set();
const materials={}, crackMaterials=[];
const path='assets/sky-island-assets/';
const loader=new THREE.TextureLoader();
const textureNames=['grass_top','grass_side','dirt','stone','sand','log_top','log_side','leaves','planks','brick'];
const texturePromises=textureNames.map(async name=>{
 const texture=await loader.loadAsync(`${path}textures/16px/${name}.png`);
 texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=texture.minFilter=THREE.NearestFilter;
 materials[name]=new THREE.MeshLambertMaterial({map:texture,vertexColors:true});
});
const blockGeo=new THREE.BoxGeometry(1,1,1);
const materialFor=type=>type==='grass'?[materials.grass_side,materials.grass_side,materials.grass_top,materials.dirt,materials.grass_side,materials.grass_side]:type==='log'?[materials.log_side,materials.log_side,materials.log_top,materials.log_top,materials.log_side,materials.log_side]:Array(6).fill(materials[type]);
const dropMaterials={};
const faceData=[
 {n:[1,0,0],v:[[1,0,1],[1,0,0],[1,1,1],[1,1,0]]},
 {n:[-1,0,0],v:[[0,0,0],[0,0,1],[0,1,0],[0,1,1]]},
 {n:[0,1,0],v:[[0,1,1],[1,1,1],[0,1,0],[1,1,0]]},
 {n:[0,-1,0],v:[[0,0,0],[1,0,0],[0,0,1],[1,0,1]]},
 {n:[0,0,1],v:[[0,0,1],[1,0,1],[0,1,1],[1,1,1]]},
 {n:[0,0,-1],v:[[1,0,0],[0,0,0],[1,1,0],[0,1,0]]}
];
function rebuildWorld() {
 const buckets=new Map();
 for(const [id,type] of world.blocks) {
   const [x,y,z]=id.split(',').map(Number);
   for(let f=0;f<6;f++) {
     const {n,v}=faceData[f];if(world.get(x+n[0],y+n[1],z+n[2]))continue;
     const mat=type==='grass'?(f===2?'grass_top':f===3?'dirt':'grass_side'):type==='log'?(f===2||f===3?'log_top':'log_side'):type;
     if(!buckets.has(mat))buckets.set(mat,{p:[],n:[],uv:[],c:[]});
     const b=buckets.get(mat);const uv=[[0,0],[1,0],[0,1],[1,1]];
     let tint=[1,1,1];
     if(x>=8&&z>=2) tint=[.36,.18,.24];
     else if(x>=-1&&x<=5&&z>=3) tint=[.38,.39,.43];
     else if(x<=-5&&z>=3) tint=[1,.81,.63];
     for(const i of [0,1,2,2,1,3]) {b.p.push(x+v[i][0],y+v[i][1],z+v[i][2]);b.n.push(...n);b.uv.push(...uv[i]);b.c.push(...tint);}
   }
 }
 if(worldMesh) {scene.remove(worldMesh);worldMesh.geometry.dispose();}
 const geom=new THREE.BufferGeometry(), positions=[],normals=[],uvs=[],colors=[],mats=[];
 for(const [name,b] of buckets) {geom.addGroup(positions.length/3,b.p.length/3,mats.length);mats.push(materials[name]);positions.push(...b.p);normals.push(...b.n);uvs.push(...b.uv);colors.push(...b.c);}
 geom.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geom.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geom.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geom.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 geom.computeBoundingSphere();worldMesh=new THREE.Mesh(geom,mats);scene.add(worldMesh);worldVersion=world.revision;
}
const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.012,1.012,1.012)),new THREE.LineBasicMaterial({color:0xf2f5d6,transparent:true,opacity:.85}));
outline.visible=false;scene.add(outline);
const cracks=new THREE.Mesh(new THREE.BoxGeometry(1.018,1.018,1.018),new THREE.MeshBasicMaterial());cracks.visible=false;scene.add(cracks);
const dropMeshes=new Map();
function syncDrops() {
 for(const [d,mesh] of dropMeshes) if(!game.drops.includes(d)) {scene.remove(mesh);dropMeshes.delete(d);}
 for(const d of game.drops) {
   let m=dropMeshes.get(d);
   if(!m) {m=new THREE.Mesh(blockGeo,dropMaterials[d.type]);m.scale.setScalar(.24);scene.add(m);dropMeshes.set(d,m);}
   m.position.set(d.x,d.y+.12,d.z);m.rotation.set(.14,d.spin*1.2,.12);
 }
}
// Decorative clouds live outside the editable voxel world.
const cloudGroup=new THREE.Group();scene.add(cloudGroup);
const cloudMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.43,depthWrite:false});
for(let i=0;i<22;i++) {
 const cloud=new THREE.Mesh(blockGeo,cloudMat);
 const a=i*2.399;
 cloud.position.set(Math.cos(a)*(22+i*.8),-1-i%5,Math.sin(a)*(22+i*.8));
 cloud.scale.set(7+i%4, .28,2+i%3);cloudGroup.add(cloud);
}
function toast(message) {$('toast').textContent=message;$('toast').classList.add('show');toastUntil=performance.now()+3000;}
function updateInventory() {
 const counts=TYPES.map(t=>game.inventory[t]).join(',')+':'+selected;
 if(counts===lastCounts)return;lastCounts=counts;
 $('hotbar').replaceChildren(...TYPES.map((t,i)=>{
   const b=document.createElement('button');b.className='slot'+(i===selected?' active':'');b.title=`${i+1} · ${NAMES[t]}`;b.setAttribute('aria-label',`${NAMES[t]}，${game.inventory[t]} 個`);b.setAttribute('aria-pressed',i===selected?'true':'false');
   b.innerHTML=`<span class="number">${i+1}</span><img src="${path}icons/${t}.png" alt=""><span class="count">${game.inventory[t]}</span>`;
   b.onclick=()=>{selected=i;updateInventory();};return b;
 }));
 $('selected-name').textContent=NAMES[TYPES[selected]];
}
function resetInputs(){keys.clear();held=false;game.dig=null;}
function showPause(noSpawn=false) {
 playing=false;blocked=noSpawn;resetInputs();document.body.classList.remove('playing');
 $('crosshair').classList.add('hidden');$('target').classList.add('hidden');$('pause').classList.remove('hidden');
 $('pause-title').textContent=noSpawn?'暫時沒有落腳的地方。':'在雲上，歇一會。';
 $('pause-text').textContent=noSpawn?'草地島已沒有安全位置，重新開始即可還原世界。':'世界會等你回來。點擊繼續，再出發。';
 $('resume').classList.toggle('hidden',noSpawn);
 if(document.pointerLockElement)document.exitPointerLock();
}
async function startPlay() {
 if(blocked)return;
 playing=true;started=true;resetInputs();$('welcome').classList.add('hidden');$('pause').classList.add('hidden');$('crosshair').classList.remove('hidden');document.body.classList.add('playing');
 canvas.focus();
 try {await canvas.requestPointerLock();}
 catch {toast('滑鼠未鎖定：按住畫面拖曳觀看，WASD 移動');}
}
function showOverview() {
 if(blocked){showPause(true);return;}
 playing=false;resetInputs();$('welcome').classList.remove('hidden');$('pause').classList.add('hidden');$('crosshair').classList.add('hidden');$('target').classList.add('hidden');document.body.classList.remove('playing');
 if(document.pointerLockElement)document.exitPointerLock();
 $('start').innerHTML=(started?'繼續探索':'開始探索')+' <span>↗</span>';
}
function cameraUpdate() {
 if(playing&&game.player) {const p=game.player;camera.position.set(p.x,p.y+1.62,p.z);camera.rotation.set(pitch,yaw,0);camera.fov=70;camera.clearViewOffset();}
 else if(!$('welcome').classList.contains('hidden')) {
   const a=time*.013;
   camera.position.set(30*Math.cos(a)-22*Math.sin(a),35,30*Math.sin(a)+37*Math.cos(a));camera.fov=45;
   camera.lookAt(-.5,9.7,0);camera.setViewOffset(innerWidth,innerHeight,innerWidth*.11,0,innerWidth,innerHeight);
 }
 camera.updateProjectionMatrix();
}
function interact(dt) {
 const dir=new THREE.Vector3();camera.getWorldDirection(dir);target=world.ray(camera.position,dir);
 outline.visible=!!target;cracks.visible=false;
 $('target').classList.toggle('hidden',!target);
 if(target) {outline.position.set(target.x+.5,target.y+.5,target.z+.5);$('target').textContent=`${NAMES[target.type]} · 按住挖掘`;}
 const mined=game.mine(target,held,dt);
 if(mined) {toast(`挖下了${NAMES[mined.type]}，走近就能收集`);target=null;outline.visible=false;}
 if(game.dig) {const t=game.dig.target;const progress=game.dig.elapsed/digDuration(t.type);cracks.material=crackMaterials[Math.min(9,Math.floor(progress*10))];cracks.position.set(t.x+.5,t.y+.5,t.z+.5);cracks.visible=true;$('dig-meter').classList.remove('hidden');$('dig-meter').firstElementChild.style.width=`${Math.min(100,progress*100)}%`;}
 else $('dig-meter').classList.add('hidden');
}
function gameUI() {
 updateInventory();
 for(const [id,stat] of [['mine','mined'],['collect','collected'],['place','placed']]) {const done=game.stats[stat]>0;const el=$('step-'+id);el.textContent=done?'✓':'○';el.parentElement.classList.toggle('done',done);}
 if(game.stats.mined&&game.stats.collected&&game.stats.placed)$('guide-status').textContent='第一趟建造完成，繼續探索吧！';
 if(playing&&game.player) {
   const p=game.player;let nearest=ISLANDS.reduce((a,b)=>Math.hypot(p.x-a.x,p.z-a.z)<Math.hypot(p.x-b.x,p.z-b.z)?a:b);
   $('location').textContent=Math.hypot(p.x-nearest.x,p.z-nearest.z)<nearest.r+1?nearest.name:'雲間小徑';
   $('coords').textContent=`${p.x.toFixed(0)} · ${p.y.toFixed(0)} · ${p.z.toFixed(0)}`;
 } else {$('location').textContent='雲海之上';$('coords').textContent='32 × 32 × 32';}
}
$('start').onclick=startPlay;$('resume').onclick=startPlay;$('overview').onclick=showOverview;
$('restart').onclick=()=>{location.reload();};
$('fullscreen').onclick=async()=>{try {if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('可使用瀏覽器的全螢幕功能');}};
let drag=false,lastMouse={x:0,y:0};
canvas.tabIndex=0;canvas.style.outline='none';
canvas.addEventListener('mousedown',e=>{
 if(!playing)return;
 if(e.button===0)held=true;
 if(e.button===1 || document.pointerLockElement!==canvas) {drag=true;lastMouse={x:e.clientX,y:e.clientY};}
 if(e.button===2) {
   if(game.place(target,TYPES[selected])) {toast(`放置${NAMES[TYPES[selected]]} −1`);updateInventory();}
   else toast('無法放置：確認數量、空間與放置距離');
 }
});
document.addEventListener('mouseup',()=>{held=false;drag=false;game.dig=null;});
document.addEventListener('mousemove',e=>{
 if(!playing)return;
 if(document.pointerLockElement===canvas || drag) {
   const dx=document.pointerLockElement===canvas?e.movementX:e.clientX-lastMouse.x;
   const dy=document.pointerLockElement===canvas?e.movementY:e.clientY-lastMouse.y;
   yaw-=dx*.0025;pitch=Math.max(-1.48,Math.min(1.48,pitch-dy*.0025));lastMouse={x:e.clientX,y:e.clientY};
 }
});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{if(playing){e.preventDefault();selected=(selected+(e.deltaY>0?1:7))%8;updateInventory();}},{passive:false});
document.addEventListener('keydown',e=>{
 if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
 if(e.repeat)return;
 if(e.code==='KeyR')$('weather').click();
 if(e.code==='KeyM'){showOverview();return;}
 if(e.code==='KeyF')$('fullscreen').click();
 if(e.code==='Escape'&&playing){showPause();return;}
 if(e.code.startsWith('Digit')&&+e.code.slice(5)>=1&&+e.code.slice(5)<=8){selected=+e.code.slice(5)-1;updateInventory();}
 if(playing)keys.add(e.code);
});
document.addEventListener('keyup',e=>keys.delete(e.code));
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas&&playing)showPause();});
window.addEventListener('blur',()=>{resetInputs();if(playing)showPause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)showPause();});
window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();if(playing)showPause();toast('繪圖暫時中斷，請重新整理頁面');});
try {
 await Promise.all([...texturePromises,...Array.from({length:10},async(_,i)=>{
   const tex=await loader.loadAsync(`${path}textures/16px/destroy_stage_${i}.png`);tex.magFilter=tex.minFilter=THREE.NearestFilter;
   crackMaterials[i]=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
 })]);
 for(const t of TYPES)dropMaterials[t]=materialFor(t).map(m=>{const clone=m.clone();clone.vertexColors=false;return clone;});
 rebuildWorld();gameUI();$('loading').classList.add('hidden');
} catch(e) {$('loading').innerHTML='<p>素材載入失敗，請用「啟動天空島」啟動，並確認 assets 資料夾完整。</p>';throw e;}

const animals=new Animals(game,new URLSearchParams(location.search).has('stress')?6:3);
const animalMeshes=new Map();
const animalMats={};
for(const [name,color]of Object.entries({pink:0xeaa3a1,snout:0xd58389,hoof:0x725c50,wool:0xf0efde,face:0xb9aa91,brown:0xb58a5c,dark:0x604a38,eye:0x222c28,cream:0xe8d8b6}))animalMats[name]=new THREE.MeshLambertMaterial({color});
function animalPart(group,mat,size,pos) {
 const mesh=new THREE.Mesh(blockGeo,animalMats[mat]);mesh.scale.set(...size);mesh.position.set(...pos);group.add(mesh);return mesh;
}
for(const a of animals.agents) {
 const group=new THREE.Group(),kind=a.kind,skin=kind==='pig'?'pink':kind==='sheep'?'wool':'brown';
 animalPart(group,skin,[.62,.40,.64],[0,.53,0]);
 animalPart(group,kind==='sheep'?'face':skin,[.33,.33,.30],[0,.66,.32]);
 if(kind==='pig') {
   animalPart(group,'snout',[.23,.13,.09],[0,.62,.51]);
   for(const x of [-.15,.15])animalPart(group,'pink',[.10,.15,.10],[x,.88,.29]);
   for(const x of [-.05,.05])animalPart(group,'dark',[.025,.025,.015],[x,.63,.559]);
 } else if(kind==='sheep') {
   animalPart(group,'wool',[.69,.20,.70],[0,.75,-.04]);
   for(const x of [-.20,.20])animalPart(group,'face',[.14,.10,.13],[x,.72,.31]);
 } else {
   animalPart(group,'cream',[.22,.14,.13],[0,.59,.49]);
   animalPart(group,'dark',[.10,.07,.05],[0,.63,.565]);
   for(const x of [-.17,.17])animalPart(group,'dark',[.10,.23,.13],[x,.70,.30]);
   const tail=animalPart(group,'brown',[.10,.30,.10],[0,.70,-.37]);tail.rotation.x=-.6;
 }
 for(const x of [-.105,.105])animalPart(group,'eye',[.045,.055,.02],[x,.72,.477]);
 const legs=[];
 for(const x of [-.21,.21])for(const z of [-.22,.22])legs.push(animalPart(group,kind==='sheep'?'face':'hoof',[.13,.28,.13],[x,.19,z]));
 scene.add(group);animalMeshes.set(a,{group,legs});
}
const zoneMeshes=[];
const waterMat=new THREE.MeshLambertMaterial({color:0x60c6d8,transparent:true,opacity:.7,depthWrite:false});
const lavaMat=new THREE.MeshBasicMaterial({color:0xf2993f});
const flameMat=new THREE.MeshBasicMaterial({color:0xf2a343}),flameCoreMat=new THREE.MeshBasicMaterial({color:0xffdf8a});
for(const zone of world.zones) {
 const group=new THREE.Group();group.position.set(zone.x+zone.w/2,zone.y,zone.z+zone.d/2);
 if(zone.kind==='water'||zone.kind==='lava') {
   const surface=new THREE.Mesh(blockGeo,zone.kind==='water'?waterMat:lavaMat);surface.scale.set(zone.w-.02,.07,zone.d-.02);surface.position.y=.77;group.add(surface);
   const accent=new THREE.MeshBasicMaterial({color:zone.kind==='water'?0xc2f2ee:0xffcc64,transparent:true,opacity:.7});
   for(let i=0;i<4;i++){const line=new THREE.Mesh(blockGeo,accent);line.scale.set(.3+i%2*.35,.012,.035);line.position.set((i%2-.5)*zone.w*.45,.813,((i>>1)-.5)*zone.d*.5);group.add(line);}
 } else {
   for(let i=0;i<3;i++) {const flame=new THREE.Mesh(blockGeo,i===1?flameCoreMat:flameMat);flame.position.set((i-1)*.18,.4-i%2*.1,0);flame.scale.set(.18,.72-i%2*.22,.19);flame.rotation.z=(i-1)*-.15;group.add(flame);}
 }
 scene.add(group);zoneMeshes.push({zone,group});
}
const markerLayer=document.createElement('div');markerLayer.className='island-markers';document.body.append(markerLayer);
const markers=ISLANDS.map((island,i)=>{const el=document.createElement('span');el.className='island-marker';el.innerHTML=`<i style="background:${island.color}"></i>${island.name}<small>0${i+1} / ${island.en}</small>`;markerLayer.append(el);return{island,el};});
const rain=new Rain();
const rainPositions=new Float32Array(rain.count*6),rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPositions,3).setUsage(THREE.DynamicDrawUsage));
const rainMesh=new THREE.LineSegments(rainGeo,new THREE.LineBasicMaterial({color:0xd4e4e7,transparent:true,opacity:.65,depthWrite:false}));rainMesh.frustumCulled=false;rainMesh.visible=false;scene.add(rainMesh);
function rainCenter(){return playing&&game.player?{x:game.player.x,y:game.player.y+1,z:game.player.z}:{x:-3,y:13,z:0};}
$('weather').onclick=()=>{
 rainy=!rainy;rain.set(rainy,rainCenter());rainMesh.visible=rainy;
 $('weather-icon').textContent=rainy?'☂':'☀';$('weather-text').textContent=rainy?'下雨':'晴天';$('weather').setAttribute('aria-pressed',rainy?'true':'false');
 const sky=rainy?0xb3cdd1:0xc9e3e9;renderer.setClearColor(sky);scene.fog.color.setHex(sky);sun.intensity=rainy?1.5:2.6;
 toast(rainy?'下雨了，聽天空說說話。':'雲散了，又是好天氣。');
};
function extensionUpdate(dt) {
 // Animals are lively on the title view, and pause with the game menu.
 if(playing||!started)animals.update(dt);
 for(const[a,{group,legs}]of animalMeshes){group.visible=!a.hidden;group.position.set(a.x,a.y,a.z);group.rotation.y=a.heading;for(let i=0;i<legs.length;i++)legs[i].rotation.x=a.walking?Math.sin(a.phase+(i===0||i===3?0:Math.PI))*.35:0;}
 for(let i=0;i<zoneMeshes.length;i++){const{zone,group}=zoneMeshes[i];if(zone.kind==='fire')group.scale.y=.9+Math.sin(time*7+i*2)*.1;}
 rain.update(dt,rainCenter(),world);
 if(rainy) {for(let i=0;i<rain.count;i++){const p=rain.particles[i],j=i*6;rainPositions[j]=p.x;rainPositions[j+1]=p.y;rainPositions[j+2]=p.z;rainPositions[j+3]=p.x+.02;rainPositions[j+4]=p.y+.34;rainPositions[j+5]=p.z;}rainGeo.attributes.position.needsUpdate=true;}
 const visible=!$('welcome').classList.contains('hidden');markerLayer.classList.toggle('hidden',!visible);
 if(visible)for(const{island,el}of markers){const pos=new THREE.Vector3(island.x+.5,13.5,island.z+.5).project(camera);el.style.left=(pos.x*.5+.5)*innerWidth+'px';el.style.top=(-pos.y*.5+.5)*innerHeight+'px';el.style.display=pos.z>1?'none':'';}
}
function frame() {
 requestAnimationFrame(frame);
 const raw=clock.getDelta(),dt=Math.min(raw,.05);time+=dt;
 if(playing) {
   const input={forward:keys.has('KeyW')||keys.has('ArrowUp'),back:keys.has('KeyS')||keys.has('ArrowDown'),left:keys.has('KeyA')||keys.has('ArrowLeft'),right:keys.has('KeyD')||keys.has('ArrowRight'),jump:keys.has('Space')};
   // Substeps keep fast falls and narrow obstacles stable on slow machines.
   const steps=Math.ceil(dt/(1/90));for(let i=0;i<steps;i++){const status=game.updatePlayer(dt/steps,input,yaw);if(status==='hazard')toast('碰到危險區，已回到草地島');if(status==='fall')toast('回到安全的草地島，物品都還在');}
   if(!game.player) {showPause(true);}
   else {cameraUpdate();interact(dt);game.updateDrops(dt);}
 } else {outline.visible=false;cracks.visible=false;$('dig-meter').classList.add('hidden');cameraUpdate();}
 extensionUpdate(dt);
 if(worldVersion!==world.revision)rebuildWorld();
 syncDrops();
 if(performance.now()>toastUntil)$('toast').classList.remove('show');
 uiTimer+=dt;if(uiTimer>.12){gameUI();uiTimer=0;}
 cloudGroup.rotation.y=Math.sin(time*.015)*.04;
 renderer.render(scene,camera);
 fpsFrames++;fpsTime+=raw;if(fpsTime>=1){$('fps').textContent=`${Math.round(fpsFrames/fpsTime)} FPS`;fpsFrames=0;fpsTime=0;}
}
frame();
// Exports support optional local integration tests without adding game UI.
export {game,world,animals,rain,renderer};
