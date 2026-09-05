
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const $ = id => document.getElementById(id);

/* touch / phone detection */
const IS_TOUCH = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
if(IS_TOUCH) document.body.classList.add('touch');

/* =========================================================
   1. RENDERER  -  HD by default, optional retro downscale
========================================================= */
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('game').appendChild(renderer.domElement);

let retro = false;
const QUALITY = IS_TOUCH ? 0.72 : 1;          // internal resolution scale on phones
function resize(){
  if(retro){
    renderer.setPixelRatio(1);
    renderer.setSize(320,240,false);
    camera.aspect = 4/3;
  } else {
    renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH?1.5:2)*QUALITY);
    renderer.setSize(innerWidth,innerHeight,false);
    camera.aspect = innerWidth/innerHeight;
  }
  camera.updateProjectionMatrix();
}

/* =========================================================
   2. PROCEDURAL TEXTURES (canvas based, no external assets)
========================================================= */
function canvasTex(w,h,draw,repX=1,repY=1){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(repX,repY);
  t.anisotropy=8; t.colorSpace=THREE.SRGBColorSpace;
  return t;
}
function noiseOverlay(ctx,w,h,alpha,size=1){
  for(let i=0;i<(w*h)/(size*size)/2;i++){
    ctx.fillStyle='rgba(0,0,0,'+(Math.random()*alpha).toFixed(3)+')';
    ctx.fillRect(Math.random()*w,Math.random()*h,size,size);
  }
}
/* kitchen lino tiles */
const texFloor = canvasTex(256,256,(c,w,h)=>{
  c.fillStyle='#6d5b46'; c.fillRect(0,0,w,h);
  for(let y=0;y<2;y++)for(let x=0;x<2;x++){
    c.fillStyle=(x+y)%2?'#7a6750':'#5f4f3c';
    c.fillRect(x*w/2,y*h/2,w/2,h/2);
  }
  c.strokeStyle='rgba(0,0,0,.45)'; c.lineWidth=3;
  for(let i=0;i<=2;i++){c.beginPath();c.moveTo(i*w/2,0);c.lineTo(i*w/2,h);c.stroke();
    c.beginPath();c.moveTo(0,i*h/2);c.lineTo(w,i*h/2);c.stroke();}
  noiseOverlay(c,w,h,.22,2);
},6,6);
/* striped wallpaper */
const texWall = canvasTex(256,256,(c,w,h)=>{
  c.fillStyle='#8b8377'; c.fillRect(0,0,w,h);
  for(let x=0;x<w;x+=16){ c.fillStyle=(x/16)%2?'#7e7669':'#918978'; c.fillRect(x,0,8,h); }
  c.fillStyle='rgba(60,40,25,.18)';
  for(let i=0;i<26;i++) c.fillRect(Math.random()*w,Math.random()*h,Math.random()*40,Math.random()*7);
  noiseOverlay(c,w,h,.2,2);
},3,1.4);
/* hallway plaster */
const texHall = canvasTex(256,256,(c,w,h)=>{
  c.fillStyle='#5d5852'; c.fillRect(0,0,w,h);
  for(let i=0;i<70;i++){ c.strokeStyle='rgba(0,0,0,.16)'; c.lineWidth=Math.random()*2;
    c.beginPath(); c.moveTo(Math.random()*w,Math.random()*h);
    c.lineTo(Math.random()*w,Math.random()*h); c.stroke(); }
  noiseOverlay(c,w,h,.3,2);
},3,2);
/* wood grain */
const texWood = canvasTex(256,256,(c,w,h)=>{
  c.fillStyle='#7a5636'; c.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=4){
    c.strokeStyle='rgba(50,30,15,'+(0.1+Math.random()*0.25).toFixed(2)+')';
    c.lineWidth=1+Math.random()*2; c.beginPath();
    c.moveTo(0,y+Math.sin(y*0.2)*3); c.bezierCurveTo(w/3,y+6,2*w/3,y-6,w,y+Math.cos(y*.15)*3);
    c.stroke();
  }
  noiseOverlay(c,w,h,.15,2);
},2,2);
/* enamel (fridge) */
const texEnamel = canvasTex(128,128,(c,w,h)=>{
  c.fillStyle='#dcd8c8'; c.fillRect(0,0,w,h); noiseOverlay(c,w,h,.1,1);
});
/* handwritten note */
const texNote = canvasTex(128,160,(c,w,h)=>{
  c.fillStyle='#f3edd7'; c.fillRect(0,0,w,h);
  c.strokeStyle='#c8bfa2'; for(let y=16;y<h;y+=14){c.beginPath();c.moveTo(6,y);c.lineTo(w-6,y);c.stroke();}
  c.fillStyle='#3a3a44';
  for(let y=14;y<h-8;y+=14){ let x=10; while(x<w-14){ const l=6+Math.random()*22;
    c.fillRect(x,y-5,l,2.4); x+=l+5; } }
  c.fillStyle='#a33'; c.fillRect(8,4,w-16,3);
});
/* animated TV static */
const tvCanvas=document.createElement('canvas'); tvCanvas.width=tvCanvas.height=96;
const tvCtx=tvCanvas.getContext('2d');
const texTV=new THREE.CanvasTexture(tvCanvas);
function drawStatic(){
  const img=tvCtx.createImageData(96,96);
  for(let i=0;i<img.data.length;i+=4){
    const v=40+Math.random()*215;
    img.data[i]=v*0.75; img.data[i+1]=v*0.92; img.data[i+2]=v; img.data[i+3]=255;
  }
  tvCtx.putImageData(img,0,0);
  tvCtx.fillStyle='rgba(255,255,255,.10)';
  tvCtx.fillRect(0,(performance.now()/9)%96,96,7);
  texTV.needsUpdate=true;
}

/* =========================================================
   3. SCENE / CAMERA / LIGHTS
========================================================= */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10141c);
scene.fog = new THREE.FogExp2(0x10141c, 0.045);

const camera = new THREE.PerspectiveCamera(72, 16/9, 0.05, 120);
camera.position.set(0,1.55,4);

const ambient = new THREE.AmbientLight(0xa8bcd8, 0.55); scene.add(ambient);
const hemi = new THREE.HemisphereLight(0xa9bede, 0x40372c, 0.55); scene.add(hemi);

const bulb = new THREE.PointLight(0xffdcae, 14, 18, 2);
bulb.position.set(0,2.55,-1); bulb.castShadow=true;
bulb.shadow.mapSize.set(IS_TOUCH?512:1024,IS_TOUCH?512:1024); bulb.shadow.bias=-0.004; scene.add(bulb);
const shade = new THREE.Mesh(new THREE.ConeGeometry(0.34,0.28,10,1,true),
  new THREE.MeshStandardMaterial({color:0x2c2c33,roughness:.8,side:THREE.DoubleSide}));
shade.position.set(0,2.66,-1); scene.add(shade);
const glassBulb = new THREE.Mesh(new THREE.SphereGeometry(0.08,10,8),
  new THREE.MeshStandardMaterial({color:0xffe6bb,emissive:0xffd9a0,emissiveIntensity:2.4,roughness:.4}));
glassBulb.position.set(0,2.5,-1); scene.add(glassBulb);

const counterLight = new THREE.PointLight(0xffe3c0, 6, 12, 2);
counterLight.position.set(-3.2,2.4,3.0); scene.add(counterLight);
const moon = new THREE.DirectionalLight(0x93aade, 0.75);
moon.position.set(9,7,6); moon.castShadow=true;
moon.shadow.mapSize.set(IS_TOUCH?512:1024,IS_TOUCH?512:1024);
moon.shadow.camera.far=40;
moon.shadow.camera.left=-12; moon.shadow.camera.right=12;
moon.shadow.camera.top=12; moon.shadow.camera.bottom=-12;
scene.add(moon);

const hallLight = new THREE.PointLight(0xd6e4ff, 0, 16, 2);
hallLight.position.set(0,2.55,-8); hallLight.castShadow=!IS_TOUCH;
hallLight.shadow.mapSize.set(512,512); scene.add(hallLight);
const hallGlow = new THREE.PointLight(0x6d84b8, 2.2, 12, 2);
hallGlow.position.set(0,2.4,-14); scene.add(hallGlow);
const tvLight = new THREE.PointLight(0x9fdcff, 0, 10, 2);
tvLight.position.set(4.2,1.3,1.6); scene.add(tvLight);

const flashlight = new THREE.SpotLight(0xfff4dc, 0, 26, Math.PI/6.6, 0.42, 1.0);
flashlight.castShadow = !IS_TOUCH;
flashlight.shadow.mapSize.set(512,512);
flashlight.position.set(0.22,-0.12,0);
flashlight.target.position.set(0,0,-1);
camera.add(flashlight, flashlight.target);
scene.add(camera);

/* =========================================================
   4. MATERIALS + HELPERS
========================================================= */
const std = o => new THREE.MeshStandardMaterial(o);
const M = {
  floor : std({map:texFloor, roughness:.72, metalness:.02}),
  wall  : std({map:texWall,  roughness:.92}),
  hall  : std({map:texHall,  roughness:.95}),
  ceil  : std({color:0x3d3d46, roughness:.95}),
  wood  : std({map:texWood,  roughness:.65}),
  fridge: std({map:texEnamel, color:0xe8e4d6, roughness:.32, metalness:.28}),
  metal : std({color:0xb9bcc2, roughness:.28, metalness:.85}),
  dark  : std({color:0x272730, roughness:.7}),
  door  : std({map:texWood, color:0xc79a6d, roughness:.6}),
  paper : std({map:texNote, roughness:.95}),
  glass : std({color:0x4a6a8c, roughness:.08, metalness:.2, transparent:true, opacity:.28}),
  cloth : std({color:0x5c6478, roughness:1, side:THREE.DoubleSide}),
  screen: new THREE.MeshStandardMaterial({map:texTV, emissiveMap:texTV,
            emissive:0xffffff, emissiveIntensity:0, roughness:.4, color:0x101418}),
  skin  : std({color:0xb9ae9c, roughness:.85}),
  suit  : std({color:0x22212a, roughness:.9})
};
function box(w,h,d,m,x,y,z,ry=0,shadow=true){
  const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), m);
  o.position.set(x,y,z); o.rotation.y=ry;
  o.castShadow=shadow; o.receiveShadow=true;
  scene.add(o); return o;
}

/* =========================================================
   5. LEVEL GEOMETRY
========================================================= */
const ROOM={w:10,d:10,h:3};
box(ROOM.w,0.2,ROOM.d,M.floor,0,-0.1,0,0,false);
box(ROOM.w,0.2,ROOM.d,M.ceil ,0,ROOM.h,0,0,false);
box(0.2,ROOM.h,ROOM.d,M.wall,-ROOM.w/2,ROOM.h/2,0);
box(0.2,ROOM.h,ROOM.d,M.wall, ROOM.w/2,ROOM.h/2,0);
box(3.4,ROOM.h,0.2,M.wall,-3.3,ROOM.h/2, ROOM.d/2);
box(3.4,ROOM.h,0.2,M.wall, 3.3,ROOM.h/2, ROOM.d/2);
box(3.2,ROOM.h,0.2,M.wall,0,ROOM.h/2, ROOM.d/2);          /* south wall is solid now */
box(3.6,ROOM.h,0.2,M.wall,-3.2,ROOM.h/2,-ROOM.d/2);
box(3.6,ROOM.h,0.2,M.wall, 3.2,ROOM.h/2,-ROOM.d/2);
box(2.8,0.7,0.2,M.wall,0,ROOM.h-0.35,-ROOM.d/2);
box(ROOM.w,0.16,0.06,M.wood,0,0.08,-ROOM.d/2+0.13,0,false);
box(0.06,0.16,ROOM.d,M.wood,-ROOM.w/2+0.13,0.08,0,0,false);

/* window + swaying curtain */
box(0.06,1.4,2.3,M.glass,ROOM.w/2-0.12,1.75,-2.0,0,false);
box(0.1,1.6,0.12,M.wood,ROOM.w/2-0.16,1.75,-0.85,0,false);
box(0.1,1.6,0.12,M.wood,ROOM.w/2-0.16,1.75,-3.15,0,false);
const curtain = new THREE.Mesh(new THREE.PlaneGeometry(2.4,1.7,14,8), M.cloth);
curtain.rotation.y = -Math.PI/2;
curtain.position.set(ROOM.w/2-0.28,1.75,-2.0);
curtain.receiveShadow=true; scene.add(curtain);
const curtainBase = Float32Array.from(curtain.geometry.attributes.position.array);

/* hallway */
box(2.8,0.2,14,M.hall,0,-0.1,-12,0,false);
box(2.8,0.2,14,M.ceil,0,ROOM.h,-12,0,false);
box(0.2,ROOM.h,14,M.hall,-1.4,ROOM.h/2,-12);
box(0.2,ROOM.h,14,M.hall, 1.4,ROOM.h/2,-12);
box(2.8,ROOM.h,0.2,M.hall,0,ROOM.h/2,-19);
for(let z=-7; z>-18; z-=3.5) box(0.9,1.3,0.05,M.paper,-1.32,1.7,z,Math.PI/2,false);

/* furniture */
box(3.0,0.9,0.85,M.wood,-3.2,0.45,3.35);
box(3.05,0.06,0.9,M.metal,-3.2,0.92,3.35);
box(1.7,0.08,1.1,M.wood, 3.0,0.75,-1.0);
for(const c of [[2.3,-1.6],[3.7,-1.6],[2.3,-0.4],[3.7,-0.4]]) box(0.1,0.75,0.1,M.wood,c[0],0.37,c[1]);
box(0.45,0.5,0.5,M.metal,-4.3,1.2,3.35);
box(0.42,0.95,0.42,M.dark,-0.25,0.47,4.35);
box(1.3,0.62,0.45,M.wood, 4.35,0.31,1.9);

/* =========================================================
   6. INTERACTIVE PROPS (with animated pivots)
========================================================= */
const interactables=[];
const tag=(m,action,label)=>{ m.userData.action=action; m.userData.label=label;
  interactables.push(m); return m; };
const mesh=(g,m,x,y,z)=>{ const o=new THREE.Mesh(g,m); o.position.set(x,y,z);
  o.castShadow=true; o.receiveShadow=true; return o; };
const B=(w,h,d)=>new THREE.BoxGeometry(w,h,d);

/* ---- FRIDGE, door on a hinge pivot ---- */
const fridge=new THREE.Group(); fridge.position.set(-4.15,0,-3.6); fridge.rotation.y=Math.PI*0.06;
fridge.add(mesh(B(1.15,2.05,0.92),M.fridge,0,1.02,0));
const fridgeHinge=new THREE.Group(); fridgeHinge.position.set(-0.57,0,0.46); fridge.add(fridgeHinge);
const fDoor=mesh(B(1.14,1.32,0.07),M.fridge,0.57,0.7,0.02); fridgeHinge.add(fDoor);
fridgeHinge.add(mesh(B(0.07,1.0,0.07),M.metal,1.02,0.74,0.08));
const frzHinge=new THREE.Group(); frzHinge.position.set(-0.57,0,0.46); fridge.add(frzHinge);
frzHinge.add(mesh(B(1.14,0.6,0.07),M.fridge,0.57,1.7,0.02));
frzHinge.add(mesh(B(0.07,0.42,0.07),M.metal,1.02,1.68,0.08));
const fNote=mesh(B(0.44,0.56,0.015),M.paper,-0.16,1.02,0.06); fNote.rotation.z=0.05;
fridgeHinge.add(fNote);
const magnet=mesh(new THREE.CylinderGeometry(0.05,0.05,0.02,10),std({color:0xc23b22,roughness:.5}),-0.16,1.30,0.07);
magnet.rotation.x=Math.PI/2; fridgeHinge.add(magnet);
/* fridge interior glow when open */
const fridgeInner=new THREE.PointLight(0xdfeaff,0,2.6,2); fridgeInner.position.set(0,1.1,0.2);
fridge.add(fridgeInner);
scene.add(fridge);
fridge.traverse(o=>{ if(o.isMesh) tag(o,'rules','Press [E] to Read Rules'); });

/* ---- FRONT DOOR: the flat's only way out, opens onto the communal hallway ---- */
box(1.1,2.3,0.2,M.wall,-0.85,1.15,-ROOM.d/2);            /* fixed half of the doorway */
const DOOR_GAP=[-0.28,1.38];
const doorPivot=new THREE.Group(); doorPivot.position.set(1.4,0,-ROOM.d/2+0.08); scene.add(doorPivot);
const frontDoor=mesh(B(1.7,2.3,0.12),M.door,-0.85,1.15,0); doorPivot.add(frontDoor);
doorPivot.add(mesh(new THREE.SphereGeometry(0.07,12,10),M.metal,-1.62,1.15,0.12));
tag(frontDoor,'door','Press [E] to Open the Front Door');
const DOOR_SWING=1.3;

/* ---- HALLWAY LIGHT SWITCH (toggle animates) ---- */
const switchPlate=box(0.24,0.34,0.05,std({color:0xece6d2,roughness:.7}),-1.95,1.42,-ROOM.d/2+0.14,0,false);
const switchNub=box(0.09,0.14,0.06,M.dark,-1.95,1.46,-ROOM.d/2+0.19,0,false);
tag(switchPlate,'switch','Press [E] to Flip the Hallway Light');
tag(switchNub,'switch','Press [E] to Flip the Hallway Light');

/* ---- CUPBOARD: built from panels so the inside is a real space ---- */
const closet=new THREE.Group(); closet.position.set(4.05,0,-4.0); closet.rotation.y=-Math.PI*0.1;
closet.add(mesh(B(1.7,2.35,0.06),M.wood,0,1.17,-0.47));   // back
closet.add(mesh(B(0.06,2.35,0.95),M.wood,-0.85,1.17,0));   // left side
closet.add(mesh(B(0.06,2.35,0.95),M.wood, 0.85,1.17,0));   // right side
closet.add(mesh(B(1.7,0.06,0.95),M.wood,0,2.34,0));        // top
closet.add(mesh(B(1.7,0.06,0.95),M.wood,0,0.03,0));        // base
closet.add(mesh(B(1.6,0.05,0.85),M.wood,0,1.75,0));        // inner shelf
const clHingeL=new THREE.Group(); clHingeL.position.set(-0.82,0,0.47); closet.add(clHingeL);
clHingeL.add(mesh(B(0.8,2.12,0.06),M.door,0.4,1.12,0));
const clHingeR=new THREE.Group(); clHingeR.position.set( 0.82,0,0.47); closet.add(clHingeR);
clHingeR.add(mesh(B(0.8,2.12,0.06),M.door,-0.4,1.12,0));
scene.add(closet);
closet.traverse(o=>{ if(o.isMesh) tag(o,'closet','Press [E] to Hide in the Cupboard'); });

/* ---- TV ---- */
const tvBody=box(1.2,0.85,0.55,M.dark,4.35,1.0,1.9);
const tvScreen=box(1.0,0.65,0.03,M.screen,4.35,1.05,1.62);
tag(tvBody,'tv','Press [E] to Turn the TV On');
tag(tvScreen,'tv','Press [E] to Turn the TV On');

/* ---- PHONE (receiver rattles when ringing) ---- */
const phone=new THREE.Group(); phone.position.set(-2.3,0.95,3.35); scene.add(phone);
phone.add(mesh(B(0.3,0.1,0.36),M.dark,0,0,0));
const receiver=mesh(B(0.28,0.09,0.1),std({color:0x15151a,roughness:.6}),0,0.09,0);
phone.add(receiver);
phone.traverse(o=>{ if(o.isMesh) tag(o,'phone','Press [E] to Check the Phone'); });

/* ---- WALL NOTE ---- */
const wallNote=box(0.02,0.52,0.4,M.paper,-ROOM.w/2+0.13,1.72,-1.0,0,false);
tag(wallNote,"letter","Press [E] to Read Grandma's Note");

/* ---- COUCH (sit, eat, sleep) ---- */
const couch=new THREE.Group(); couch.position.set(2.6,0,3.2); couch.rotation.y=-Math.PI*0.08;
const couchMat=std({color:0x4a4438,roughness:.95});
couch.add(mesh(B(2.3,0.42,0.95),couchMat,0,0.3,0));
couch.add(mesh(B(2.3,0.75,0.22),couchMat,0,0.72,-0.38));
couch.add(mesh(B(0.22,0.62,0.95),couchMat,-1.05,0.6,0));
couch.add(mesh(B(0.22,0.62,0.95),couchMat, 1.05,0.6,0));
const cushionL=mesh(B(1.0,0.16,0.85),std({color:0x565040,roughness:1}),-0.55,0.58,0.02);
const cushionR=mesh(B(1.0,0.16,0.85),std({color:0x565040,roughness:1}), 0.55,0.58,0.02);
couch.add(cushionL,cushionR);
scene.add(couch);
couch.traverse(o=>{ if(o.isMesh) tag(o,'couch','Press [E] to Sit Down'); });

/* ---- FOOD BOX: appears on the floor after the delivery knock ---- */
const foodBox=new THREE.Group(); foodBox.position.set(0.6,0,3.55);
const pizzaTex=canvasTex(128,128,(c,w,h)=>{
  c.fillStyle='#c9a86e'; c.fillRect(0,0,w,h);
  c.fillStyle='#8d2f22'; c.beginPath(); c.arc(w/2,h/2,34,0,7); c.fill();
  c.fillStyle='#3a3a44'; c.font='bold 15px monospace';
  c.fillText('LATE NITE',16,26); c.fillText('PIZZA CO.',20,110);
  noiseOverlay(c,w,h,.18,2);
});
foodBox.add(mesh(B(0.62,0.09,0.62),std({map:pizzaTex,roughness:.9}),0,0.06,0));
foodBox.add(mesh(B(0.3,0.14,0.22),std({color:0xb9432f,roughness:.7}),0.42,0.08,0.1));
foodBox.visible=false; scene.add(foodBox);

/* ---- HALLWAY DOORS: all locked ---- */
const hallDoors=[];
[[-1.3,-6.5,1],[1.3,-9.5,-1],[-1.3,-13.0,1],[1.3,-16.0,-1]].forEach(d=>{
  const g=new THREE.Group(); g.position.set(d[0],0,d[1]); g.rotation.y=d[2]*Math.PI/2;
  const leaf=mesh(B(1.15,2.15,0.09),M.door,0,1.08,0); g.add(leaf);
  g.add(mesh(new THREE.SphereGeometry(0.06,10,8),M.metal,0.44,1.1,0.09));
  scene.add(g);
  tag(leaf,'halldoor','Press [E] to Open the Door');
  hallDoors.push({group:g, baseX:d[0], shake:0});
});

/* =========================================================
   6b. HOUSE DRESSING  (more of a real flat + solid furniture)
========================================================= */
/* --- simple axis-aligned blockers so you cannot walk through furniture --- */
const BLOCKERS=[];
const blk=(x,z,hw,hd)=>{ BLOCKERS.push({x,z,hw,hd}); };
blk(-3.2,3.35,1.5,0.46);    // counter
blk(-4.15,-3.6,0.72,0.42);  // fridge
blk(3.0,-1.0,0.9,0.6);      // dining table
blk(4.35,1.9,0.68,0.34);    // tv unit
blk(4.05,-4.0,0.95,0.55);   // cupboard
blk(2.6,3.28,1.18,0.42);    // couch
blk(-0.25,4.35,0.26,0.26);  // bin by the front door

/* --- microwave on the counter: door panel + window that lights up --- */
const mwPanel=box(0.4,0.34,0.04,std({color:0x1b1b20,roughness:.5}),-4.3,1.24,3.09,0,false);
tag(mwPanel,'microwave','Press [E] to Use the Microwave');
const mwGlass=box(0.26,0.22,0.03,std({color:0x241f14,emissive:0xffb14a,
  emissiveIntensity:0,roughness:.4}),-4.3,1.24,3.07,0,false);
const mwLight=new THREE.PointLight(0xffb14a,0,2.2,2); mwLight.position.set(-4.3,1.24,2.95); scene.add(mwLight);

/* --- kitchen: upper cabinets, sink, tap --- */
box(3.0,0.72,0.36,M.wood,-3.2,2.18,ROOM.d/2-0.38);
box(3.0,0.04,0.36,M.dark,-3.2,1.80,ROOM.d/2-0.38,0,false);
box(0.86,0.12,0.56,M.metal,-3.95,0.94,3.35,0,false);
box(0.06,0.34,0.06,M.metal,-3.95,1.14,3.60,0,false);
box(0.22,0.05,0.06,M.metal,-3.86,1.30,3.60,0,false);
box(0.5,0.02,0.34,std({color:0x6d6a5e,roughness:1}),-2.55,0.96,3.20,0.2,false);

/* --- rug, coffee table, mug --- */
const rugTex=canvasTex(128,128,(c,w,h)=>{
  c.fillStyle='#4b3f36'; c.fillRect(0,0,w,h);
  c.strokeStyle='#6d5c48'; c.lineWidth=4; c.strokeRect(8,8,w-16,h-16);
  c.strokeStyle='#3a3129'; c.lineWidth=2;
  for(let i=16;i<w;i+=14){ c.beginPath(); c.moveTo(i,0); c.lineTo(i,h); c.stroke(); }
  noiseOverlay(c,w,h,.3,2);
});
box(3.4,0.03,2.4,std({map:rugTex,roughness:1}),1.6,0.02,1.5,0.06,false);
box(1.15,0.07,0.62,M.wood,1.5,0.44,1.6,-0.08);
for(const c of [[1.0,1.35],[2.0,1.35],[1.0,1.85],[2.0,1.85]])
  box(0.07,0.42,0.07,M.wood,c[0],0.22,c[1],0,false);
box(0.16,0.14,0.16,std({color:0xd9d2c2,roughness:.5}),1.25,0.55,1.55,0,false);
blk(1.5,1.6,0.6,0.34);

/* --- bookshelf by the TV --- */
const shelf=new THREE.Group(); shelf.position.set(4.62,0,-1.7); scene.add(shelf);
shelf.add(mesh(B(0.34,1.9,1.2),M.wood,0,0.95,0));
for(let i=0;i<3;i++) shelf.add(mesh(B(0.3,0.04,1.1),M.dark,0.02,0.5+i*0.5,0));
for(let i=0;i<9;i++){
  const bh=0.22+Math.random()*0.1;
  shelf.add(mesh(B(0.2,bh,0.05+Math.random()*0.05),
    std({color:new THREE.Color().setHSL(Math.random(),0.3,0.25),roughness:.9}),
    0.02,0.5+Math.floor(i/3)*0.5+bh/2+0.02,-0.45+(i%3)*0.16+Math.random()*0.1));
}
blk(4.62,-1.7,0.2,0.62);

/* --- dead plant by the window --- */
const plant=new THREE.Group(); plant.position.set(4.35,0,-3.5); scene.add(plant);
plant.add(mesh(new THREE.CylinderGeometry(0.2,0.15,0.34,10),std({color:0x7a4a34,roughness:.9}),0,0.17,0));
for(let i=0;i<6;i++){
  const st=mesh(B(0.03,0.62,0.03),std({color:0x4c4a2a,roughness:1}),0,0.62,0);
  st.rotation.set((Math.random()-0.5)*0.7,Math.random()*3,(Math.random()-0.5)*0.7);
  plant.add(st);
}
blk(4.35,-3.5,0.22,0.22);

/* --- framed photos on the left wall --- */
const frameTex=canvasTex(96,96,(c,w,h)=>{
  c.fillStyle='#8d8676'; c.fillRect(0,0,w,h);
  c.fillStyle='#5b5648'; c.fillRect(10,10,w-20,h-20);
  c.fillStyle='#a49a86'; c.beginPath(); c.arc(w/2,h*0.42,14,0,7); c.fill();
  c.fillRect(w/2-16,h*0.56,32,26);
  noiseOverlay(c,w,h,.35,2);
});
[[-1.9,1.9],[0.6,1.72],[2.6,1.95]].forEach((p,i)=>{
  box(0.03,0.42,0.34,std({map:frameTex,roughness:.9}),-ROOM.w/2+0.13,p[1],p[0],0,false);
});

/* --- wall clock above the hallway doorway (hands follow the game clock) --- */
const wallClock=new THREE.Group(); wallClock.position.set(0,2.62,-ROOM.d/2+0.14); scene.add(wallClock);
const clockCase=mesh(new THREE.CylinderGeometry(0.24,0.24,0.05,20),M.dark,0,0,0);
clockCase.rotation.x=Math.PI/2; wallClock.add(clockCase);
const clockFace=mesh(new THREE.CylinderGeometry(0.2,0.2,0.02,20),std({color:0xe6e0cc,roughness:.8}),0,0,0.035);
clockFace.rotation.x=Math.PI/2; wallClock.add(clockFace);
const handH=mesh(B(0.03,0.12,0.01),M.dark,0,0.06,0.05); const handHPivot=new THREE.Group();
handHPivot.add(handH); wallClock.add(handHPivot);
const handM=mesh(B(0.02,0.17,0.01),std({color:0x7a2020,roughness:.7}),0,0.085,0.055);
const handMPivot=new THREE.Group(); handMPivot.add(handM); wallClock.add(handMPivot);

/* --- hallway: caged ceiling lamps, runner, end table --- */
const hallLamps=[];
[-8.5,-15.5].forEach(z=>{
  const g=new THREE.Group(); g.position.set(0,ROOM.h-0.18,z); scene.add(g);
  g.add(mesh(new THREE.SphereGeometry(0.11,10,8),
    std({color:0xfff0d0,emissive:0xffe0a8,emissiveIntensity:0,roughness:.4}),0,-0.06,0));
  g.add(mesh(new THREE.TorusGeometry(0.15,0.012,6,12),M.metal,0,-0.06,0));
  const L=new THREE.PointLight(0xd8e6ff,0,7,2); L.position.set(0,-0.1,0); g.add(L);
  hallLamps.push({light:L, glass:g.children[0], flick:Math.random()*9});
});
box(2.2,0.02,12,std({map:rugTex,roughness:1}),0,0.012,-12,0,false);
box(0.9,0.06,0.4,M.wood,0,0.78,-18.6,0,false);
for(const x of [-0.4,0.4]) box(0.06,0.78,0.06,M.wood,x,0.39,-18.6,0,false);
tag(box(0.16,0.3,0.16,std({color:0x3e4a52,roughness:.6}),0,0.95,-18.6,0,false),
    'vase','Press [E] to Look at the Vase');
blk(0,-18.6,0.5,0.25);

/* --- door numbers on the locked hallway doors --- */
const numTex=t=>canvasTex(64,64,(c,w,h)=>{
  c.fillStyle='#c9c2ae'; c.fillRect(0,0,w,h);
  c.fillStyle='#26242a'; c.font='bold 34px monospace'; c.textAlign='center';
  c.fillText(t,w/2,h/2+12); noiseOverlay(c,w,h,.25,2);
});
['4C','4D','4E','4F'].forEach((n,i)=>{
  const d=hallDoors[i]; if(!d) return;
  const plate=mesh(B(0.16,0.16,0.02),std({map:numTex(n),roughness:.9}),-0.36,1.62,0.06);
  d.group.add(plate);
});

/* =========================================================
   7. THE ENTITY  -  rigged limbs + walk cycle animation
========================================================= */
/* it is tall, thin and wrong: long coat, long arms, a pale mask instead of a face */
M.coat = std({color:0x191820, roughness:.96});
M.mask = std({color:0xcfc7b4, roughness:.55, emissive:0x2a1c14, emissiveIntensity:.35});
const entity=new THREE.Group();
entity.scale.setScalar(0.78);                      // ~2.25 m: it only just fits the doorframe
const hips=new THREE.Group(); hips.position.y=0.98; entity.add(hips);
const torso=mesh(B(0.5,1.0,0.28),M.coat,0,0.5,0); hips.add(torso);
const chest=mesh(B(0.56,0.34,0.3),M.coat,0,1.12,0); hips.add(chest);
/* ragged coat skirt */
for(let i=0;i<7;i++){
  const f=mesh(B(0.1,0.5+Math.random()*0.3,0.06),M.coat,-0.24+i*0.08,-0.22,0.12);
  f.rotation.x=0.06; hips.add(f);
}
const neck=mesh(B(0.1,0.26,0.1),M.mask,0,1.4,0); hips.add(neck);
const head=mesh(B(0.3,0.4,0.28),M.mask,0,1.72,0); hips.add(head);
/* hollow sockets + a too-wide seam of a mouth */
head.add(mesh(B(0.09,0.07,0.03),std({color:0x08080a}),-0.075,0.05,0.14));
head.add(mesh(B(0.09,0.07,0.03),std({color:0x08080a}), 0.075,0.05,0.14));
head.add(mesh(B(0.22,0.015,0.02),std({color:0x1a0d0c}),0,-0.1,0.145));
for(let i=0;i<10;i++){                              // thin wet hair
  const s=mesh(B(0.015,0.34,0.015),std({color:0x0d0c10,roughness:1}),
    -0.12+Math.random()*0.24,0.02,-0.1+Math.random()*0.05);
  s.rotation.z=(Math.random()-0.5)*0.4; head.add(s);
}
const armL=new THREE.Group(); armL.position.set(-0.32,1.32,0); hips.add(armL);
const foreL=new THREE.Group(); foreL.position.y=-0.56; armL.add(foreL);
armL.add(mesh(B(0.11,0.58,0.11),M.coat,0,-0.28,0));
foreL.add(mesh(B(0.09,0.56,0.09),M.mask,0,-0.28,0));
for(let i=0;i<4;i++) foreL.add(mesh(B(0.02,0.2,0.02),M.mask,-0.045+i*0.03,-0.66,0));
const armR=new THREE.Group(); armR.position.set( 0.32,1.32,0); hips.add(armR);
const foreR=new THREE.Group(); foreR.position.y=-0.56; armR.add(foreR);
armR.add(mesh(B(0.11,0.58,0.11),M.coat,0,-0.28,0));
foreR.add(mesh(B(0.09,0.56,0.09),M.mask,0,-0.28,0));
for(let i=0;i<4;i++) foreR.add(mesh(B(0.02,0.2,0.02),M.mask,-0.045+i*0.03,-0.66,0));
const legL=new THREE.Group(); legL.position.set(-0.13,0,0); hips.add(legL);
legL.add(mesh(B(0.13,0.98,0.13),M.coat,0,-0.49,0));
legL.add(mesh(B(0.15,0.08,0.26),M.dark,0,-0.96,0.06));
const legR=new THREE.Group(); legR.position.set( 0.13,0,0); hips.add(legR);
legR.add(mesh(B(0.13,0.98,0.13),M.coat,0,-0.49,0));
legR.add(mesh(B(0.15,0.08,0.26),M.dark,0,-0.96,0.06));
entity.position.set(0,0,-13); entity.visible=false; scene.add(entity);
const entityEyes=new THREE.PointLight(0xff5a34,0,4.2,2);
entityEyes.position.set(0,2.7,0.25); entity.add(entityEyes);

let entTwitch=0;
function animateEntity(t, walking){
  const s = walking ? Math.sin(t*4.0) : Math.sin(t*1.05)*0.12;
  legL.rotation.x =  s*0.62;
  legR.rotation.x = -s*0.62;
  armL.rotation.x = -s*0.42 - 0.1;
  armR.rotation.x =  s*0.42 - 0.1;
  foreL.rotation.x = -0.5+Math.sin(t*2.1)*0.18;    // long arms hang broken
  foreR.rotation.x = -0.5-Math.sin(t*2.1)*0.18;
  hips.position.y  = 0.98 + (walking?Math.abs(Math.sin(t*4.0))*0.035:Math.sin(t*1.3)*0.012);
  torso.rotation.z = Math.sin(t*1.8)*0.025;
  chest.rotation.x = 0.08 + Math.sin(t*1.4)*0.02;  // hunched, breathing
  /* every few seconds the head snaps to a new angle and holds it */
  entTwitch-=1/60;
  if(entTwitch<=0){ entTwitch=1.2+Math.random()*2.6; head.userData.tilt=(Math.random()-0.5)*0.85; }
  head.rotation.z += ((head.userData.tilt||0)-head.rotation.z)*0.12;
  head.rotation.x = Math.sin(t*0.8)*0.06;
}

/* =========================================================
   8. PROCEDURAL AUDIO (WebAudio, no asset files)
========================================================= */
const A = { ctx:null, on:true, master:null, droneGain:null, humGain:null,
            windGain:null, heartGain:null, noiseBuf:null, started:false };
function makeNoiseBuffer(ctx){
  const len=ctx.sampleRate*3, buf=ctx.createBuffer(1,len,ctx.sampleRate), d=buf.getChannelData(0);
  let last=0;
  for(let i=0;i<len;i++){ const w=Math.random()*2-1; last=(last+0.02*w)/1.02; d[i]=last*3.2; }
  return buf;
}
function audioInit(){
  if(A.started) return;
  const Ctx=window.AudioContext||window.webkitAudioContext;
  if(!Ctx) return;
  A.ctx=new Ctx(); A.started=true;
  A.noiseBuf=makeNoiseBuffer(A.ctx);

  A.master=A.ctx.createGain(); A.master.gain.value=A.on?0.9:0; A.master.connect(A.ctx.destination);

  /* low room drone: detuned saws through a lowpass */
  A.droneGain=A.ctx.createGain(); A.droneGain.gain.value=0.12;
  const lp=A.ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=220; lp.Q.value=3;
  A.droneGain.connect(lp); lp.connect(A.master);
  [55,55.6,82.5].forEach((f,i)=>{
    const o=A.ctx.createOscillator(); o.type=i===2?'triangle':'sawtooth'; o.frequency.value=f;
    const g=A.ctx.createGain(); g.gain.value=i===2?0.25:0.5;
    o.connect(g); g.connect(A.droneGain); o.start();
  });
  /* fridge hum */
  A.humGain=A.ctx.createGain(); A.humGain.gain.value=0.05; A.humGain.connect(A.master);
  [60,120,180].forEach((f,i)=>{
    const o=A.ctx.createOscillator(); o.type='sine'; o.frequency.value=f;
    const g=A.ctx.createGain(); g.gain.value=0.6/(i+1);
    o.connect(g); g.connect(A.humGain); o.start();
  });
  /* wind through the window */
  const wind=A.ctx.createBufferSource(); wind.buffer=A.noiseBuf; wind.loop=true;
  const wf=A.ctx.createBiquadFilter(); wf.type='bandpass'; wf.frequency.value=420; wf.Q.value=0.7;
  A.windGain=A.ctx.createGain(); A.windGain.gain.value=0.06;
  wind.connect(wf); wf.connect(A.windGain); A.windGain.connect(A.master); wind.start();
  const lfo=A.ctx.createOscillator(); lfo.frequency.value=0.07;
  const lg=A.ctx.createGain(); lg.gain.value=0.04;
  lfo.connect(lg); lg.connect(A.windGain.gain); lfo.start();

  A.heartGain=A.ctx.createGain(); A.heartGain.gain.value=0; A.heartGain.connect(A.master);
  $('audioHint').textContent='ambient sound: on';
}
function sfxTone(freq,dur,type='sine',vol=0.25,glide){
  if(!A.ctx||!A.on) return;
  const o=A.ctx.createOscillator(), g=A.ctx.createGain();
  o.type=type; o.frequency.value=freq;
  if(glide) o.frequency.exponentialRampToValueAtTime(glide,A.ctx.currentTime+dur);
  g.gain.value=0.0001; g.gain.linearRampToValueAtTime(vol,A.ctx.currentTime+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001,A.ctx.currentTime+dur);
  o.connect(g); g.connect(A.master); o.start(); o.stop(A.ctx.currentTime+dur+0.05);
}
function sfxNoise(dur,freq,vol=0.5,type='bandpass'){
  if(!A.ctx||!A.on) return;
  const s=A.ctx.createBufferSource(); s.buffer=A.noiseBuf;
  const f=A.ctx.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=1.2;
  const g=A.ctx.createGain(); g.gain.value=vol;
  g.gain.exponentialRampToValueAtTime(0.0001,A.ctx.currentTime+dur);
  s.connect(f); f.connect(g); g.connect(A.master); s.start(); s.stop(A.ctx.currentTime+dur+0.05);
}
const SFX={
  click:()=>sfxTone(880,0.05,'square',0.08),
  flip:()=>{ sfxTone(1400,0.04,'square',0.12); sfxNoise(0.06,2600,0.25,'highpass'); },
  knock:()=>{ for(let i=0;i<3;i++) setTimeout(()=>sfxNoise(0.22,180,0.85,'lowpass'),i*520); },
  ring:()=>{ for(let i=0;i<8;i++) setTimeout(()=>{ sfxTone(1050,0.35,'sine',0.16);
              sfxTone(1290,0.35,'sine',0.14); },i*900); },
  whisper:()=>sfxNoise(1.6,900,0.32,'bandpass'),
  doorOpen:()=>sfxNoise(0.7,300,0.4,'lowpass'),
  creak:()=>sfxTone(320,0.9,'sawtooth',0.05,120),
  hit:()=>{ sfxNoise(0.5,120,0.9,'lowpass'); sfxTone(70,0.8,'sine',0.4,40); },
  win:()=>{ [392,523,659].forEach((f,i)=>setTimeout(()=>sfxTone(f,0.7,'triangle',0.18),i*220)); }
};
function setSound(on){
  A.on=on; $('soundState').textContent=on?'ON':'OFF';
  if(A.master) A.master.gain.value=on?0.9:0;
}

/* =========================================================
   9. GAME STATE + MAIN MENU
========================================================= */
const S={ mode:'menu', overlay:null, flashOn:false, battery:100, nerve:100, minutes:0,
  hallLightOn:false, tvOn:false, hiding:false, fridgeOpen:false, fridgeHourUsed:-1,
  readRules:false, calling:false, knocking:false, nextEvent:16, knockShake:0,
  /* ---- scripted night ---- */
  stage:'intro',      // intro > getfood > heat > heating > collect > couch > eating > sleep > night > dawn > credits
  carrying:false, sitting:false, eatT:0, sleepT:0,
  round:0, ROUNDS:4, roundWait:6, hideWindow:0, hiddenFor:0, safe:false,
  /* ---- clock ----  minutes counted from 11:00 PM, 6:00 AM = 420 ---- */
  timeCap:4,          // clock freezes when it reaches this, null = free running
  power:true,
  usedLight:false, knockDoor:null, knockN:0, knockAt:0, dawnHide:0, dev:false,
  frontOpen:false, heatT:0,
  practice:false };
const MIN_PER_SEC=2/30;      // 30 real seconds = 2 minutes on the clock
const DAWN=420;              // 6:00 AM
const CURFEW_SHUT=300;       // 4:00 AM - after this the front door stays shut
const WAKE=360;              // 5:00 AM

/* 11:00 PM + n minutes -> "11:04 PM" */
function clockText(mins){
  const tot=(23*60+Math.floor(mins))%1440;
  const h24=Math.floor(tot/60), m=tot%60;
  const h=(h24%12===0)?12:h24%12;
  return h+':'+String(m).padStart(2,'0')+' '+(h24<12?'AM':'PM');
}
function gameHour(){ return Math.floor((23*60+S.minutes)/60)%24; }

function say(t,ms=3400){ $('subs').textContent=t; $('subs').style.opacity=1;
  clearTimeout(say._t); say._t=setTimeout(()=>$('subs').style.opacity=0,ms); }
function objective(t){ $('objText').textContent=t; }
function vFlash(){ $('vflash').style.opacity=.8; setTimeout(()=>$('vflash').style.opacity=0,120); }

const controls=new PointerLockControls(camera,renderer.domElement);
camera.rotation.order='YXZ';

/* on phones there is no pointer lock: we enter play mode directly */
function enterPlay(){
  if(IS_TOUCH){
    S.mode='play'; document.body.classList.add('playing'); $('menu').style.display='none';
  } else controls.lock();
}
function backToMenu(){
  if(S.mode==='dead'||S.mode==='won') return;
  S.mode='menu'; document.body.classList.remove('playing'); $('menu').style.display='flex';
  if(!IS_TOUCH) controls.unlock();
}
controls.addEventListener('lock',()=>{ S.mode='play'; document.body.classList.add('playing');
  $('menu').style.display='none'; });
controls.addEventListener('unlock',()=>{
  if(S.mode==='dead'||S.mode==='won') return;
  if(S.overlay) return;
  backToMenu();
});

/* ---------- touch controls: stick, drag-look, buttons ---------- */
const TOUCH={ mx:0, my:0, run:false, lookId:null, stickId:null, lastX:0, lastY:0 };
function bindTouch(){
  const stick=$('stick'), nub=$('nub'), look=$('look');
  const rectOf=el=>el.getBoundingClientRect();
  stick.addEventListener('pointerdown',e=>{ TOUCH.stickId=e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); });
  stick.addEventListener('pointermove',e=>{ if(e.pointerId===TOUCH.stickId) moveStick(e); });
  const endStick=e=>{ if(e.pointerId===TOUCH.stickId){ TOUCH.stickId=null; TOUCH.mx=TOUCH.my=0;
    nub.style.left='50%'; nub.style.top='50%'; } };
  stick.addEventListener('pointerup',endStick);
  stick.addEventListener('pointercancel',endStick);
  function moveStick(e){
    const r=rectOf(stick), cx=r.left+r.width/2, cy=r.top+r.height/2, max=r.width/2;
    let dx=(e.clientX-cx)/max, dy=(e.clientY-cy)/max;
    const len=Math.hypot(dx,dy); if(len>1){ dx/=len; dy/=len; }
    TOUCH.mx=dx; TOUCH.my=dy;
    nub.style.left=(50+dx*32)+'%'; nub.style.top=(50+dy*32)+'%';
  }
  look.addEventListener('pointerdown',e=>{ TOUCH.lookId=e.pointerId;
    TOUCH.lastX=e.clientX; TOUCH.lastY=e.clientY; look.setPointerCapture(e.pointerId); });
  look.addEventListener('pointermove',e=>{
    if(e.pointerId!==TOUCH.lookId) return;
    const dx=e.clientX-TOUCH.lastX, dy=e.clientY-TOUCH.lastY;
    TOUCH.lastX=e.clientX; TOUCH.lastY=e.clientY;
    turnCamera(dx*0.0045, dy*0.0045);
  });
  const endLook=e=>{ if(e.pointerId===TOUCH.lookId) TOUCH.lookId=null; };
  look.addEventListener('pointerup',endLook);
  look.addEventListener('pointercancel',endLook);

  const press=(id,fn)=>{ const el=$(id);
    el.addEventListener('pointerdown',ev=>{ ev.preventDefault(); ev.stopPropagation(); fn(true); });
    el.addEventListener('pointerup',ev=>{ ev.preventDefault(); fn(false); });
    el.addEventListener('contextmenu',ev=>ev.preventDefault());
  };
  press('bUse',   d=>{ if(d && !S.overlay) interact(); });
  press('bLight', d=>{ if(d && !S.overlay) toggleFlashlight(); });
  press('bRun',   d=>{ TOUCH.run=d; });
  press('bPause', d=>{ if(d) backToMenu(); });
}
function turnCamera(dx,dy){
  camera.rotation.y -= dx;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy, -Math.PI/2.2, Math.PI/2.2);
  camera.rotation.z = 0;
}
if(IS_TOUCH) bindTouch();

/* menu buttons */
addEventListener('pointerdown',()=>audioInit(),{once:true});
$('btnStart').onclick=()=>{ SFX.click(); audioInit(); startNight(false); };
$('btnPractice').onclick=()=>{ SFX.click(); audioInit(); startNight(true); };
$('btnStory').onclick=()=>{ SFX.click(); showPanel('pStory'); };
$('btnRules').onclick=()=>{ SFX.click(); showPanel('pRules'); };
$('btnHow').onclick  =()=>{ SFX.click(); showPanel('pHow'); };
$('btnRetro').onclick=()=>{ SFX.click(); retro=!retro;
  document.body.classList.toggle('retro',retro);
  $('retroState').textContent=retro?'ON':'OFF'; resize(); };
$('btnSound').onclick=()=>{ audioInit(); setSound(!A.on); SFX.click(); };
document.querySelectorAll('[data-close]').forEach(el=>{
  el.onclick=()=>{ SFX.click(); hidePanel(); };
});
function showPanel(id){ S.overlay=id; $(id).style.display='block'; $('prompt').style.display='none'; }
function hidePanel(){
  if(!S.overlay) return;
  $(S.overlay).style.display='none'; S.overlay=null;
  if(S.mode==='play'&&!IS_TOUCH) controls.lock();
}
function startNight(practice){
  S.practice=!!practice;
  S.power=true; powerBack();
  S.minutes=0; S.timeCap=S.practice?0:4;      // 11:00 PM, stops at 11:04
  S.usedLight=false; S.knockDoor=null; S.knockN=0; S.dawnHide=0;
  S.dev=false; devRoom.visible=false;
  S.frontOpen=false; S.heatT=0; S.carrying=false;
  doorPivot.rotation.y=0;
  mwGlass.material.emissiveIntensity=0; mwLight.intensity=0;
  hidePanel(); enterPlay();
  objective(S.practice?'PRACTICE - explore. Nothing comes tonight.'
                      :'Read the rules on the fridge');
  if(S.practice){
    say('Practice mode. The clock is frozen at 11:00 and the hallway is empty.',5200);
  } else {
    say(IS_TOUCH?'Drag the right side to look, use the stick to walk.'
               :'11:00 PM. Mom just locked the door. Seven hours to go.',4600);
  }
}

/* =========================================================
   10. INTERACTION (raycaster, 3 units)
========================================================= */
const ray=new THREE.Raycaster(); ray.far=3;
const CENTER=new THREE.Vector2(0,0);
let focus=null;
function labelFor(o){
  switch(o.userData.action){
    case 'switch': return 'Press [E] to Turn the Hallway Light '+(S.hallLightOn?'Off':'On');
    case 'tv':     return 'Press [E] to Turn the TV '+(S.tvOn?'Off':'On');
    case 'closet': return S.hiding?'Press [E] to Come Out':'Press [E] to Hide in the Cupboard';
    case 'phone':  return S.calling?'Press [E] to Answer the Phone':'Press [E] to Check the Phone';
    case 'couch':  return S.carrying?'Press [E] to Sit Down and Eat':'Press [E] to Sit Down';
    case 'door':   return S.stage==='dawn'?'Press [E] to Let Mom In'
                     :(S.frontOpen?'Press [E] to Shut the Front Door':'Press [E] to Open the Front Door');
    default:       return o.userData.label;
  }
}
function visOK(o){ let n=o; while(n){ if(!n.visible) return false; n=n.parent; } return true; }
function updateFocus(){
  if(S.mode!=='play'||S.overlay){ $('prompt').style.display='none'; focus=null; return; }
  if(S.hiding){
    focus=null;
    $('prompt').textContent = IS_TOUCH?'Tap USE to Come Out':'Press [E] to Come Out';
    $('prompt').style.display='block';
    return;
  }
  if(S.sitting){ focus=null; $('prompt').style.display='none'; return; }
  ray.setFromCamera(CENTER,camera);
  const hits=ray.intersectObjects(interactables,false);
  focus=null;
  for(const h of hits){ if(h.distance>3) break; if(visOK(h.object)){ focus=h.object; break; } }
  if(focus){
    let txt=labelFor(focus);
    if(IS_TOUCH) txt=txt.replace('Press [E] to','Tap USE to');
    $('prompt').textContent=txt; $('prompt').style.display='block';
  }
  else $('prompt').style.display='none';
}
function openRead(title,note,listHTML,foot){
  $('rTitle').textContent=title; $('rNote').textContent=note;
  $('rList').innerHTML=listHTML; $('rFoot').textContent=foot;
  showPanel('pRead'); if(!IS_TOUCH) controls.unlock();
}
const RULES_LIST=$('pRules').querySelector('ol').innerHTML;

function interact(){
  if(S.sitting){ return; }
  if(S.hiding){ leaveCloset(); return; }
  if(!focus) return;
  const hour=gameHour();
  switch(focus.userData.action){
    case 'rules':
      if(S.stage==='getfood'){ S.fridgeOpen=true; setTimeout(()=>{ S.fridgeOpen=false; },2600);
        SFX.doorOpen(); takeMeal(); break; }
      if(S.readRules && S.fridgeHourUsed===hour && S.stage!=='intro')
        nerveHit(14,'You opened the fridge twice in the same hour. Rule 4.');
      S.fridgeHourUsed=hour;
      if(!S.readRules && !S.practice){
        /* reading the letter starts the clock again - it runs 2 more minutes */
        S.timeCap=Math.max(S.minutes,4)+2;
        say('The clock on the microwave starts moving again.',3000);
      }
      S.readRules=true; S.fridgeOpen=true;
      SFX.doorOpen();
      openRead('THE MIDNIGHT RULES',"taped to the fridge door \u2014 Grandma's handwriting",
        RULES_LIST,"Leo \u2014 I love you. Just do the list. I'll be home before sunrise.");
      setTimeout(()=>{ S.fridgeOpen=false; },5000);
      if(S.stage==='intro') beginDinner();
      break;
    case 'microwave':
      if(S.stage==='heat' && S.carrying){ startHeating(); SFX.flip(); break; }
      if(S.stage==='heating'){ say('It still has '+Math.ceil(16-S.heatT)+' seconds to run.'); break; }
      if(S.stage==='collect'){
        S.carrying=true; SFX.doorOpen();
        say('You lift the plate out. It burns your thumb. You do not put it down.',4200);
        objective('Sit on the couch and eat');
        S.stage='couch';
        break;
      }
      SFX.flip();
      say(clockText(S.minutes)+' on the microwave clock. The only clock in the flat that is right.',4000);
      break;
    case 'halldoor':{
      SFX.doorOpen(); shakeHallDoor(focus);
      const now=performance.now();
      if(S.knockDoor!==focus || now-S.knockAt>6000){ S.knockDoor=focus; S.knockN=0; }
      S.knockAt=now; S.knockN++;
      if(S.knockN>=3){ secretEnding('guest'); return; }
      say(HALL_LINES[(hallLine++)%HALL_LINES.length],4200);
      break; }
    case 'devpanel':
      SFX.creak();
      if(devPeel<DEV_PEEL.length){ say(DEV_PEEL[devPeel++],4000); }
      else enterDev();
      break;
    case 'devexit': exitDev(); break;
    case 'devboard':
      openRead('BUILD LOG \u2014 NIGHT 1','scrawled on a whiteboard nobody was meant to find',
        '<li>the clock runs 2 game minutes every 30 real seconds</li>'+
        '<li>it is 2.2 m tall on purpose \u2014 do not make it taller</li>'+
        '<li>the rules are real. all of them.</li>'+
        '<li>there are four endings the player is never told about</li>'+
        '<li>night 2 exists. it is worse.</li>',
        'if you are reading this, you were not supposed to get in here. \u2014 HUZAIFAA');
      break;
    case 'vase':
      SFX.creak();
      if(S.flashOn && !S.hallLightOn){ secretEnding('shoes'); return; }
      say('Dead flowers in an inch of brown water. Somebody kept them fresh until two weeks ago.',4200);
      break;
    case 'food':
      S.carrying=true; foodBox.visible=false; S.stage='couch';
      SFX.creak();
      say('Warm. Somebody carried it up four flights. Nobody opened the door.',5200);
      objective('Sit on the couch and eat');
      break;
    case 'couch': sitDown(); break;
    case 'letter':
      SFX.creak();
      if(!S.practice && S.timeCap!==null && S.timeCap<=4) S.timeCap=Math.max(S.minutes,4)+2;
      openRead('NOTE ON THE WALL','ballpoint pen, shaky handwriting \u2014 Grandma',
        '<li>The hallway bulb is new. It turns itself on when it wants you to look.</li>'+
        '<li>The cupboard latch works from the inside. Ada never used it.</li>'+
        '<li>It always knocks three times. Three is polite. Three is practice.</li>'+
        '<li>If it copies your voice, it has been listening at the door for weeks.</li>'+
        '<li>4C, 4D, 4E, 4F are empty. Whatever answers from them is not a neighbour.</li>',
        'Do the list, Leo. Every night. I will come on Sunday. \u2014 Grandma');
      break;
    case 'switch':
      if(!S.power){ SFX.flip(); say('The switch clicks. Nothing. The power is out.'); break; }
      S.hallLightOn=!S.hallLightOn; SFX.flip();
      say(S.hallLightOn?'The hallway light hums on. Rule 1: do not look down the hallway.'
                       :'The hallway goes dark again.');
      break;
    case 'tv':
      if(!S.power){ SFX.flip(); say('Dead screen. No power.'); break; }
      S.tvOn=!S.tvOn; SFX.flip();
      say(S.tvOn?'Static fills the room. The noise makes the flat feel occupied.':'You switch the TV off.');
      break;
    case 'closet': enterCloset(); break;
    case 'phone':
      if(S.calling){ S.calling=false;
        nerveHit(16,'A voice almost exactly like Mom says: "Leo. Come open the door."'); SFX.whisper(); }
      else say('No missed calls. The line clicks like someone is already on it.');
      break;
    case 'door':
      if(S.stage==='dawn'){ momArrives(); break; }
      if(S.knocking){
        gameOver('You opened the front door while it was still knocking. Rule 2. Ada made the same mistake.');
        break;
      }
      if(S.stage==='night'){
        SFX.creak();
        say('The door will not move. Something on the hallway side is leaning on it.',4200);
        break;
      }
      if(!S.practice && S.minutes>CURFEW_SHUT && !S.frontOpen && camera.position.z>-ROOM.d/2){
        SFX.creak();
        say('Past four o\u2019clock the deadbolt will not turn. Rule 2 holds the door now.',4600);
        break;
      }
      S.frontOpen=!S.frontOpen; SFX.doorOpen();
      say(S.frontOpen?'The door swings into the hallway. Four dead doors and a light that is not on.'
                     :'You shut the door and turn the deadbolt.',4200);
      break;
  }
}
function shakeHallDoor(leaf){
  const d=hallDoors.find(h=>h.group===leaf.parent);
  if(d) d.shake=1;
}

/* =========================================================
   11b. SCRIPTED NIGHT
========================================================= */
/* --- story lines --- */
let hallLine=0;
const HALL_LINES=[
  'Locked. 4C. Ada used to leave a key under the mat. The mat is gone.',
  'Locked from the other side. All of them are locked from the other side.',
  'Something breathes out, once, right behind the wood. You do not knock back.',
  '4F has no handle at all. It never did.',
  'You hear your own knock answered half a second late, like a copy.'
];
const ROUND_LINES=[
  'Three knocks. A delivery man\u2019s voice: "Order for Vance?" You never gave a name. HIDE.',
  'Three knocks. Mom\u2019s voice, too slow: "Leo. Open up, baby." Mom is at the plant. HIDE.',
  'Three knocks. Ada\u2019s voice, from two weeks ago: "It is only me, sweetheart." HIDE.',
  'Three knocks. Your own voice, from inside the kitchen: "I am already in." HIDE.',
  'No knock this time. Just the floor taking weight, one board at a time. HIDE.'
];
const ROUND_AFTER=[
  'It gives up on being polite. Come out.',
  'It walks off down the hall counting doors. 4C. 4D. 4E.',
  'Something wet is left on the floor where it stood. Do not touch it.',
  'It laughs with your mouth, badly, and stops. Come out.',
  'Footsteps go away down the hall. Then a key. A real key.'
];
function beginDinner(){
  S.stage='getfood';
  objective('Take the leftovers out of the fridge');
  say('There is a covered plate on the middle shelf. Grandma left it for you.',4600);
}
function takeMeal(){
  S.stage='heat'; S.carrying=true;
  SFX.creak();
  say('Cold rice and chicken under cling film. You carry it to the microwave.',4600);
  objective('Heat the food in the microwave');
}
function startHeating(){
  S.stage='heating'; S.heatT=0; S.carrying=false;
  mwGlass.material.emissiveIntensity=1.6; mwLight.intensity=2.4;
  objective('Wait for the microwave');
  say('The plate turns. The kitchen smells like a normal night for a second.',4600);
  /* the scare while your hands are busy */
  setTimeout(()=>{ if(S.stage!=='heating') return;
    S.knocking=true; S.knockShake=1; SFX.knock();
    say('Three knocks at the front door. Polite. Evenly spaced. Rule 2.',5000); },6000);
  setTimeout(()=>{ if(S.stage!=='heating') return;
    say('A man\u2019s voice through the wood: "Order for Vance?" You never gave a name.',5000); },11000);
  setTimeout(()=>{ S.knocking=false; },15500);
}
function mwDone(){
  mwGlass.material.emissiveIntensity=0; mwLight.intensity=0;
  S.stage='collect'; SFX.click(); SFX.click();
  say('The microwave beeps three times and stops. Everything else stops with it.',4600);
  objective('Take the plate out of the microwave');
}
function sitDown(){
  if(!S.carrying){ say('Eat first. The plate is still in the kitchen.'); return; }
  S.sitting=true; S.stage='eating'; S.eatT=0;
  S.timeCap=null;                      // eating on the couch lets the night run
  camera.position.set(2.6,1.28,3.05);
  objective('Eat');
  say('You sit down with the hot plate on your knees and eat in the dark.',4200);
  const lines=[
    ['It is still warm. That is the part you do not like.',4000],
    ['Grandma\u2019s note says three knocks is practice. That was three knocks.',9000],
    ['The hallway is quiet. Every door out there has been locked for years.',15000],
    ['Your eyes are open. You are almost sure your eyes are open.',19000]
  ];
  lines.forEach(l=>setTimeout(()=>{ if(S.stage==='eating') say(l[0],4000); },l[1]));
  setTimeout(()=>{ if(S.stage==='eating') fallAsleep(); },24000);
}
function fallAsleep(){
  S.stage='sleep'; S.carrying=false;
  $('fade').style.opacity=1;
  say('');
  setTimeout(()=>{
    /* wake at 5:00 AM in the dark */
    S.minutes=S.practice?0:WAKE; S.sitting=false;
    S.battery=100; S.flashOn=false; $('fl').textContent='OFF';
    camera.position.set(2.6,1.55,2.3);
    powerCut();
    S.frontOpen=true;                       // you did not open it
    S.stage=S.practice?'dawn':'night'; S.round=0; S.roundWait=6; S.hideWindow=0; S.hiddenFor=0; S.safe=false;
    $('fade').style.opacity=0;
    if(S.practice){
      objective('PRACTICE - the power is out. Open the front door when you want to finish.');
      say('Practice mode: the lights went out and nothing came with them.',5200);
      SFX.creak();
      return;
    }
    objective('5:00 AM - flashlight on. Get in the cupboard on every knock. '+S.ROUNDS+' to go.');
    say('5:00 AM. The power is gone and the front door is standing wide open.',5200);
    SFX.creak();
  },3400);
}
function powerCut(){
  S.power=false;
  S.hallLightOn=false; S.tvOn=false;
  ambient.intensity=0.12; hemi.intensity=0.14;
  bulb.intensity=0; counterLight.intensity=0; hallGlow.intensity=0.25;
  moon.intensity=0.22; glassBulb.material.emissiveIntensity=0;
  scene.fog.density=0.075;
  M.screen.emissiveIntensity=0; tvLight.intensity=0;
  if(A.humGain) A.humGain.gain.value=0;
}
function powerBack(){
  S.power=true;
  ambient.intensity=0.85; hemi.intensity=0.8;
  bulb.intensity=14; counterLight.intensity=6; hallGlow.intensity=2.2;
  moon.intensity=1.1; glassBulb.material.emissiveIntensity=2.4;
  scene.fog.density=0.03;
}
function momArrives(){
  if(S.mode!=='play') return;
  if(!S.usedLight && !S.practice){ secretEnding('dark'); return; }
  S.stage='credits'; S.mode='won';
  S.hiding=false; document.body.classList.remove('hiding');
  powerBack(); SFX.doorOpen(); SFX.win();
  entity.visible=false; entityEyes.intensity=0;
  document.body.classList.remove('playing');
  $('prompt').style.display='none'; $('timer').style.display='none';
  if(!IS_TOUCH) controls.unlock();
  $('menu').style.display='none';
  setTimeout(()=>{ $('credits').style.display='block'; },900);
}

/* one hide round: knock, 5 s to get in, 6 s to stay in */
function updateScript(dt){
  if(S.mode!=='play'||S.overlay||S.practice||S.dev) return;

  if(S.stage==='dawn' && S.hiding){
    S.dawnHide+=dt;
    if(S.dawnHide>=60) secretEnding('waited');
    return;
  }

  if(S.stage==='night'){
    if(S.hideWindow<=0 && !S.safe){
      S.roundWait-=dt;
      if(S.roundWait<=0){
        S.round++;
        S.hideWindow=6; S.hiddenFor=0;
        SFX.knock(); SFX.whisper();
        say(ROUND_LINES[Math.min(S.round,ROUND_LINES.length)-1]+' ('+S.round+' of '+S.ROUNDS+')',4800);
      }
    } else if(S.hideWindow>0){
      S.hideWindow-=dt;
      $('timer').style.display='block';
      $('timer').innerHTML=Math.ceil(Math.max(0,S.hideWindow))+'<small>GET IN THE CUPBOARD</small>';
      if(S.hiding){ S.hideWindow=0; S.safe=true; S.hiddenFor=0; $('timer').style.display='none'; }
      else if(S.hideWindow<=0){
        gameOver('You were still standing in the open when it came in. Rule 3.');
      }
    } else if(S.safe){
      if(!S.hiding){
        gameOver('You came out too early. It was still in the room.');
        return;
      }
      S.hiddenFor+=dt;
      $('timer').style.display='block';
      $('timer').innerHTML=Math.ceil(Math.max(0,6-S.hiddenFor))+'<small>STAY HIDDEN</small>';
      if(S.hiddenFor>=6){
        S.safe=false; S.hiddenFor=0; $('timer').style.display='none';
        SFX.creak();
        S.minutes=Math.min(DAWN-6,WAKE+S.round*11);
        if(S.round>=S.ROUNDS){
          S.stage='dawn'; S.minutes=DAWN;
          powerBack(); S.frontOpen=false; S.hallLightOn=false; SFX.flip();
          objective('6:00 AM - let Mom in');
          say('Every light in the flat comes back on at once. The front door is shut again.',5200);
          setTimeout(()=>{ if(S.stage==='dawn'){ S.knockShake=1; SFX.knock();
            say('Mom knocks. "Leo? It is six, baby. Open up." She uses her key first.',6000); } },2600);
        } else {
          S.roundWait=6;
          objective((S.ROUNDS-S.round)+' more to go. Stay near the cupboard.');
          say(ROUND_AFTER[Math.min(S.round,ROUND_AFTER.length)-1],4200);
        }
      }
    }
  }
}

/* ---- hiding: camera is placed INSIDE the cupboard using its own matrix,
       the doors close behind you, and a dark interior overlay is shown ---- */
const HIDE_IN  = new THREE.Vector3(0, 1.30, 0.02);   // local to the closet group
const HIDE_OUT = new THREE.Vector3(0, 1.55, 1.25);
function enterCloset(){
  if(S.hiding) return;
  const p=HIDE_IN.clone(); closet.localToWorld(p);
  camera.position.copy(p);
  S.hiding=true; document.body.classList.add('hiding');
  $('state').textContent='hiding';
  SFX.doorOpen();
  say('You climb into the cupboard and pull the doors shut.');
  if(S.calling){ S.calling=false; setTimeout(()=>say('The calling stops. Something walks past the doors.',4200),1600); }
}
function leaveCloset(){
  if(!S.hiding) return;
  const p=HIDE_OUT.clone(); closet.localToWorld(p);
  p.y=1.55;
  camera.position.copy(p);
  S.hiding=false; document.body.classList.remove('hiding');
  $('state').textContent='kitchen'; SFX.doorOpen();
}

/* =========================================================
   11. KEYS
========================================================= */
const keys=Object.create(null);
addEventListener('keydown',e=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  keys[e.code]=true;
  if(e.code==='KeyR'&&(S.mode==='dead'||S.mode==='won')){ location.reload(); return; }
  if(S.mode==='dead'||S.mode==='won') return;
  if(S.overlay&&(e.code==='KeyE'||e.code==='Escape')){ hidePanel(); return; }
  if(S.mode!=='play') return;
  if(e.code==='KeyF') toggleFlashlight();
  if(e.code==='KeyE') interact();
});
addEventListener('keyup',e=>{ keys[e.code]=false; });
function toggleFlashlight(){
  if(S.battery<=0){ say('The batteries are dead.'); return; }
  S.flashOn=!S.flashOn; if(S.flashOn) S.usedLight=true;
  $('fl').textContent=S.flashOn?'ON':'OFF'; SFX.flip();
}
/* =========================================================
   12. MOVEMENT + CAMERA ANIMATION
========================================================= */
const WALK=2.7, RUN=4.4, RAD=0.36;
const fwd=new THREE.Vector3(), rightV=new THREE.Vector3(), UP=new THREE.Vector3(0,1,0);
let bob=0, breathe=0, swayX=0, swayY=0;

/* furniture collision: reject a candidate spot only if we are not already stuck in it */
function solid(x,z){
  for(const b of BLOCKERS)
    if(Math.abs(x-b.x)<b.hw+RAD && Math.abs(z-b.z)<b.hd+RAD) return true;
  return false;
}
function move(dt){
  if(S.mode!=='play'||S.overlay||S.hiding||S.sitting){ return; }
  let f=0,s=0;
  if(keys['KeyW']||keys['ArrowUp'])    f+=1;
  if(keys['KeyS']||keys['ArrowDown'])  f-=1;
  if(keys['KeyD']||keys['ArrowRight']) s+=1;
  if(keys['KeyA']||keys['ArrowLeft'])  s-=1;
  if(IS_TOUCH){                                  // virtual stick
    if(Math.abs(TOUCH.my)>0.12) f += -TOUCH.my;
    if(Math.abs(TOUCH.mx)>0.12) s +=  TOUCH.mx;
  }
  const running=((keys['ShiftLeft']||keys['ShiftRight'])||TOUCH.run)&&(f||s);
  const p=camera.position;
  breathe+=dt;

  if(f||s){
    const startX=p.x, startZ=p.z;
    camera.getWorldDirection(fwd); fwd.y=0; fwd.normalize();
    rightV.copy(fwd).cross(UP).normalize();
    const spd=(running?RUN:WALK)*Math.min(1,Math.hypot(f,s));
    const nx=p.x+(fwd.x*f+rightV.x*s)*spd*dt;
    const nz=p.z+(fwd.z*f+rightV.z*s)*spd*dt;

    /* two zones: the kitchen box and the hallway corridor.
       The north wall can only be crossed through the doorway gap (|x| < 1.4). */
    const HALL_HALF = 1.4, HALL_END = -18.6, THRESH = -ROOM.d/2;
    const inHallNow = p.z < THRESH;
    if(S.dev){
      p.x = THREE.MathUtils.clamp(nx, DEV.x-DEV.hw+RAD, DEV.x+DEV.hw-RAD);
      p.z = THREE.MathUtils.clamp(nz, DEV.z-DEV.hd+RAD, DEV.z+DEV.hd-RAD);
    } else {
      /* the hallway is outside the flat: you can only cross the open front door */
      const gapOK = S.frontOpen && nx>DOOR_GAP[0]+RAD && nx<DOOR_GAP[1]-RAD;
      if(inHallNow){
        p.x = THREE.MathUtils.clamp(nx, -HALL_HALF+RAD, HALL_HALF-RAD);
        p.z = THREE.MathUtils.clamp(nz, HALL_END+RAD, gapOK ? ROOM.d/2-RAD : THRESH-RAD);
      } else {
        p.x = THREE.MathUtils.clamp(nx, -ROOM.w/2+RAD, ROOM.w/2-RAD);
        p.z = THREE.MathUtils.clamp(nz, gapOK ? HALL_END+RAD : THRESH+RAD, ROOM.d/2-RAD);
      }
    }

    /* slide along furniture instead of walking through it */
    if(!S.dev && !solid(startX,startZ)){
      const wantX=p.x, wantZ=p.z;
      if(solid(wantX,startZ)) p.x=startX;
      if(solid(p.x,wantZ))    p.z=startZ;
      if(solid(p.x,p.z)){ p.x=startX; p.z=startZ; }
    }

    const prevStep=Math.floor(bob/Math.PI);
    bob+=dt*(running?13:9);
    if(Math.floor(bob/Math.PI)!==prevStep) sfxNoise(0.09,900,0.1,'bandpass');   // one tap per step
  }
  $('state').textContent = p.z<-ROOM.d/2 ? 'hallway' : 'kitchen';
  p.y = 1.55 + Math.sin(bob)*0.035 + Math.sin(breathe*1.7)*0.012 + S.knockShake*Math.random()*0.02;
}

/* flashlight sways behind the look direction (inertia) */
function animateFlashlight(dt){
  const targetX = (keys['KeyA']?0.05:0)+(keys['KeyD']?-0.05:0);
  swayX += ((Math.sin(bob*0.5)*0.03+targetX)-swayX)*dt*4;
  swayY += ((Math.sin(bob)*0.02)-swayY)*dt*4;
  flashlight.target.position.set(swayX,swayY-0.02,-1);
  flashlight.intensity = S.flashOn ? (S.battery<20 ? 45+Math.random()*35 : 90) : 0;
}

/* =========================================================
   13. NERVE / ENDINGS
========================================================= */
function nerveHit(a,msg){ if(S.practice||S.dev){ if(msg) say(msg,4600); return; }
  S.nerve=Math.max(0,S.nerve-a); if(msg) say(msg,4600);
  vFlash(); SFX.hit(); if(S.nerve<=0) gameOver('Your nerve broke. It heard you panicking.'); }
function gameOver(why){
  if(S.practice){ say('PRACTICE: '+why+' (nothing happens here)',5000); return; }
  if(S.mode==='dead'||S.mode==='won') return;
  S.mode='dead';
  S.hiding=false; S.sitting=false;
  document.body.classList.remove('hiding');
  /* jumpscare: it is suddenly in your face, whatever you were looking at */
  entity.visible=true; entityEyes.intensity=7;
  camera.getWorldDirection(lookDir);
  entity.position.set(camera.position.x+lookDir.x*1.15, 0, camera.position.z+lookDir.z*1.15);
  entity.lookAt(camera.position.x,2.4,camera.position.z);
  head.userData.tilt=0.5; head.rotation.z=0.5;
  camera.lookAt(entity.position.x, 2.35, entity.position.z);
  vFlash(); SFX.hit(); SFX.whisper();
  $('vblood').style.opacity=1;
  $('overWhy').textContent=why;
  $('over').style.display='flex';
  $('prompt').style.display='none';
  $('timer').style.display='none';
  $('fade').style.opacity=0;
  document.body.classList.remove('playing');
  if(!IS_TOUCH) controls.unlock();
  $('menu').style.display='none';
}
/* =========================================================
   13a. HIDDEN DEVELOPER ROOM  (not referenced anywhere in-game)
========================================================= */
const DEV={x:40,z:-40,hw:4,hd:4};
const devRoom=new THREE.Group(); devRoom.position.set(DEV.x,0,DEV.z); scene.add(devRoom);
const devGridTex=canvasTex(128,128,(c,w,h)=>{
  c.fillStyle='#14161c'; c.fillRect(0,0,w,h);
  c.strokeStyle='#2b6ea8'; c.lineWidth=2;
  for(let i=0;i<=w;i+=16){ c.beginPath();c.moveTo(i,0);c.lineTo(i,h);c.stroke();
                           c.beginPath();c.moveTo(0,i);c.lineTo(w,i);c.stroke(); }
  noiseOverlay(c,w,h,.18,1);
},6,6);
const devWallTex=canvasTex(128,128,(c,w,h)=>{
  c.fillStyle='#1b1f27'; c.fillRect(0,0,w,h);
  c.strokeStyle='#39445a'; c.lineWidth=1;
  for(let i=0;i<=w;i+=16){ c.beginPath();c.moveTo(i,0);c.lineTo(i,h);c.stroke();
                           c.beginPath();c.moveTo(0,i);c.lineTo(w,i);c.stroke(); }
},3,2);
const devPanelTex=t=>canvasTex(256,192,(c,w,h)=>{
  c.fillStyle='#0f1218'; c.fillRect(0,0,w,h);
  c.strokeStyle='#4de0c0'; c.lineWidth=3; c.strokeRect(6,6,w-12,h-12);
  c.fillStyle='#4de0c0'; c.font='bold 15px monospace';
  t.forEach((l,i)=>c.fillText(l,16,34+i*20));
  noiseOverlay(c,w,h,.12,1);
});
const devMat=o=>std(Object.assign({roughness:.85},o));
const dBox=(w,h,d,m,x,y,z,ry=0)=>{ const o=new THREE.Mesh(B(w,h,d),m);
  o.position.set(x,y,z); o.rotation.y=ry; devRoom.add(o); return o; };
dBox(DEV.hw*2,0.2,DEV.hd*2,devMat({map:devGridTex}),0,-0.1,0);
dBox(DEV.hw*2,0.2,DEV.hd*2,devMat({color:0x101319}),0,3,0);
dBox(0.2,3,DEV.hd*2,devMat({map:devWallTex}),-DEV.hw,1.5,0);
dBox(0.2,3,DEV.hd*2,devMat({map:devWallTex}), DEV.hw,1.5,0);
dBox(DEV.hw*2,3,0.2,devMat({map:devWallTex}),0,1.5,-DEV.hd);
dBox(DEV.hw*2,3,0.2,devMat({map:devWallTex}),0,1.5, DEV.hd);
const devLamp=new THREE.PointLight(0x9fe8ff,9,16,2); devLamp.position.set(0,2.7,0); devRoom.add(devLamp);
const devLamp2=new THREE.PointLight(0xff7fd0,4,12,2); devLamp2.position.set(-2.6,2.2,-2.6); devRoom.add(devLamp2);

/* whiteboard + posters */
const devBoard=dBox(0.06,1.5,3.4,devMat({map:devPanelTex([
  'BUILD LOG // MIDNIGHT CURFEW','','clock  2 game min / 30 s   [ok]',
  'monster height 2.2m       [ok]','power cut bug             [fixed]',
  'furniture collision       [ok]','4 secret endings          [in]',
  'night 2                   [todo]'])}),-DEV.hw+0.16,1.7,-1.2);
tag(devBoard,'devboard','Press [E] to Read the Build Log');
dBox(0.06,1.2,1.8,devMat({map:devPanelTex([
  'DEBUG NOTES','','"do not let the player','  see this room"','','— H.'])}),-DEV.hw+0.16,1.8,2.1);
dBox(1.6,1.0,0.06,devMat({map:devPanelTex([
  'MADE BY HUZAIFAA','','thanks for looking','behind the wallpaper.'])}),1.6,1.9,-DEV.hd+0.16);

/* desk + monitor running static, chair, mug, crates */
dBox(2.4,0.08,1.0,devMat({map:texWood}),0,0.76,-DEV.hd+0.7);
for(const x of [-1.1,1.1]) dBox(0.08,0.76,0.08,devMat({color:0x2a2e36}),x,0.38,-DEV.hd+0.7);
dBox(1.1,0.7,0.06,std({map:texTV,emissive:0x223344,emissiveMap:texTV,emissiveIntensity:1}),-0.5,1.15,-DEV.hd+0.5);
dBox(1.0,0.06,0.36,devMat({color:0x1d2029}),-0.5,0.81,-DEV.hd+1.0);
dBox(0.5,0.9,0.5,devMat({color:0x23262e}),0,0.45,-DEV.hd+1.9);
dBox(0.1,0.12,0.1,devMat({color:0xd8d2c0}),0.7,0.86,-DEV.hd+0.6);
for(const c of [[-3.2,2.6,0],[-3.0,1.6,0.4],[3.1,2.4,0]])
  dBox(0.8,0.8,0.8,devMat({map:texWood}),c[0],0.4+(c[2]||0),c[1]);
dBox(0.7,0.7,0.7,std({color:0xff00ff,roughness:1}),3.0,0.35,-1.4,0.4);   // missing-texture cube

/* the monster, switched off, standing in the corner */
const devDummy=entity.clone();
devDummy.position.set(3.0,0,2.6); devDummy.rotation.y=-2.2; devDummy.visible=true;
devDummy.traverse(o=>{ if(o.isLight) o.intensity=0; });
devRoom.add(devDummy);
dBox(1.6,0.1,1.6,devMat({color:0x2f3440}),3.0,0.05,2.6);

/* way out */
const devExit=dBox(1.2,2.2,0.1,devMat({color:0x3b4756}),-2.4,1.1,DEV.hd-0.16);
tag(devExit,'devexit','Press [E] to Go Back');
dBox(0.5,0.2,0.04,devMat({map:devPanelTex(['EXIT'])}),-2.4,2.4,DEV.hd-0.2);
devRoom.visible=false;

/* the wall panel in the hallway that gets you in (looks like just another poster) */
let devPeel=0;
const DEV_PEEL=['A damp-stained poster. Somebody taped it up crooked.',
  'The corner has come away from the wall.',
  'There is a draught coming out from behind it.',
  'The plaster behind it is not plaster.'];
const devPanel=box(0.9,1.3,0.05,M.paper,-1.32,1.7,-18.45,Math.PI/2,false);
tag(devPanel,'devpanel','Press [E] to Look at the Poster');
let devReturn=new THREE.Vector3(0,1.55,-17.5), devCapSave=null;
function enterDev(){
  devReturn.copy(camera.position);
  devCapSave=S.timeCap; S.timeCap=S.minutes;      // clock stops while you are in here
  S.dev=true; devRoom.visible=true;
  entity.visible=false; entityEyes.intensity=0;
  camera.position.set(DEV.x,1.55,DEV.z+DEV.hd-1.6);
  SFX.creak(); SFX.win();
  say('The wall swings inward. This room is not in the plans.',4200);
}
function exitDev(){
  S.dev=false; devRoom.visible=false;
  camera.position.copy(devReturn);
  S.timeCap=devCapSave; devCapSave=null;
  SFX.doorOpen();
  say('You are back in the hallway. The poster is flat against the wall again.',4000);
}

/* =========================================================
   13b. HIDDEN ENDINGS  (never hinted anywhere in the game)
========================================================= */
const ENDINGS={
  guest:{ t:'THE POLITE GUEST',
    s:'You knocked three times on a door that has been locked since the fire.<br>'+
      'Three is polite. Three is practice.<br><br>'+
      'Something on the other side knocks back, exactly in time with you, and then '+
      'says thank you in your grandmother\u2019s voice. The lock turns from the inside.<br><br>'+
      'ENDING 1 OF 4 &mdash; you invited it.' },
  shoes:{ t:"ADA'S SHOES",
    s:'At the dead end of the hallway, in your own torchlight, there is a pair of small '+
      'shoes still laced, pointing at the wall.<br>Two weeks of dust. No footprints '+
      'leading to them.<br><br>You turn around and the hallway is one door longer than it was.<br><br>'+
      'ENDING 2 OF 4 &mdash; you found what the police missed.' },
  waited:{ t:'THE ONE WHO WAITED',
    s:'Six o\u2019clock came, and the knocking was Mom, and you stayed in the cupboard '+
      'with the latch shut anyway.<br><br>She calls your name for a while. Then two voices '+
      'call it together. Then twenty.<br>You do not open the door. You never open the door again.<br><br>'+
      'ENDING 3 OF 4 &mdash; the rules kept you, and kept you, and kept you.' },
  dark:{ t:'DARK ADAPTED',
    s:'Five knocks, five hides, and you never once switched the flashlight on.<br>'+
      'It spent the whole night looking for a boy who made no light and no sound.<br><br>'+
      'Mom opens the door at 6:00 AM and says you must have slept right through it.<br>'+
      'You did not. You have simply stopped needing to see.<br><br>'+
      'ENDING 4 OF 4 &mdash; the quiet ending.' }
};
function secretEnding(k){
  if(S.mode==='dead'||S.mode==='won') return;
  S.mode='won';
  S.hiding=false; S.sitting=false;
  document.body.classList.remove('hiding');
  entity.visible=false; entityEyes.intensity=0;
  const e=ENDINGS[k];
  $('secretTitle').textContent=e.t;
  $('secretText').innerHTML=e.s;
  $('secret').style.display='flex';
  $('prompt').style.display='none'; $('timer').style.display='none';
  $('fade').style.opacity=0;
  document.body.classList.remove('playing');
  if(!IS_TOUCH) controls.unlock();
  $('menu').style.display='none';
  if(k==='guest'){ SFX.knock(); SFX.whisper(); }
  else if(k==='shoes'){ SFX.creak(); SFX.whisper(); }
  else if(k==='waited'){ SFX.whisper(); }
  else SFX.win();
}

function winGame(){
  if(S.mode==='dead'||S.mode==='won') return;
  S.mode='won'; SFX.win();
  S.hiding=false; document.body.classList.remove('hiding');
  ambient.intensity=1.5; hemi.intensity=1.2; scene.fog.density=0.018;
  scene.background.setHex(0x8fa8d8);
  $('win').style.display='flex'; $('prompt').style.display='none';
  document.body.classList.remove('playing');
  if(!IS_TOUCH) controls.unlock();
  $('menu').style.display='none';
}

/* =========================================================
   14. NIGHT EVENTS
========================================================= */
/* atmosphere only - the dangerous beats are all scripted in section 11b */
function spawnEvent(){
  S.nextEvent=20+Math.random()*18;
  if(S.practice) return;
  const r=Math.random();
  if(r<0.22){ SFX.creak(); say('A floorboard settles somewhere down the hallway.',3200); }
  else if(r<0.42){ SFX.whisper(); say('Two voices behind 4D, talking about you in the past tense.',4200); }
  else if(r<0.58){ SFX.ring();
    S.calling=true;
    say('The phone rings twice and stops. Nobody has this number but Mom.',4200);
    setTimeout(()=>{ S.calling=false; },9000);
  }
  else if(r<0.74 && S.power){ S.hallLightOn=true; SFX.flip();
    say('The hallway light turns itself on. Rule 1: do not look down the hallway.',4600); }
  else if(r<0.88 && A.humGain){ A.humGain.gain.value=0;
    say('The fridge stops humming. The quiet has a shape.',3600);
    setTimeout(()=>{ if(A.humGain&&S.power) A.humGain.gain.value=0.05; },5000);
  }
  else { sfxNoise(0.5,220,0.22,'lowpass'); say('Something drags once across the hallway floor.',3600); }
}

/* =========================================================
   15. METERS + ENTITY BEHAVIOUR
========================================================= */
const lookDir=new THREE.Vector3();
function updateMeters(dt){
  if(S.mode!=='play'||S.overlay) return;
  if(S.stage==='heating' && !S.dev){
    S.heatT+=dt;
    if(S.heatT>=16) mwDone();
  }
  /* the clock only runs while the story lets it: it stops at 11:04 until the
     rules are read, then 2 minutes later until the food is eaten on the couch.
     In practice mode it never moves at all. */
  if(!S.practice && (S.timeCap===null || S.minutes<S.timeCap))
    S.minutes=Math.min(DAWN, S.minutes+dt*MIN_PER_SEC);
  if(S.timeCap!==null) S.minutes=Math.min(S.minutes,S.timeCap);
  const frozen = S.practice || (S.timeCap!==null && S.minutes>=S.timeCap);
  $('clock').textContent=clockText(S.minutes)+(frozen?'  \u23F8':'');
  /* ambient events, only while the flat is still "normal" */
  if(!S.practice && (S.stage==='intro'||S.stage==='getfood'||S.stage==='heat'||
                     S.stage==='heating'||S.stage==='collect'||S.stage==='couch')){
    S.nextEvent-=dt;
    if(S.nextEvent<=0) spawnEvent();
  }
  if(S.flashOn){
    S.battery=Math.max(0,S.battery-dt*(S.stage==='night'?1.05:2.0));
    if(S.battery<=0){ S.flashOn=false; $('fl').textContent='DEAD'; say('The flashlight dies.'); }
  }
  $('batBar').firstElementChild.style.width=S.battery+'%';
  $('sanBar').firstElementChild.style.width=S.nerve+'%';
  if(S.mode==='play') $('vblood').style.opacity=String(Math.max(0,(45-S.nerve)/45*0.8));
  if(A.heartGain) A.heartGain.gain.value=0;
  if(S.nerve<50 && A.ctx && Math.random()<dt*(2.4-S.nerve/50)) sfxTone(58,0.24,'sine',0.22);
}
function updateEntity(dt,t){
  if(S.dev){ entity.visible=false; entityEyes.intensity=0; return; }
  /* practice mode: it never comes, not even when the hallway light is on */
  if(S.practice){
    entity.visible=false; entityEyes.intensity=0;
    entity.position.set(0,0,-13);
    S.nerve=100;
    return;
  }
  /* scripted night: it walks in from the hallway on every knock */
  /* --- scripted night: it comes up the hall, ducks in, and hunts the room --- */
  if(S.stage==='night'&&(S.hideWindow>0||S.safe)){
    entity.visible=!S.hiding;
    entityEyes.intensity=entity.visible?2.2+Math.sin(t*11)*1.1:0;
    if(S.safe){
      /* you are in the cupboard: it circles the kitchen, then drifts out */
      const ang=t*0.5;
      entity.position.x += ((3.0+Math.sin(ang)*1.1)-entity.position.x)*dt*1.4;
      entity.position.z += ((0.6+Math.cos(ang)*1.4)-entity.position.z)*dt*1.4;
      entity.lookAt(closet.position.x,2.2,closet.position.z);
      if(Math.random()<dt*0.7) sfxNoise(0.14,260,0.13,'lowpass');   // slow footfalls
    } else {
      /* the hide window: it walks straight at you, arriving as the timer hits 0 */
      const k=1-Math.max(0,S.hideWindow)/6;                        // 0 -> 1
      entity.position.x += ((camera.position.x)-entity.position.x)*dt*1.6;
      entity.position.z = -5.2 + k*(camera.position.z+5.2);
      entity.lookAt(camera.position.x,1.9,camera.position.z);
      entity.rotation.z=Math.sin(t*7)*0.03*k;                      // lurching
      if(Math.random()<dt*(2+k*4)) sfxNoise(0.12,220+Math.random()*160,0.16,'lowpass');
    }
    animateEntity(t,true);
    return;
  }
  entity.rotation.z=0;
  if(S.stage==='night'||S.stage==='dawn'||S.stage==='credits'){
    entity.visible=false; entityEyes.intensity=0;
    entity.position.set(0,0,-13);
    return;
  }
  /* --- before the sleep: it only exists in the lit hallway, and only moves
         while you are looking straight down it --- */
  entity.visible = S.hallLightOn && S.frontOpen && !S.hiding && S.mode==='play';
  entityEyes.intensity = entity.visible?1.2+Math.sin(t*3)*0.6:0;
  if(S.mode!=='play') return;
  let walking=false;
  if(entity.visible){
    entity.lookAt(camera.position.x,1.9,camera.position.z);
    camera.getWorldDirection(lookDir);
    const staring = lookDir.z<-0.55 && camera.position.z<2.0;
    if(staring){
      walking=true;
      entity.position.z += dt*1.5;                  // it closes in while watched
      entity.position.x += (0-entity.position.x)*dt*2;
      S.nerve=Math.max(0,S.nerve-dt*15);
      if(Math.random()<dt*1.5) SFX.whisper();
      if(entity.position.z>-9&&Math.random()<dt*0.6)
        say('It has not moved its feet. It is just closer.',2600);
      if(S.nerve<=0||entity.position.z>-6.0)
        gameOver('You looked, and you kept looking. It learned that you can see it. Rules 1 and 5.');
    } else {
      entity.position.z = Math.max(-16, entity.position.z - dt*0.9);
      S.nerve=Math.min(100,S.nerve+dt*3.2);
    }
  } else S.nerve=Math.min(100,S.nerve+dt*3.6);
  animateEntity(t,walking);
}

/* =========================================================
   16. PROP ANIMATION + MENU CAMERA
========================================================= */
function animateProps(dt,t){
  /* fridge door swings open while reading */
  const fTarget=S.fridgeOpen?-1.15:0;
  fridgeHinge.rotation.y += (fTarget-fridgeHinge.rotation.y)*dt*4;
  fridgeInner.intensity = Math.max(0,-fridgeHinge.rotation.y)*2.2;
  /* cupboard doors: OPEN when empty, CLOSED once you are inside */
  const clT = S.hiding ? 0 : 0.55;
  clHingeL.rotation.y += ( clT-clHingeL.rotation.y)*dt*5;
  clHingeR.rotation.y += (-clT-clHingeR.rotation.y)*dt*5;
  /* light switch nub */
  switchNub.position.y += (((S.hallLightOn?1.38:1.46))-switchNub.position.y)*dt*10;
  /* front door shakes when knocked */
  if(S.knockShake>0){
    S.knockShake=Math.max(0,S.knockShake-dt*0.6);
    doorPivot.position.x=1.4+Math.sin(t*40)*0.012*S.knockShake;
  } else doorPivot.position.x=1.4;
  doorPivot.rotation.y += ((S.frontOpen?DOOR_SWING:0)-doorPivot.rotation.y)*Math.min(1,dt*3.2);
  /* locked hallway doors rattle when tried */
  hallDoors.forEach(d=>{
    if(d.shake>0){ d.shake=Math.max(0,d.shake-dt*1.4);
      d.group.position.x = d.baseX + Math.sin(t*45)*0.01*d.shake; }
    else d.group.position.x = d.baseX;
  });
  /* phone receiver rattles while ringing */
  receiver.position.y = 0.09 + (S.calling?Math.abs(Math.sin(t*26))*0.012:0);
  /* curtain wave */
  const pos=curtain.geometry.attributes.position;
  for(let i=0;i<pos.count;i++){
    const bx=curtainBase[i*3], by=curtainBase[i*3+1];
    pos.setZ(i, Math.sin(t*1.6+bx*1.7+by*0.6)*0.06*(1-Math.abs(by)/0.9));
  }
  pos.needsUpdate=true;
  /* lights + TV  (all of it dies with the power) */
  if(S.power){
    bulb.intensity = 14+Math.sin(t*8.7)*0.6+(Math.random()<0.008?-6:0);
    glassBulb.material.emissiveIntensity = 2.2+Math.sin(t*8.7)*0.3;
    hallLight.intensity += ((S.hallLightOn?22:0)-hallLight.intensity)*dt*6;
    hallGlow.intensity = 2.2+Math.sin(t*1.6)*0.4;
  } else {
    bulb.intensity = 0; glassBulb.material.emissiveIntensity = 0;
    hallLight.intensity += (0-hallLight.intensity)*dt*8;
    hallGlow.intensity = 0.22+Math.sin(t*0.9)*0.05;
  }
  /* caged hallway lamps buzz and drop out one at a time */
  hallLamps.forEach((L,i)=>{
    L.flick-=dt;
    if(L.flick<=0) L.flick=0.6+Math.random()*4.5;
    const on = S.power && S.hallLightOn && L.flick>0.12;
    const v = on ? 4.5+Math.sin(t*30+i)*1.6 : 0;
    L.light.intensity += (v-L.light.intensity)*dt*14;
    L.glass.material.emissiveIntensity = on ? 1.6 : 0;
  });
  /* the wall clock reads the same time as the HUD */
  const tm=(23*60+S.minutes);
  handMPivot.rotation.z = -(tm%60)/60*Math.PI*2;
  handHPivot.rotation.z = -((tm%720)/720)*Math.PI*2;
  if(S.tvOn&&S.power){ drawStatic(); M.screen.emissiveIntensity=1.1+Math.random()*0.5;
    tvLight.intensity=7+Math.random()*3; }
  else { M.screen.emissiveIntensity=0; tvLight.intensity=0; }
  scene.fog.density = (S.power?0.03:0.072) + Math.max(0,(45-S.nerve))*0.0012;
}
/* animated fly-around behind the main menu */
function menuCamera(t){
  const r=3.2;
  camera.position.set(Math.sin(t*0.12)*r*0.6+0.5, 1.65+Math.sin(t*0.35)*0.06, 2.4+Math.cos(t*0.12)*r*0.25);
  camera.lookAt(-3.4+Math.sin(t*0.2)*0.5, 1.35, -3.4);
}

/* =========================================================
   17. LOOP
========================================================= */
const clock=new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(0.05,clock.getDelta()), t=clock.elapsedTime;
  if(S.mode==='menu'&&!S.overlay) menuCamera(t);
  move(dt);
  updateScript(dt);
  animateFlashlight(dt);
  updateFocus();
  updateMeters(dt);
  updateEntity(dt,t);
  animateProps(dt,t);
  if(A.humGain) A.humGain.gain.value = 0.05/(1+camera.position.distanceTo(fridge.position)*0.25);
  renderer.render(scene,camera);
}
resize();
addEventListener('resize',resize);
addEventListener('orientationchange',()=>setTimeout(resize,250));

/* ---- phone friendly endings + help text ---- */
if(IS_TOUCH){
  $('audioHint').textContent='tap anywhere to enable ambient sound';
  document.querySelectorAll('.screen .cta, #credits .end').forEach(el=>{
    el.textContent='TAP TO PLAY AGAIN';
  });
  ['over','win','secret','credits'].forEach(id=>$(id).addEventListener('pointerdown',()=>{
    if(S.mode==='dead'||S.mode==='won') location.reload();
  }));
  const how=$('pHow').querySelector('ol');
  how.insertAdjacentHTML('afterbegin',
    '<li>PHONE CONTROLS: left stick walks, drag the right half of the screen to look,'+
    ' USE interacts, LIGHT is the flashlight, RUN sprints, MENU pauses.</li>');
}
objective('Read the rules on the fridge');
animate();
window.__gameBooted=true;
