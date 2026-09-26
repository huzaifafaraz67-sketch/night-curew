/* I WILL FIND YOU — core game logic (classic script).
   THREE + post-processing addons are provided as window globals by
   the module loader in index.html, so this file uses them by name. */


const $ = id => document.getElementById(id);

/* touch / phone detection */
const IS_TOUCH = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
if(IS_TOUCH) document.body.classList.add('touch');

/* =========================================================
   1. RENDERER  -  HD by default, optional retro downscale
========================================================= */
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance', stencil:false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('game').appendChild(renderer.domElement);

/* post-processing composer is built after the scene/camera exist (section 3b) */
let composer=null, bloomPass=null, gradePass=null, aoPass=null;

let retro = false;
let PERF = localStorage.getItem('mc_perf')==='1';   // low-cost mode for weaker laptops
const QUALITY = IS_TOUCH ? 0.72 : 1;          // internal resolution scale on phones
function prCap(){
  if(!PERF && !IS_TOUCH && window.SRM && SRM.graphics && SRM.graphics.prCap){
    return SRM.graphics.prCap(devicePixelRatio||1);
  }
  return Math.min(devicePixelRatio||1, PERF?1:(IS_TOUCH?1.5:1.75));
}
function resize(){
  if(retro){
    renderer.setPixelRatio(1);
    renderer.setSize(320,240,false);
    camera.aspect = 4/3;
  } else {
    renderer.setPixelRatio(prCap()*QUALITY);
    renderer.setSize(innerWidth,innerHeight,false);
    camera.aspect = innerWidth/innerHeight;
  }
  camera.updateProjectionMatrix();
  if(composer){
    const pr=prCap()*QUALITY;
    composer.setPixelRatio(pr);
    composer.setSize(innerWidth,innerHeight);
    if(aoPass) aoPass.setSize(innerWidth,innerHeight);
    if(gradePass) gradePass.uniforms.uRes.value.set(innerWidth,innerHeight);
  }
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
/* build a tangent-space normal map from a grayscale height drawing (Sobel).
   used to give floors / walls / wood real tactile relief under the torch. */
function canvasNormal(w,h,drawHeight,repX=1,repY=1,strength=2.2){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const ctx=c.getContext('2d'); drawHeight(ctx,w,h);
  const src=ctx.getImageData(0,0,w,h).data;
  const out=ctx.createImageData(w,h);
  const H=(x,y)=>{ x=(x+w)%w; y=(y+h)%h; return src[(y*w+x)*4]/255; };
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const dx=(H(x-1,y)-H(x+1,y))*strength;
    const dy=(H(x,y-1)-H(x,y+1))*strength;
    const len=Math.hypot(dx,dy,1);
    const i=(y*w+x)*4;
    out.data[i]  =(dx/len*0.5+0.5)*255;
    out.data[i+1]=(dy/len*0.5+0.5)*255;
    out.data[i+2]=(1 /len*0.5+0.5)*255;
    out.data[i+3]=255;
  }
  ctx.putImageData(out,0,0);
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(repX,repY); t.anisotropy=8;
  return t;
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
/* ---- normal maps: tactile relief for the torch beam (HD only) ---- */
const normFloor = canvasNormal(256,256,(c,w,h)=>{
  c.fillStyle='#808080'; c.fillRect(0,0,w,h);
  c.strokeStyle='#000'; c.lineWidth=6;             // deep grout lines between tiles
  for(let i=0;i<=2;i++){ c.beginPath();c.moveTo(i*w/2,0);c.lineTo(i*w/2,h);c.stroke();
    c.beginPath();c.moveTo(0,i*h/2);c.lineTo(w,i*h/2);c.stroke(); }
  for(let i=0;i<600;i++){ c.fillStyle='rgba(255,255,255,'+(Math.random()*0.1)+')';
    c.fillRect(Math.random()*w,Math.random()*h,2,2); }
},6,6,2.6);
const normWall = canvasNormal(256,256,(c,w,h)=>{
  c.fillStyle='#808080'; c.fillRect(0,0,w,h);
  for(let x=0;x<w;x+=16){ c.fillStyle=(x/16)%2?'#6e6e6e':'#8f8f8f'; c.fillRect(x,0,8,h); }
  for(let i=0;i<40;i++){ c.fillStyle='rgba(40,40,40,.5)';
    c.fillRect(Math.random()*w,Math.random()*h,Math.random()*30,Math.random()*4); }
},3,1.4,1.4);
const normHall = canvasNormal(256,256,(c,w,h)=>{
  c.fillStyle='#808080'; c.fillRect(0,0,w,h);
  for(let i=0;i<120;i++){ c.strokeStyle='rgba(30,30,30,.6)'; c.lineWidth=Math.random()*3;
    c.beginPath(); c.moveTo(Math.random()*w,Math.random()*h);
    c.lineTo(Math.random()*w,Math.random()*h); c.stroke(); }
},3,2,2.0);
const normWood = canvasNormal(256,256,(c,w,h)=>{
  c.fillStyle='#808080'; c.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=4){ c.strokeStyle='rgba(20,20,20,'+(0.3+Math.random()*0.4)+')';
    c.lineWidth=1+Math.random()*2; c.beginPath();
    c.moveTo(0,y+Math.sin(y*0.2)*3); c.bezierCurveTo(w/3,y+6,2*w/3,y-6,w,y+Math.cos(y*.15)*3);
    c.stroke(); }
},2,2,1.6);
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
scene.fog = new THREE.FogExp2(0x06080d, 0.058);

const camera = new THREE.PerspectiveCamera(72, 16/9, 0.05, 120);
camera.position.set(0,1.55,4);

const ambient = new THREE.AmbientLight(0x8fa6c8, 0.24); scene.add(ambient);
const hemi = new THREE.HemisphereLight(0x8f9fc0, 0x2a241c, 0.28); scene.add(hemi);

const bulb = new THREE.PointLight(0xffdcae, 14, 18, 2);
bulb.position.set(0,2.55,-1); bulb.castShadow=true;
bulb.shadow.mapSize.set(IS_TOUCH?512:2048,IS_TOUCH?512:2048); bulb.shadow.bias=-0.0025; bulb.shadow.radius=3; scene.add(bulb);
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
moon.shadow.mapSize.set(IS_TOUCH?512:2048,IS_TOUCH?512:2048);
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
flashlight.shadow.mapSize.set(IS_TOUCH?512:1024,IS_TOUCH?512:1024);
flashlight.shadow.radius=4; flashlight.shadow.bias=-0.002;
flashlight.position.set(0.22,-0.12,0);
flashlight.target.position.set(0,0,-1);
camera.add(flashlight, flashlight.target);
scene.add(camera);

/* =========================================================
   4. MATERIALS + HELPERS
========================================================= */
const std = o => new THREE.MeshStandardMaterial(o);
const M = {
  floor : std({map:texFloor, normalMap:normFloor, roughness:.68, metalness:.02}),
  wall  : std({map:texWall,  normalMap:normWall, roughness:.92}),
  hall  : std({map:texHall,  normalMap:normHall, roughness:.95}),
  ceil  : std({color:0x3d3d46, roughness:.95}),
  wood  : std({map:texWood,  normalMap:normWood, roughness:.62}),
  fridge: std({map:texEnamel, color:0xe8e4d6, roughness:.3, metalness:.3}),
  metal : std({color:0xb9bcc2, roughness:.22, metalness:.95}),
  dark  : std({color:0x272730, roughness:.68}),
  door  : std({map:texWood, normalMap:normWood, color:0xc79a6d, roughness:.58}),
  paper : std({map:texNote, roughness:.95}),
  glass : std({color:0x4a6a8c, roughness:.08, metalness:.2, transparent:true, opacity:.28}),
  cloth : std({color:0x5c6478, roughness:1, side:THREE.DoubleSide}),
  screen: new THREE.MeshStandardMaterial({map:texTV, emissiveMap:texTV,
            emissive:0xffffff, emissiveIntensity:0, roughness:.4, color:0x101418}),
  skin  : std({color:0xb9ae9c, roughness:.85}),
  suit  : std({color:0x22212a, roughness:.9})
};
/* keep the relief subtle so it reads as grime, not corrugation */
[[M.floor,0.55],[M.wall,0.35],[M.hall,0.5],[M.wood,0.4],[M.door,0.35]]
  .forEach(([m,s])=>{ if(m.normalMap) m.normalScale.set(s,s); });

/* ---- image-based lighting: a tiny procedural env so metal / glass /
   enamel actually reflect the room and read as solid, molded objects
   instead of flat plastic. Kept dark to preserve the horror mood. ---- */
(function buildEnvironment(){
  const c=document.createElement('canvas'); c.width=256; c.height=128;
  const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,0,128);
  g.addColorStop(0.00,'#04060a');   // ceiling / above
  g.addColorStop(0.46,'#0a0f18');
  g.addColorStop(0.54,'#1a2432');   // horizon band
  g.addColorStop(1.00,'#05070b');   // floor / below
  x.fillStyle=g; x.fillRect(0,0,256,128);
  // warm hanging-bulb glow, upper centre
  const b=x.createRadialGradient(128,30,2,128,30,64);
  b.addColorStop(0,'rgba(255,222,172,0.95)'); b.addColorStop(1,'rgba(255,222,172,0)');
  x.fillStyle=b; x.fillRect(0,0,256,128);
  // cold moonlit window, to the side
  const m=x.createRadialGradient(212,68,2,212,68,46);
  m.addColorStop(0,'rgba(150,180,230,0.7)'); m.addColorStop(1,'rgba(150,180,230,0)');
  x.fillStyle=m; x.fillRect(0,0,256,128);
  const tex=new THREE.CanvasTexture(c);
  tex.mapping=THREE.EquirectangularReflectionMapping;
  tex.colorSpace=THREE.SRGBColorSpace;
  try{
    const pmrem=new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const rt=pmrem.fromEquirectangular(tex);
    scene.environment=rt.texture;
    tex.dispose(); pmrem.dispose();
  }catch(e){ scene.environment=tex; }
})();
// reflective materials pick up the environment more strongly
M.metal.envMapIntensity  = 1.35;
M.fridge.envMapIntensity = 0.9;
M.glass.envMapIntensity  = 1.2;
M.screen.envMapIntensity = 0.5;
M.door.envMapIntensity   = 0.35;
M.wood.envMapIntensity   = 0.3;
M.floor.envMapIntensity  = 0.35;

/* =========================================================
   3b. POST-PROCESSING  -  filmic bloom + grade (HD only)
========================================================= */
const GradeShader = {
  uniforms:{
    tDiffuse:{value:null},
    uRes:{value:new THREE.Vector2(innerWidth,innerHeight)},
    uTime:{value:0},
    uVig:{value:1.0},        // vignette strength
    uGrain:{value:0.038},    // film grain (subtle, camera-sensor like)
    uAberr:{value:0.7},      // chromatic aberration (px)
    uFear:{value:0.0}        // 0..1 pushed up when nerve is low
  },
  vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader:`
    varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec2 uRes;
    uniform float uTime,uVig,uGrain,uAberr,uFear;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    void main(){
      vec2 uv=vUv; vec2 c=uv-0.5;
      float d=dot(c,c);
      // chromatic aberration grows toward the edges (and with fear)
      float a=(uAberr+uFear*3.0)/uRes.x;
      vec2 dir=normalize(c+1e-5);
      vec3 col;
      col.r=texture2D(tDiffuse, uv+dir*a*(1.0+d*2.0)).r;
      col.g=texture2D(tDiffuse, uv).g;
      col.b=texture2D(tDiffuse, uv-dir*a*(1.0+d*2.0)).b;
      // vignette
      float vig=smoothstep(0.9,0.18,d*(2.0-uFear*0.6))*0.55+0.45;
      col*=mix(1.0,vig,uVig);
      // animated film grain
      float g=hash(uv*uRes+uTime*60.0)-0.5;
      col+=g*(uGrain+uFear*0.05);
      // faint scanline breathing when scared
      col*=1.0-uFear*0.05*sin(uv.y*uRes.y*0.7+uTime*4.0);
      gl_FragColor=vec4(col,1.0);
    }`
};
function buildComposer(){
  composer=new EffectComposer(renderer);
  composer.setPixelRatio(prCap()*QUALITY);
  composer.setSize(innerWidth,innerHeight);
  composer.addPass(new RenderPass(scene,camera));
  // ground-truth ambient occlusion: real contact shadows in the corners /
  // under furniture so objects sit in the room like real solids.
  try{
    if(!IS_TOUCH && !PERF){
      const gtao=new GTAOPass(scene,camera,innerWidth,innerHeight);
      gtao.output=GTAOPass.OUTPUT.Default;
      gtao.blendIntensity=0.9;
      gtao.updateGtaoMaterial({ radius:0.55, distanceExponent:1.0, thickness:1.0,
        scale:1.0, samples:16, distanceFallOff:1.0, screenSpaceRadius:false });
      gtao.updatePdMaterial({ lumaPhi:10, depthPhi:2, normalPhi:3, radius:4,
        radiusExponent:1, rings:2, samples:16 });
      aoPass=gtao; composer.addPass(gtao);
    }
  }catch(e){ aoPass=null; }
  bloomPass=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),
    IS_TOUCH?0.35:0.55, 0.6, 0.82);   // strength, radius, threshold
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  gradePass=new ShaderPass(GradeShader);
  gradePass.renderToScreen=true;
  composer.addPass(gradePass);
}
buildComposer();
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
for(let z=-7; z>-18; z-=3.5) box(0.9,1.3,0.05,M.paper,-1.32,1.7,z,Math.PI/2,false);

/* ---- STAIRWELL LANDING: the corridor opens into a well that drops to the basement ---- */
const LAND_HALF=3.6, LAND_Z=-18.6, LAND_END=-26.4, LAND_CY=-22.4;
const DOWN_HALF=3.2, DOWN_END=-31.6, DOWN_CY=-29.0, DOWN_FLOOR=-3.0;
const DOWN_DEPTH=LAND_END-DOWN_END;                          // 5.2
/* landing floor only reaches the head of the stairs; past it the floor drops away */
box(7.6,0.2,4.0,M.hall,0,-0.1,-20.6,0,false);              // landing floor (LAND_Z .. stair head)
box(7.6,0.2,8.0,M.ceil,0,ROOM.h,-22.5,0,false);            // ceiling over the landing + stairwell
/* side walls run from the basement floor up to the ceiling, framing the descent */
box(0.2,6,8.2,M.hall,-LAND_HALF-0.1,0,LAND_CY);
box(0.2,6,8.2,M.hall, LAND_HALF+0.1,0,LAND_CY);
/* south wall of the landing, split around the corridor mouth */
box(2.4,ROOM.h,0.2,M.hall,-2.5,ROOM.h/2,LAND_Z);
box(2.4,ROOM.h,0.2,M.hall, 2.5,ROOM.h/2,LAND_Z);
box(2.8,0.7,0.2,M.hall,0,ROOM.h-0.35,LAND_Z);              // lintel over the mouth
/* north wall closes the stairwell ABOVE the basement ceiling (basement runs on below) */
box(7.6,ROOM.h,0.2,M.hall,0,ROOM.h/2,LAND_END);

/* ---- STAIRCASE dropping to the basement (bottom tread level with DOWN_FLOOR) ---- */
const STEPS=12, stepRise=0.25, stepRun=0.31, stepW=3.0, stepZ0=-22.6;
for(let i=0;i<STEPS;i++){
  const y=-0.125-i*stepRise, z=stepZ0-i*stepRun;
  box(stepW,0.25,stepRun+0.02,M.wood,0,y,z,0,true);          // tread + riser going down
}
/* stringer walls either side of the stairs */
box(0.14,3.4,3.8,M.wood,-stepW/2-0.06,-0.1,-24.3,0,false);
box(0.14,3.4,3.8,M.wood, stepW/2+0.06,-0.1,-24.3,0,false);
/* banister posts down one side */
for(let i=0;i<STEPS;i+=2){
  const y=-0.125-i*stepRise, z=stepZ0-i*stepRun;
  box(0.06,0.78,0.06,M.wood,stepW/2-0.12,y+0.86,z,0,false);
}

/* ---- BASEMENT at the bottom of the stairs ---- */
box(7.2,0.2,DOWN_DEPTH,M.hall,0,DOWN_FLOOR-0.1,DOWN_CY,0,false);   // basement floor slab
box(7.2,0.2,DOWN_DEPTH,M.ceil,0,0,DOWN_CY,0,false);               // basement ceiling (= ground underside)
box(0.2,3,DOWN_DEPTH,M.hall,-DOWN_HALF-0.1,DOWN_FLOOR/2,DOWN_CY);  // left wall
box(0.2,3,DOWN_DEPTH,M.hall, DOWN_HALF+0.1,DOWN_FLOOR/2,DOWN_CY);  // right wall
box(7.2,3,0.2,M.hall,0,DOWN_FLOOR/2,DOWN_END);                    // far north wall
box(7.2,0.16,0.06,M.wood,0,DOWN_FLOOR+0.08,DOWN_END+0.16,0,false);// skirting

/* ---- LOCKED FIRE EXIT on the far basement wall: the only way out, and it is sealed ---- */
const exitDoor=box(1.3,2.2,0.14,M.metal,0,DOWN_FLOOR+1.1,DOWN_END+0.13,0,true);
box(0.12,2.3,0.18,M.dark,-0.72,DOWN_FLOOR+1.15,DOWN_END+0.13,0,false);   // frame L
box(0.12,2.3,0.18,M.dark, 0.72,DOWN_FLOOR+1.15,DOWN_END+0.13,0,false);   // frame R
box(1.6,0.14,0.18,M.dark,0,DOWN_FLOOR+2.3,DOWN_END+0.13,0,false);        // frame head
box(1.05,0.09,0.05,M.metal,0,DOWN_FLOOR+1.2,DOWN_END+0.24,0,false);      // chain across the push-bar
box(0.15,0.22,0.07,M.dark,0,DOWN_FLOOR+1.2,DOWN_END+0.30,0,false);       // padlock body
/* the EXIT sign hums but the door has not opened in years */
box(0.62,0.24,0.05,std({color:0x0a0a0a,emissive:0x18ff4a,emissiveIntensity:1.4,roughness:.5}),
    0,DOWN_FLOOR+2.6,DOWN_END+0.2,0,false);
const exitGlow=new THREE.PointLight(0x18ff4a,1.0,5,2);
exitGlow.position.set(0,DOWN_FLOOR+2.4,DOWN_END+0.8); scene.add(exitGlow);

/* dim, sickly basement glow + the dark pool at the foot of the stairs */
const upLight=new THREE.PointLight(0x7a1f26,0,9,2);
upLight.position.set(0,DOWN_FLOOR+1.6,DOWN_CY); scene.add(upLight);
const stairVoid=new THREE.PointLight(0x140708,1.4,7,2);
stairVoid.position.set(0,-0.6,LAND_END-0.3); scene.add(stairVoid);

/* landing dressing: a flickering caged lamp registered with the hall lamps later */
const LAND_LAMP=(()=>{
  const g=new THREE.Group(); g.position.set(0,ROOM.h-0.18,LAND_CY+1.2); scene.add(g);
  const glass=new THREE.Mesh(new THREE.SphereGeometry(0.11,10,8),
    std({color:0xfff0d0,emissive:0xffe0a8,emissiveIntensity:0,roughness:.4}));
  glass.position.set(0,-0.06,0); g.add(glass);
  const cage=new THREE.Mesh(new THREE.TorusGeometry(0.15,0.012,6,12),M.metal);
  cage.position.set(0,-0.06,0); g.add(cage);
  const L=new THREE.PointLight(0xd8e6ff,0,7,2); L.position.set(0,-0.1,0); g.add(L);
  return {light:L, glass:glass, flick:Math.random()*9};
})();

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
tag(exitDoor,'lockedexit','Press [E] to Try the Fire Exit');   // fire-exit hint (moved after tag is defined)
const mesh=(g,m,x,y,z)=>{ const o=new THREE.Mesh(g,m); o.position.set(x,y,z);
  o.castShadow=true; o.receiveShadow=true; return o; };
const B=(w,h,d)=>new THREE.BoxGeometry(w,h,d);

/* =========================================================
   6w. THE WINDOW  -  peek logic, courtyard, watcher, face-at-glass
   The window is a real interactive object now: you can look out,
   check the latch, and something can be looking back.
========================================================= */
const WIN_X=ROOM.w/2, WIN_Y=1.75, WIN_Z=-2.0;
const outside=new THREE.Group(); scene.add(outside);
/* courtyard ground four floors down + the facing block across the way */
const exteriorMat=std({color:0x0b0d12, roughness:.96, metalness:0});
const court=new THREE.Mesh(B(16,0.2,22),exteriorMat);
court.position.set(WIN_X+7,-4.0,WIN_Z); court.receiveShadow=true; outside.add(court);
const facing=new THREE.Mesh(B(0.5,11,22),std({map:texHall,normalMap:normHall,color:0x20242b,roughness:.97}));
facing.position.set(WIN_X+9.5,4.0,WIN_Z); outside.add(facing);
/* a grid of lit / dead windows on the opposite building */
const litMat =std({color:0x161512,emissive:0xffcf8a,emissiveIntensity:1.3,roughness:.6});
const deadMat=std({color:0x090a0d,emissive:0x0a0d14,emissiveIntensity:0.12,roughness:.85});
const extWindows=[];
for(let gy=1.2; gy<9; gy+=1.8){
  for(let gz=WIN_Z-8; gz<WIN_Z+9; gz+=2.2){
    const lit=Math.random()<0.26;
    const w=new THREE.Mesh(B(0.05,1.0,1.2), lit?litMat:deadMat);
    w.position.set(WIN_X+9.23,gy,gz); outside.add(w);
    extWindows.push({m:w, lit, flick:Math.random()*6});
  }
}
const courtGlow=new THREE.PointLight(0xffd9a0, 1.4, 30, 2);
courtGlow.position.set(WIN_X+5,6.0,WIN_Z+5); outside.add(courtGlow);

/* ---- THE WATCHER: a tall figure standing in the courtyard on some rounds ---- */
const watcher=new THREE.Group();
watcher.position.set(WIN_X+3.4,-2.0,WIN_Z+0.3); watcher.visible=false; outside.add(watcher);
const watchMat=std({color:0x05060a,roughness:1,metalness:0});
const watchBody=new THREE.Mesh(new THREE.CapsuleGeometry(0.36,1.7,4,10),watchMat);
watchBody.position.y=1.5; watcher.add(watchBody);
const watchHead=new THREE.Mesh(new THREE.SphereGeometry(0.3,16,12),watchMat);
watchHead.position.y=2.55; watcher.add(watchHead);
const watchEyeL=new THREE.PointLight(0xff3418,0,2.4,2); watchEyeL.position.set(-0.1,2.58,0.26); watcher.add(watchEyeL);
const watchEyeR=new THREE.PointLight(0xff3418,0,2.4,2); watchEyeR.position.set(0.1,2.58,0.26); watcher.add(watchEyeR);

/* ---- THE FACE AT THE GLASS: presses in when you look while it watches ---- */
const winFace=new THREE.Group(); winFace.visible=false; scene.add(winFace);
const faceMat=std({color:0x9a917f,roughness:.9,emissive:0x160a06,emissiveIntensity:0.5});
const faceHead=new THREE.Mesh(new THREE.SphereGeometry(0.42,20,16),faceMat);
faceHead.scale.set(1,1.3,0.68); winFace.add(faceHead);
winFace.add((function(){ const o=new THREE.Mesh(new THREE.SphereGeometry(0.13,10,8),M.dark); o.position.set(-0.15,0.07,0.3); return o; })());
winFace.add((function(){ const o=new THREE.Mesh(new THREE.SphereGeometry(0.13,10,8),M.dark); o.position.set( 0.15,0.07,0.3); return o; })());
const faceEyeMat=std({color:0xffffff,emissive:0xffe0c0,emissiveIntensity:2.4,roughness:.4});
const faceEyeL=new THREE.Mesh(new THREE.SphereGeometry(0.05,8,6),faceEyeMat); faceEyeL.position.set(-0.15,0.07,0.37); winFace.add(faceEyeL);
const faceEyeR=faceEyeL.clone(); faceEyeR.position.x=0.15; winFace.add(faceEyeR);
const faceLight=new THREE.PointLight(0xff5a34,0,3.2,2); winFace.add(faceLight);
const winFaceBase=WIN_X+0.7, winFaceIn=WIN_X-0.26;
winFace.position.set(winFaceBase,WIN_Y-0.1,WIN_Z); winFace.rotation.y=-Math.PI/2;

/* ---- window latch (interactable) + the invisible pane you peek through ---- */
const winLatch=mesh(B(0.06,0.05,0.2),M.metal,WIN_X-0.18,1.14,WIN_Z);
const winLook=new THREE.Mesh(B(0.05,1.3,2.2), new THREE.MeshBasicMaterial({visible:false}));
winLook.position.set(WIN_X-0.24,WIN_Y,WIN_Z); scene.add(winLook);
tag(winLatch,'windowlatch','Press [E] to Check the Window Latch');
tag(winLook,'windowlook','Press [E] to Look Out the Window');
let winLine=0;
const WINDOW_SAFE_LINES=[
  'Four floors down the courtyard is empty. Rain stands in the drains. One window across the way is still lit.',
  'Wet brick, a dead streetlamp, the bins. Nothing moves. The lit window across the court goes dark while you watch.',
  'You press your forehead to the cold glass. Your own breath fogs it. For a second there are two reflections. Then one.',
  'The street is a black mirror. Somewhere a car alarm you cannot see winds down and stops.',
  'Nothing out there. You tell yourself that twice.'
];

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
fridge.traverse(o=>{ if(o.isMesh && o!==fNote) tag(o,'fridge','Press [E] to Open the Fridge'); });
tag(fNote,'rules','Press [E] to Read the Note');

/* ---- FRONT DOOR: the flat's only way out, opens onto the communal hallway ---- */
box(1.1,2.3,0.2,M.wall,-0.85,1.15,-ROOM.d/2);            /* fixed half of the doorway */
const DOOR_GAP=[-0.28,1.38];
const doorPivot=new THREE.Group(); doorPivot.position.set(1.4,0,-ROOM.d/2+0.08); scene.add(doorPivot);
const frontDoor=mesh(B(1.7,2.3,0.12),M.door,-0.85,1.15,0); doorPivot.add(frontDoor);
doorPivot.add(mesh(new THREE.SphereGeometry(0.07,12,10),M.metal,-1.62,1.15,0.12));
tag(frontDoor,'door','Press [E] to Open the Front Door');
const DOOR_SWING=1.5;
/* ---- deadbolt beside the front door (part of the night list) ---- */
const boltPlate=box(0.12,0.3,0.06,std({color:0x8b8574,roughness:.5,metalness:.4}),
  1.72,1.5,-ROOM.d/2+0.13,0,false);
const boltBar=box(0.16,0.07,0.07,M.metal,1.72,1.44,-ROOM.d/2+0.19,0,false);
tag(boltPlate,'bolt','Press [E] to Turn the Deadbolt');
tag(boltBar,'bolt','Press [E] to Turn the Deadbolt');

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
foodBox.traverse(o=>{ if(o.isMesh) tag(o,'food','Press [E] to Take the Pizza'); });

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
blk(-2.55,3.20,0.3,0.2);    // dish rack / draining board corner
blk(40,-43.3,1.2,0.5);      // dev room: desk
blk(40,-42.1,0.3,0.3);      // dev room: crate
/* the open front-door leaf: switched on only while the door is standing open */
const DOORBLK={x:1.35,z:-4.07,hw:0,hd:0}; BLOCKERS.push(DOORBLK);

/* --- microwave on the counter: door panel + window that lights up --- */
const mwPanel=box(0.4,0.34,0.04,std({color:0x1b1b20,roughness:.5}),-4.3,1.24,3.09,0,false);
tag(mwPanel,'microwave','Press [E] to Use the Microwave');
const mwGlass=box(0.26,0.22,0.03,std({color:0x241f14,emissive:0xffb14a,
  emissiveIntensity:0,roughness:.4}),-4.3,1.24,3.07,0,false);
const mwLight=new THREE.PointLight(0xffb14a,0,2.2,2); mwLight.position.set(-4.3,1.24,2.95); scene.add(mwLight);

/* --- kitchen: upper cabinets, sink, tap --- */
box(3.0,0.72,0.36,M.wood,-3.2,2.18,ROOM.d/2-0.38);
box(3.0,0.04,0.36,M.dark,-3.2,1.80,ROOM.d/2-0.38,0,false);
const sinkBasin=box(0.86,0.12,0.56,M.metal,-3.95,0.94,3.35,0,false);
tag(sinkBasin,'sink','Press [E] to Use the Sink');
tag(curtain,'curtain','Press [E] to Close the Curtain');
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
hallLamps.push(LAND_LAMP);
box(2.2,0.02,12,std({map:rugTex,roughness:1}),0,0.012,-12,0,false);
box(0.9,0.06,0.4,M.wood,2.7,0.78,-24.5,0,false);
for(const x of [2.3,3.1]) box(0.06,0.78,0.06,M.wood,x,0.39,-24.5,0,false);
tag(box(0.16,0.3,0.16,std({color:0x3e4a52,roughness:.6}),2.7,0.95,-24.5,0,false),
    'vase','Press [E] to Look at the Vase');
blk(2.7,-24.5,0.5,0.25);

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

/* --- JUMPSCARE: a pale thing waits at the top of the stairwell --- */
const scare=new THREE.Group();
scare.position.set(0,DOWN_FLOOR+1.5,LAND_END-0.3); scare.visible=false; scene.add(scare);
const scareHead=mesh(new THREE.SphereGeometry(0.55,18,16),
  std({color:0xd9d2c2,roughness:.85,emissive:0x120404,emissiveIntensity:.4}),0,0,0);
scareHead.scale.set(0.92,1.18,0.9); scare.add(scareHead);
scare.add(mesh(new THREE.SphereGeometry(0.14,10,8),M.dark,-0.2,0.1,0.44));   // eye socket L
scare.add(mesh(new THREE.SphereGeometry(0.14,10,8),M.dark, 0.2,0.1,0.44));   // eye socket R
scare.add(mesh(new THREE.SphereGeometry(0.07,8,6),
  std({color:0xff3018,emissive:0xff2a10,emissiveIntensity:3,roughness:.4}),-0.2,0.1,0.52)); // pupil L
scare.add(mesh(new THREE.SphereGeometry(0.07,8,6),
  std({color:0xff3018,emissive:0xff2a10,emissiveIntensity:3,roughness:.4}), 0.2,0.1,0.52)); // pupil R
scare.add(mesh(B(0.42,0.34,0.12),M.dark,0,-0.32,0.46));                      // gaping mouth
for(let i=0;i<5;i++){                                                        // teeth
  scare.add(mesh(B(0.05,0.12,0.03),std({color:0xcfc7b2,roughness:.6}),-0.16+i*0.08,-0.24,0.53));
}
const scareLight=new THREE.PointLight(0xff2a12,0,6,2); scareLight.position.set(0,0.1,0.5);
scare.add(scareLight);


/* =========================================================
   6c. HOUSE DRESSING v4  -  a more lived-in flat
========================================================= */
/* --- ceiling coving + a hairline water stain over the couch --- */
box(ROOM.w,0.06,0.12,M.wood,0,ROOM.h-0.05,-ROOM.d/2+0.12,0,false);
box(0.12,0.06,ROOM.d,M.wood,-ROOM.w/2+0.12,ROOM.h-0.05,0,0,false);
const stainTex=canvasTex(128,128,(c,w,h)=>{
  c.fillStyle='#3d3d46'; c.fillRect(0,0,w,h);
  for(let r=48;r>6;r-=6){ c.fillStyle='rgba(70,55,35,'+(0.05+(48-r)/48*0.22)+')';
    c.beginPath(); c.arc(w*0.5,h*0.5,r+Math.random()*6,0,7); c.fill(); }
});
box(2.4,0.02,2.0,std({map:stainTex,roughness:1,transparent:true,opacity:.9}),2.4,ROOM.h-0.11,2.6,0,false);

/* --- kitchen: wall calendar, kettle, hanging mugs --- */
const calTex=canvasTex(96,128,(c,w,h)=>{
  c.fillStyle='#e7e1cd'; c.fillRect(0,0,w,h);
  c.fillStyle='#7a2020'; c.fillRect(0,0,w,26);
  c.fillStyle='#efe9d6'; c.font='bold 15px monospace'; c.textAlign='center'; c.fillText('SEPT',w/2,18);
  c.fillStyle='#3a3a44'; c.font='9px monospace';
  for(let r=0;r<5;r++)for(let col=0;col<7;col++) c.fillText(String(r*7+col+1),8+col*12,42+r*17);
  c.strokeStyle='#a33'; c.lineWidth=2; c.beginPath(); c.arc(8+2*12,42+2*17-4,9,0,7); c.stroke();
});
box(0.02,0.46,0.34,std({map:calTex,roughness:.95}),-ROOM.w/2+0.13,1.7,3.9,0,false);
const kettle=new THREE.Group(); kettle.position.set(-2.35,0.93,3.45); scene.add(kettle);
kettle.add(mesh(new THREE.CylinderGeometry(0.11,0.13,0.2,14),M.metal,0,0.1,0));
kettle.add(mesh(new THREE.TorusGeometry(0.08,0.012,6,10),M.metal,0,0.24,0));
for(let i=0;i<3;i++){ const mug=box(0.09,0.09,0.09,std({color:[0x8a4a3a,0x3a5a6a,0xece6d2][i],roughness:.6}),
    -3.9+i*0.22,1.76,4.44,0,false); }

/* --- floor lamp by the couch (dim warm glow) --- */
const lamp=new THREE.Group(); lamp.position.set(3.9,0,3.4); scene.add(lamp);
lamp.add(mesh(new THREE.CylinderGeometry(0.16,0.2,0.05,12),M.dark,0,0.03,0));
lamp.add(mesh(new THREE.CylinderGeometry(0.02,0.02,1.5,8),M.metal,0,0.78,0));
lamp.add(mesh(new THREE.ConeGeometry(0.22,0.26,14,1,true),std({color:0xd8c69a,roughness:.8,side:THREE.DoubleSide,
  emissive:0xffca7a,emissiveIntensity:.5}),0,1.55,0));
const lampLight=new THREE.PointLight(0xffcf90,3.2,4.5,2); lampLight.position.set(3.9,1.5,3.4); scene.add(lampLight);
blk(3.9,3.4,0.2,0.2);

/* --- coffee table clutter: magazines + remote --- */
box(0.3,0.02,0.22,std({color:0x9a3a2a,roughness:.7}),1.35,0.49,1.7,0.3,false);
box(0.3,0.02,0.22,std({color:0x2a4a6a,roughness:.7}),1.42,0.51,1.68,0.15,false);
box(0.16,0.03,0.06,M.dark,1.9,0.49,1.55,0,false);

/* --- hallway: EXIT sign + peeling water stain + a fallen frame --- */
const exitTex=canvasTex(96,48,(c,w,h)=>{
  c.fillStyle='#0a0a0a'; c.fillRect(0,0,w,h);
  c.fillStyle='#39d06a'; c.font='bold 26px monospace'; c.textAlign='center'; c.fillText('EXIT',w/2,34);
});
const exitSign=box(0.5,0.24,0.06,std({map:exitTex,emissive:0x2fbf5c,emissiveIntensity:1.1,roughness:.5}),
  0,2.55,-6.6,0,false);
const exitLight=new THREE.PointLight(0x39d06a,0.8,3,2); exitLight.position.set(0,2.4,-6.6); scene.add(exitLight);
box(0.02,1.1,0.7,std({map:stainTex,roughness:1,transparent:true,opacity:.85}),-1.29,1.4,-11,Math.PI/2,false);
box(0.24,0.32,0.02,std({map:frameTex,roughness:.9}),0.9,0.06,-13.4,0.4,false); // knocked to the floor

/* --- doormat + keys dish by the front door --- */
box(0.9,0.02,0.5,std({color:0x3a352c,roughness:1}),0.4,0.02,-4.2,0,false);
box(0.16,0.04,0.16,std({color:0x6a6458,roughness:.4,metalness:.3}),0.9,0.04,-4.2,0,false);

/* =========================================================
   6d. ATMOSPHERE PARTICLES  (Three.js Points systems)
   - floating dust motes drifting through the flat
   - rain streaking down the kitchen window
   - occasional lightning flash + delayed thunder
========================================================= */
const dotSprite = canvasTex(32,32,(c,w,h)=>{
  const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
  g.addColorStop(0,'rgba(255,255,255,1)');
  g.addColorStop(0.4,'rgba(255,255,255,0.5)');
  g.addColorStop(1,'rgba(255,255,255,0)');
  c.fillStyle=g; c.fillRect(0,0,w,h);
});

/* --- dust motes (they catch the flashlight beautifully) --- */
const DUST_N=280;
const dustGeo=new THREE.BufferGeometry();
const dustPos=new Float32Array(DUST_N*3);
const dustVel=new Float32Array(DUST_N*3);
for(let i=0;i<DUST_N;i++){
  dustPos[i*3]  =(Math.random()-0.5)*(ROOM.w-0.6);
  dustPos[i*3+1]=0.15+Math.random()*(ROOM.h-0.35);
  dustPos[i*3+2]=-19+Math.random()*(ROOM.d/2+19);
  dustVel[i*3]  =(Math.random()-0.5)*0.05;
  dustVel[i*3+1]=(Math.random()-0.5)*0.03;
  dustVel[i*3+2]=(Math.random()-0.5)*0.05;
}
dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPos,3));
const dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({
  size:0.035, map:dotSprite, color:0xcdddff, transparent:true, opacity:0.45,
  depthWrite:false, blending:THREE.AdditiveBlending, sizeAttenuation:true }));
scene.add(dust);

/* --- rain on the window glass (room side, so you can see it) --- */
const RAIN_N=220;
const rainGeo=new THREE.BufferGeometry();
const rainPos=new Float32Array(RAIN_N*3);
const RAIN_X=ROOM.w/2-0.30;
for(let i=0;i<RAIN_N;i++){
  rainPos[i*3]  =RAIN_X-Math.random()*0.06;
  rainPos[i*3+1]=1.05+Math.random()*1.45;
  rainPos[i*3+2]=-3.15+Math.random()*2.25;
}
rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPos,3));
const rain=new THREE.Points(rainGeo,new THREE.PointsMaterial({
  size:0.05, map:dotSprite, color:0x9fb4d8, transparent:true, opacity:0.55,
  depthWrite:false, blending:THREE.AdditiveBlending }));
scene.add(rain);

let lightning=0, thunderT=6+Math.random()*10;
function updateAtmosphere(dt,t){
  /* dust drift */
  const dp=dustGeo.attributes.position.array;
  for(let i=0;i<DUST_N;i++){
    dp[i*3]  +=dustVel[i*3]  *dt + Math.sin(t*0.4+i)*0.0004;
    dp[i*3+1]+=dustVel[i*3+1]*dt;
    dp[i*3+2]+=dustVel[i*3+2]*dt;
    if(dp[i*3+1]<0.1)  dp[i*3+1]=ROOM.h-0.3;
    if(dp[i*3+1]>ROOM.h-0.2) dp[i*3+1]=0.15;
    if(dp[i*3]<-ROOM.w/2+0.3) dp[i*3]=ROOM.w/2-0.3;
    if(dp[i*3]> ROOM.w/2-0.3) dp[i*3]=-ROOM.w/2+0.3;
  }
  dustGeo.attributes.position.needsUpdate=true;
  dust.material.opacity=(S.power?0.45:0.3);
  /* rain fall (only visible while the curtain is open) */
  rain.visible=S.curtainOpen;
  if(rain.visible){
    const rp=rainGeo.attributes.position.array;
    for(let i=0;i<RAIN_N;i++){
      rp[i*3+1]-=dt*(1.4+ (i%5)*0.25);
      if(rp[i*3+1]<1.05){ rp[i*3+1]=2.5; rp[i*3+2]=-3.15+Math.random()*2.25; }
    }
    rainGeo.attributes.position.needsUpdate=true;
  }
  /* lightning: a quick moon-light pop, then thunder a beat later */
  thunderT-=dt;
  if(thunderT<=0 && S.mode==='play'){
    thunderT=9+Math.random()*16; lightning=1;
    setTimeout(()=>{ if(A.on) sfxNoise(1.1,90,0.7,'lowpass'); }, 500+Math.random()*900);
  }
  if(lightning>0){
    lightning=Math.max(0,lightning-dt*3.2);
    if(S.curtainOpen) moon.intensity = (S.power?1.1:0.22) + lightning*(Math.random()<0.5?3.5:1.2);
  }
}

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
  screech:()=>{ sfxNoise(0.9,2400,0.8,'highpass'); sfxTone(1600,0.7,'sawtooth',0.3,-900);
                sfxNoise(0.6,180,0.9,'lowpass'); },
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
  /* ---- night list (chores) + cupboard latch ---- */
  chores:{}, plateDirty:false, curtainOpen:true, bolted:false,
  latched:false, rattle:0, rattleAt:0, tried:false,
  /* ---- the window ---- */
  windowWatch:false, windowFace:0, windowPeeks:0, windowLatched:false,
  scareActive:false, scareDone:false, scareT:0, hard:false, upSeen:false,
  practice:false, freecam:false };
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
  S.freecam=false;
  S.mode='menu'; document.body.classList.remove('playing'); $('menu').style.display='flex';
  if(!IS_TOUCH) controls.unlock();
}
controls.addEventListener('lock',()=>{ S.mode='play'; document.body.classList.add('playing');
  $('menu').style.display='none'; });
controls.addEventListener('unlock',()=>{
  if(S.mode==='dead'||S.mode==='won') return;
  if(S.mode==='fin') return;
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
    turnCamera(dx*0.0045*SENS, dy*0.0045*SENS);
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
  press('bRun',   d=>{ if(S.hiding){ if(d) toggleLatch(); TOUCH.run=false; return; } TOUCH.run=d; });
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
$('btnSkip').onclick=()=>{ SFX.click(); audioInit(); startNight(false,true); };
$('btnRoom').onclick=()=>{ SFX.click(); audioInit(); jumpToRoom(); };
$('btnFreecam').onclick=()=>{ SFX.click(); audioInit(); startFreecam(); };
$('btnNightmare').onclick=()=>{ SFX.click(); audioInit(); startNight(false,false,true); };
$('btnStory').onclick=()=>{ SFX.click(); showPanel('pStory'); };
$('btnRules').onclick=()=>{ SFX.click(); showPanel('pRules'); };
$('btnHow').onclick  =()=>{ SFX.click(); showPanel('pHow'); };
$('btnRetro').onclick=()=>{ SFX.click(); retro=!retro;
  document.body.classList.toggle('retro',retro);
  $('retroState').textContent=retro?'ON':'OFF'; resize(); };
$('btnSound').onclick=()=>{ audioInit(); setSound(!A.on); SFX.click(); };

/* ---- PERFORMANCE MODE: drop bloom, shadow cost + pixel ratio for weak laptops ---- */
function applyPerf(announce){
  localStorage.setItem('mc_perf', PERF?'1':'0');
  if($('perfState')) $('perfState').textContent = PERF?'ON':'OFF';
  /* cheaper shadows */
  renderer.shadowMap.type = PERF ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
  const sz = PERF ? 1024 : (IS_TOUCH?512:2048);
  [bulb,moon].forEach(L=>{ if(L&&L.shadow){ L.shadow.mapSize.set(sz,sz);
    if(L.shadow.map){ L.shadow.map.dispose(); L.shadow.map=null; } } });
  /* the moon + flashlight shadows are the most expensive - drop them in perf mode */
  if(moon) moon.castShadow = !PERF;
  if(!IS_TOUCH && flashlight) flashlight.castShadow = !PERF;
  renderer.shadowMap.needsUpdate = true;
  resize();                                     // re-apply pixel-ratio cap
  if(announce && S.mode==='play') objective(PERF?'Performance mode ON - smoother, fewer effects.'
                                                :'Performance mode OFF.');
}
$('btnPerf').onclick=()=>{ SFX.click(); PERF=!PERF; applyPerf(true); };
applyPerf(false);

/* ---- PWA install button (shown once the browser offers a prompt) ---- */
if(window.__installEvt) $('btnInstall').style.display='';
$('btnInstall').onclick=async()=>{ SFX.click();
  const e=window.__installEvt; if(!e){ say&&null; return; }
  e.prompt(); try{ await e.userChoice; }catch(err){}
  window.__installEvt=null; $('btnInstall').style.display='none';
};

/* ---- SETTINGS: look sensitivity + brightness (persisted) ---- */
let SENS=parseFloat(localStorage.getItem('mc_sens')||'1');
let BRIGHT=parseFloat(localStorage.getItem('mc_bright')||'1');
const BASE_EXPOSURE=0.9;
function applySens(){ controls.pointerSpeed=SENS;
  $('optSens').value=SENS; $('optSensV').textContent=SENS.toFixed(1); }
function applyBright(){ renderer.toneMappingExposure=BASE_EXPOSURE*BRIGHT;
  $('optBright').value=BRIGHT; $('optBrightV').textContent=BRIGHT.toFixed(1); }
$('optSens').addEventListener('input',e=>{ SENS=parseFloat(e.target.value);
  localStorage.setItem('mc_sens',SENS); applySens(); });
$('optBright').addEventListener('input',e=>{ BRIGHT=parseFloat(e.target.value);
  localStorage.setItem('mc_bright',BRIGHT); applyBright(); });
applySens(); applyBright();

/* ---- ENDINGS DISCOVERED tracker (localStorage) ---- */
const END_DEFS=[
  {k:'survived', t:'NIGHT 1 SURVIVED'},
  {k:'guest',    t:'THE POLITE GUEST'},
  {k:'shoes',    t:"ADA'S SHOES"},
  {k:'waited',   t:'THE ONE WHO WAITED'},
  {k:'dark',     t:'DARK ADAPTED'},
  {k:'fourc',    t:'THE OPEN 4C DOOR'}
];
function getFound(){ try{ return JSON.parse(localStorage.getItem('mc_endings')||'{}'); }catch(e){ return {}; } }
function recordEnding(k){
  const f=getFound(); if(f[k]) return; f[k]=true;
  localStorage.setItem('mc_endings',JSON.stringify(f)); renderEndings();
}
function renderEndings(){
  const f=getFound();
  const n=END_DEFS.filter(e=>f[e.k]).length;
  $('endCount').textContent=n+' / '+END_DEFS.length;
  $('endList').innerHTML=END_DEFS.map(e=>
    '<div style="color:'+(f[e.k]?'#cdddff':'#4b5468')+'">'+
    (f[e.k]?'\u25c6 '+e.t:'\u25c7 ? ? ?')+'</div>').join('');
}
renderEndings();
document.querySelectorAll('[data-close]').forEach(el=>{
  el.onclick=()=>{ SFX.click(); hidePanel(); };
});
function showPanel(id){ S.overlay=id; $(id).style.display='block'; $('prompt').style.display='none'; }
function hidePanel(){
  if(!S.overlay) return;
  $(S.overlay).style.display='none'; S.overlay=null;
  if(S.mode==='play'&&!IS_TOUCH) controls.lock();
}
function startNight(practice,skip,hard){
  S.practice=!!practice; S.freecam=false; S.hard=!!hard;
  S.power=true; powerBack();
  S.minutes=0; S.timeCap=S.practice?0:4;      // 11:00 PM, stops at 11:04
  S.usedLight=false; S.knockDoor=null; S.knockN=0; S.dawnHide=0;
  finWorld.visible=false; fmon.visible=false;
  if(typeof finOut!=='undefined'&&finOut){ finOut.visible=false; if(outMon) outMon.visible=false; }
  if(typeof FO!=='undefined'&&FO&&FO.rainInt){ clearInterval(FO.rainInt); FO.rainInt=0; }
  S.dev=false; devRoom.visible=false;
  S.frontOpen=false; S.heatT=0; S.carrying=false;
  S.dawnWait=0; S._dawnWarned=false; S.fourCOpen=false;
  HALLD.t=0; HALLD.warn=0;
  S.chores={}; S.plateDirty=false; S.curtainOpen=true; S.bolted=false;
  S.latched=false; S.tried=false; S.rattle=0; showChores(false);
  S.windowWatch=false; S.windowFace=0; S.windowPeeks=0; S.windowLatched=false;
  watcher.visible=false; winFace.visible=false;
  doorPivot.rotation.y=0;
  S.scareActive=false; S.scareDone=false; S.scareT=0;
  scare.visible=false; scareLight.intensity=0;
  S.upSeen=false;
  mwGlass.material.emissiveIntensity=0; mwLight.intensity=0;
  hidePanel(); enterPlay();
  objective(S.practice?'PRACTICE - explore. Nothing comes tonight.'
                      :(S.hard?'NIGHTMARE - read the rules. It already knows you are here.'
                              :'Read the rules on the fridge'));
  if(S.hard) say('NIGHTMARE. It hunts faster tonight, and your nerve breaks sooner. Do not look.',5600);
  if(skip){
    say('Skipping ahead to 5:00 AM\u2026',2600);
    fallAsleep();
    return;
  }
  if(S.practice){
    say('Practice mode. The clock is frozen at 11:00 and the hallway is empty.',5200);
  } else {
    if(IS_TOUCH){
      say('Drag the right side to look, use the stick to walk.',4600);
    } else {
      /* opening narration -- story mode cold open */
      const intro=[
        ['11:00 PM. The deadbolt turns from the outside. Mom is gone until sunrise.',5200,0],
        ['Seven hours. Five rules on the fridge. One flashlight with a dying battery.',5200,5200],
        ['Two weeks ago Ada opened the door for a voice that sounded like Mom.',5200,10600],
        ['They only ever found her shoes. Still laced. Pointing at the wall.',5200,16000],
        ['Read the list out loud like Grandma said. Then do it, one line at a time.',5200,21400]
      ];
      intro.forEach(l=>setTimeout(()=>{ if(S.mode==='play'&&S.stage==='intro') say(l[0],l[1]); },l[2]));
    }
  }
}

/* =========================================================
   9b. FREE CAMERA MODE  (spectator fly-through, no danger)
========================================================= */
function startFreecam(){
  S.freecam=true; S.practice=false; S.hard=false;
  S.power=true; powerBack();
  S.frontOpen=true; S.hallLightOn=true; S.tvOn=true; S.curtainOpen=true;
  S.hiding=false; S.sitting=false; S.carrying=false; S.knocking=false;
  S.stage='freecam'; S.timeCap=null; S.minutes=0;
  S.nerve=100; S.battery=100;
  S.scareActive=false; S.scareDone=false; S.scareT=0; S.upSeen=false;
  entity.visible=false; entityEyes.intensity=0;
  devRoom.visible=false; S.dev=false;
  showChores(false);
  document.body.classList.remove('hiding');
  hidePanel(); enterPlay();
  camera.position.set(0,1.6,3.0);
  /* --- hidden bonus: the sealed LOCKED ROOM becomes explorable in camera mode --- */
  finWorld.visible=true; S._gTp=false;
  finDoorMesh.position.y=1.1; finDoorMesh.userData.opening=false;
  fmon.visible=true; fmon.position.set(FX,0,FZ_DOOR-34); fmon.rotation.y=0;
  fmon.lookAt(FX,1.4,0); fmonEyes.intensity=0.9;
  objective('FREE CAMERA \u2014 WASD fly \u00b7 SPACE up \u00b7 C/Ctrl down \u00b7 SHIFT faster \u00b7 [G] secret room');
  say('Free camera. Nothing can see you. Fly anywhere \u2014 the flat, the hallway, '+
      'even out through the walls. [F] light. Secret: press [G] to visit the LOCKED ROOM.',7200);
}
const FLY=new THREE.Vector3();
function freeMove(dt){
  if(S.mode!=='play'||S.overlay) return;
  let f=0,s=0,up=0;
  if(keys['KeyW']||keys['ArrowUp'])    f+=1;
  if(keys['KeyS']||keys['ArrowDown'])  f-=1;
  if(keys['KeyD']||keys['ArrowRight']) s+=1;
  if(keys['KeyA']||keys['ArrowLeft'])  s-=1;
  if(keys['Space']) up+=1;
  if(keys['ControlLeft']||keys['ShiftRight']||keys['KeyC']) up-=1;
  if(IS_TOUCH){
    if(Math.abs(TOUCH.my)>0.12) f+=-TOUCH.my;
    if(Math.abs(TOUCH.mx)>0.12) s+= TOUCH.mx;
    if(TOUCH.run) up+=1;
  }
  const fast=keys['ShiftLeft']?2.6:1;
  const spd=4.5*fast;
  camera.getWorldDirection(FLY); FLY.normalize();
  rightV.copy(FLY).cross(UP).normalize();
  const p=camera.position;
  p.x += (FLY.x*f + rightV.x*s)*spd*dt;
  p.z += (FLY.z*f + rightV.z*s)*spd*dt;
  p.y += (FLY.y*f + up)*spd*dt;
  p.y = THREE.MathUtils.clamp(p.y, 0.15, ROOM.h+6);
  /* secret warp: jump between the flat and the hidden locked room */
  if(keys['KeyG'] && !S._gTp){ S._gTp=true;
    const inRoom = Math.abs(p.x-FX) < 60;
    if(inRoom){ camera.position.set(0,1.6,3.0); say('Back to the flat.',1800); }
    else { camera.position.set(FX,1.6,1.4); say('The locked room. This is where it ends. Fly the corridor \u2014 the elevator is at the far end.',5200); }
  }
  if(!keys['KeyG']) S._gTp=false;
  $('state').textContent='free camera';
}

/* =========================================================
   10. INTERACTION (raycaster, 3 units)
========================================================= */
const ray=new THREE.Raycaster(); ray.far=3;
const CENTER=new THREE.Vector2(0,0);
let focus=null;
function labelFor(o){
  switch(o.userData.action){
    case 'finpad': return 'Press [E] to Use the Keypad';
    case 'switch': return 'Press [E] to Turn the Hallway Light '+(S.hallLightOn?'Off':'On');
    case 'tv':     return 'Press [E] to Turn the TV '+(S.tvOn?'Off':'On');
    case 'closet': return S.hiding?'Press [E] to Come Out':'Press [E] to Hide in the Cupboard';
    case 'phone':  return S.calling?'Press [E] to Answer the Phone':'Press [E] to Check the Phone';
    case 'couch':  if(S.stage==='chores') return choresLeft()===0?'Press [E] to Lie Down and Sleep'
                     :'Press [E] to Sit Down';
                   return S.carrying?'Press [E] to Sit Down and Eat':'Press [E] to Sit Down';
    case 'sink':   return S.plateDirty?'Press [E] to Rinse the Plate':'Press [E] to Run the Tap';
    case 'curtain':return S.curtainOpen?'Press [E] to Close the Curtain':'Press [E] to Open the Curtain';
    case 'windowlook': return S.curtainOpen?'Press [E] to Look Out the Window':'Press [E] to Draw the Curtain Back';
    case 'windowlatch':return S.windowLatched?'Press [E] to Unlatch the Window':'Press [E] to Latch the Window';
    case 'bolt':   return S.bolted?'Press [E] to Unlock the Deadbolt':'Press [E] to Turn the Deadbolt';
    case 'fridge': return 'Press [E] to Open the Fridge';
    case 'food':   return 'Press [E] to Take the Pizza';
    case 'door':   return S.stage==='dawn'?'Press [E] to Let Mom In'
                     :(S.frontOpen?'Press [E] to Shut the Front Door':'Press [E] to Open the Front Door');
    default:       return o.userData.label;
  }
}
function visOK(o){ let n=o; while(n){ if(!n.visible) return false; n=n.parent; } return true; }
function updateFocus(){
  if(S.mode!=='play'||S.overlay||S.freecam){ $('prompt').style.display='none'; focus=null; return; }
  if(S.hiding){
    focus=null;
    $('prompt').textContent = IS_TOUCH
      ? ('Tap USE to Come Out \u00b7 RUN = '+(S.latched?'Unlatch':'Latch'))
      : ('Press [E] to Come Out \u00b7 [Q] to '+(S.latched?'Unlatch the Doors':'Latch the Doors'));
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

/* =========================================================
   10b. THE NIGHT LIST (chores you must finish before sleeping)
========================================================= */
const CHORES=[
  {k:'plate',  t:'Rinse the plate in the sink'},
  {k:'curtain',t:'Close the curtain'},
  {k:'tv',     t:'Switch the TV off'},
  {k:'hall',   t:'Turn the hallway light off'}
];
function choresLeft(){ return CHORES.filter(c=>!S.chores[c.k]).length; }
function renderChores(){
  $('taskList').innerHTML = CHORES.map(c=>
    '<div class="'+(S.chores[c.k]?'d':'u')+'">'+(S.chores[c.k]?'\u2713 ':'\u25a1 ')+c.t+'</div>').join('');
}
function showChores(on){ $('tasks').classList[on?'add':'remove']('on'); }
function markChore(k,line){
  if(S.stage!=='chores'||S.chores[k]) return;
  S.chores[k]=true; renderChores(); SFX.click();
  if(line) say(line,4200);
  const left=choresLeft();
  if(left===0){
    objective('Lie down on the couch and sleep');
    setTimeout(()=>{ if(S.stage==='chores')
      say('The list is done. The flat is dark, shut, and quiet. Go to sleep.',5000); },1400);
  } else objective('Grandma\u2019s list \u2014 '+left+' left');
}
function beginChores(){
  S.stage='chores'; S.sitting=false; S.carrying=true; S.eatT=0;
  camera.position.set(2.6,1.55,2.55);
  S.chores={}; S.plateDirty=true; S.bolted=false; S.curtainOpen=true;
  S.tvOn=true; S.hallLightOn=true;                 // they came on while you ate
  SFX.flip();
  showChores(true); renderChores();
  objective('Grandma\u2019s list \u2014 '+CHORES.length+' left');
  say('You wake up on your own elbow. The TV is on. The hallway light is on. '+
      'You did not do that.',6000);
  setTimeout(()=>{ if(S.stage==='chores')
    say('Rule 6 is on the fridge: the list gets finished before you sleep.',4600); },6200);
}


function interact(){
  if(S.sitting){ return; }
  if(S.hiding){ leaveCloset(); return; }
  if(!focus) return;
  const hour=gameHour();
  switch(focus.userData.action){
    case 'finpad': openFinKeypad(); break;
    case 'fridge':
      if(S.stage==='getfood'){ S.fridgeOpen=true; setTimeout(()=>{ S.fridgeOpen=false; },2600);
        SFX.doorOpen(); takeMeal(); break; }
      if(S.carrying){ say('Your hands are full.'); break; }
      S.fridgeOpen=!S.fridgeOpen; SFX.doorOpen();
      say(S.fridgeOpen?'The fridge hums. Cold air rolls out over your feet.':'You close the fridge.',4200);
      if(S.fridgeOpen) setTimeout(()=>{ S.fridgeOpen=false; },2600);
      break;
    case 'rules':
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
    case 'lockedexit':
      if(S.stage==='descend' && !S.practice && !S.freecam){ beginFinale(); break; }
      SFX.doorOpen(); S.knockShake=0.6;
      say('The fire exit. Chained from the far side, padlocked, painted over. The EXIT sign hums but the door has not opened in years. There is no way down and out \u2014 only back up.',6200);
      break;
    case 'food':
      S.carrying=true; foodBox.visible=false; S.stage='couch';
      SFX.creak();
      say('Warm. Somebody carried it up four flights. Nobody opened the door.',5200);
      objective('Sit on the couch and eat');
      break;
    case 'couch': sitDown(); break;
    case 'sink':
      SFX.creak();
      if(S.plateDirty && S.stage==='chores'){
        S.plateDirty=false; S.carrying=false;
        markChore('plate','Cold water, ten seconds, plate on the rack. Something taps the pipe back.');
      } else say('The tap coughs, runs brown, then clears. You shut it off.');
      break;
    case 'curtain':
      S.curtainOpen=!S.curtainOpen; SFX.creak();
      if(!S.curtainOpen) markChore('curtain','The curtain closes. Rule 4: the window is not a door, but it watches like one.');
      else { if(S.stage==='chores'){ S.chores.curtain=false; renderChores(); }
        say('You pull the curtain back. The courtyard is four floors down and empty.'); }
      break;
    case 'windowlatch':
      S.windowLatched=!S.windowLatched; SFX.click();
      say(S.windowLatched
        ? 'You thumb the little brass latch across. It will not hold much — but it is shut.'
        : 'You flick the latch open. Cold night air finds the gap at once.',4200);
      break;
    case 'windowlook':
      if(!S.curtainOpen){
        S.curtainOpen=true; SFX.creak();
        if(S.stage==='chores'){ S.chores.curtain=false; renderChores(); }
        say('You draw the curtain back to see out. Rule says keep it shut — press [E] again to actually look.',4600);
        break;
      }
      if(S.windowWatch){ windowScare(); break; }
      SFX.creak();
      say(WINDOW_SAFE_LINES[(winLine++)%WINDOW_SAFE_LINES.length],5200);
      break;
    case 'bolt':
      if(S.frontOpen){ say('Shut the door before you try the bolt.'); break; }
      S.bolted=!S.bolted; SFX.click();
      if(S.bolted) say('The deadbolt goes over with a sound the whole floor can hear.');
      else { say('You slide the bolt back. That feels like a mistake.');
        say('You slide the bolt back. That feels like a mistake.'); }
      break;
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
      if(!S.hallLightOn) markChore('hall','You kill the hallway light. Rule 1 keeps its promise.');
      else if(S.stage==='chores'){ S.chores.hall=false; renderChores(); }
      say(S.hallLightOn?'The hallway light hums on. Rule 1: do not look down the hallway.'
                       :'The hallway goes dark again.');
      break;
    case 'tv':
      if(!S.power){ SFX.flip(); say('Dead screen. No power.'); break; }
      S.tvOn=!S.tvOn; SFX.flip();
      if(!S.tvOn) markChore('tv','The static dies. The room gets its own sounds back.');
      else if(S.stage==='chores'){ S.chores.tv=false; renderChores(); }
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
      if(S.frontOpen&&S.bolted){ S.bolted=false; }
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
  'No knock this time. Just the floor taking weight, one board at a time. HIDE.',
  'Three knocks, wet ones, from LOW on the door \u2014 knee height, like a child. HIDE.',
  'Three knocks in perfect time with your heartbeat. It has been listening. HIDE.',
  'No knock. The cupboard you are about to hide in creaks on its own first. HIDE ANYWAY.'
];
const ROUND_AFTER=[
  'It gives up on being polite. Come out.',
  'It walks off down the hall counting doors. 4C. 4D. 4E.',
  'Something wet is left on the floor where it stood. Do not touch it.',
  'It laughs with your mouth, badly, and stops. Come out.',
  'Footsteps go away down the hall. Then quiet. It is not done. Stay near the cupboard.',
  'A small hand-print fades off the cupboard door as you watch. Come out.',
  'It stops breathing on the other side. Which is worse. Come out.',
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
  if(S.stage==='chores'){
    if(choresLeft()>0){ say('Not yet. '+choresLeft()+' things on the list.',3600); return; }
    showChores(false); fallAsleep(); return;
  }
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
  setTimeout(()=>{ if(S.stage==='eating') beginChores(); },24000);
}
function skipBeat(){
  if(S.mode!=='play'||S.overlay||S.practice||S.freecam) return;
  const pre=['intro','getfood','heat','heating','collect','couch','eating','chores'];
  if(pre.indexOf(S.stage)<0){ say('Nothing to skip \u2014 the night is already here.'); return; }
  S.fridgeOpen=false; S.heatT=0;
  say('You skip ahead. Eyes heavy, you head for the couch\u2026',2600);
  fallAsleep();
}
function fallAsleep(){
  S.stage='sleep'; S.carrying=false; showChores(false);
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
  lampLight.intensity=0; exitLight.intensity=0.5;   // exit sign runs on its own battery
  M.screen.emissiveIntensity=0; tvLight.intensity=0;
  if(A.humGain) A.humGain.gain.value=0;
}
function powerBack(){
  S.power=true;
  ambient.intensity=0.85; hemi.intensity=0.8;
  bulb.intensity=14; counterLight.intensity=6; hallGlow.intensity=2.2;
  moon.intensity=1.1; glassBulb.material.emissiveIntensity=2.4;
  lampLight.intensity=3.2; exitLight.intensity=0.8;
  scene.fog.density=0.03;
}
function momArrives(){
  if(S.mode!=='play') return;
  if(!S.usedLight && !S.practice){ secretEnding('dark'); return; }
  S.stage='credits'; S.mode='won';
  S.hiding=false; document.body.classList.remove('hiding');
  recordEnding('survived');
  powerBack(); SFX.doorOpen(); SFX.win();
  entity.visible=false; entityEyes.intensity=0;
  document.body.classList.remove('playing');
  $('prompt').style.display='none'; $('timer').style.display='none';
  if(!IS_TOUCH) controls.unlock();
  $('menu').style.display='none';
  { const kt=$('knockTally'); if(kt) kt.textContent=String(S.ROUNDS); }
  setTimeout(()=>{ $('credits').style.display='block'; },900);
}

/* ---- after the LAST hide round: the knocking stops and you must go down ---- */
function enterDescent(){
  if(S.mode!=='play') return;
  S.stage='descend';
  S.hideWindow=0; S.hiddenFor=0; S.safe=false; S.hiding=false; S.rattle=0; S.tried=false;
  document.body.classList.remove('hiding');
  $('timer').style.display='none';
  entity.visible=false; entityEyes.intensity=0;
  objective('The knocking stopped. Mom never came. Go down the hall to the basement and try the fire exit.');
  say('The knocking stops. You wait for Mom. She does not knock. Then \u2014 a noise, low and wet, down the stairwell. Go down.',6000);
  SFX.creak();
}

/* =========================================================
   THE WAY OUT — dream / void / puzzle / chase finale
   Triggered when the fire exit is opened after the last hide round.
========================================================= */
/* ============================================================
   REAL 3D FINALE  \u2014 a physical locked room + a physical chase
   (built far from the flat so it never touches the main level)
============================================================ */
const FX=340;                          // world x-offset for the whole finale
const FR={hw:4.2, hd:4.2, h:3};        // locked-room half sizes
const FCOR={hw:1.8, len:90, h:2.6};    // corridor half-width, run length (m), height
const FZ_DOOR=-FR.hd;                   // north wall / room door plane
const FZ_END = FZ_DOOR - FCOR.len;      // end door plane (= -94.2)
const finWorld=new THREE.Group(); finWorld.visible=false; scene.add(finWorld);
const finMat={
  wall : std({color:0x2c2c34, roughness:.95}),
  wall2: std({color:0x232329, roughness:.96}),
  floor: std({color:0x1b1b21, roughness:.92}),
  ceil : std({color:0x141419, roughness:.98}),
  crate: std({color:0x7a5a34, roughness:.85}),
  crate2:std({color:0x8c6a3e, roughness:.8}),
  cab  : std({color:0x39434e, roughness:.65, metalness:.25}),
  cabD : std({color:0x2a323b, roughness:.7}),
  metal: std({color:0xb9bcc2, roughness:.3, metalness:.85}),
  pad  : std({color:0x0e1116, roughness:.5}),
  green: std({color:0x0a0a0d, emissive:0x27d69a, emissiveIntensity:1.1}),
  red  : std({color:0x120404, emissive:0xff2a1e, emissiveIntensity:1.3})
};
function fbox(w,h,d,m,x,y,z,ry){ const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);
  o.position.set(FX+x,y,z); o.rotation.y=ry||0; o.castShadow=true; o.receiveShadow=true;
  finWorld.add(o); return o; }

/* ---- the locked room ---- */
fbox(FR.hw*2,0.2,FR.hd*2, finMat.floor, 0,-0.1,0);
fbox(FR.hw*2,0.2,FR.hd*2, finMat.ceil , 0,FR.h,0);
fbox(FR.hw*2,FR.h,0.2, finMat.wall , 0,FR.h/2, FR.hd);            // south wall
fbox(0.2,FR.h,FR.hd*2, finMat.wall2, -FR.hw,FR.h/2,0);            // west wall
fbox(0.2,FR.h,FR.hd*2, finMat.wall2,  FR.hw,FR.h/2,0);            // east wall
// north wall with a 1.5m door gap
fbox(FR.hw-0.75,FR.h,0.2, finMat.wall, -(FR.hw+0.75)/2,FR.h/2, FZ_DOOR);
fbox(FR.hw-0.75,FR.h,0.2, finMat.wall,  (FR.hw+0.75)/2,FR.h/2, FZ_DOOR);
fbox(1.7,FR.h-2.2,0.2, finMat.wall, 0, 2.2+(FR.h-2.2)/2, FZ_DOOR); // lintel
fbox(0.14,2.25,0.22, finMat.metal, -0.78,1.12, FZ_DOOR);          // frame L
fbox(0.14,2.25,0.22, finMat.metal,  0.78,1.12, FZ_DOOR);          // frame R
// the room door leaf (slides UP to open; animated in updateFin)
const finDoorMesh=fbox(1.46,2.2,0.12, finMat.metal, 0,1.1, FZ_DOOR+0.02);
finDoorMesh.userData.opening=false;
// keypad panel beside the door
const finPadBox=fbox(0.42,0.66,0.12, finMat.pad, 1.15,1.32, FZ_DOOR+0.14);
const finPadScr=fbox(0.3,0.2,0.04, finMat.green, 1.15,1.5, FZ_DOOR+0.21);
tag(finPadBox,'finpad','Press [E] to Use the Keypad');
tag(finPadScr,'finpad','Press [E] to Use the Keypad');

/* ---- CLUE OBJECTS : 4 boxes, 3 cupboards, 0 dirty plates ---- */
// 4 cardboard boxes
fbox(0.8,0.8,0.8, finMat.crate,  -3.0,0.4,-2.4);
fbox(0.7,0.7,0.7, finMat.crate2, -3.1,1.15,-2.5);
fbox(0.9,0.9,0.9, finMat.crate,   2.9,0.45,-2.2);
fbox(0.75,0.75,0.75, finMat.crate2, 0.4,0.4, 2.9, 0.5);
// 3 cupboards / cabinets along the walls
function finCab(x,z,ry){ fbox(0.9,2.0,0.55, finMat.cab, x,1.0,z,ry);
  fbox(0.86,0.06,0.5, finMat.cabD, x,1.32,z + (Math.cos(ry||0)*0.28), ry);
  fbox(0.05,0.14,0.05, finMat.metal, x + (Math.cos(ry||0)*0.42), 1.15, z + (Math.sin(ry||0)*0.42), ry); }
finCab(-3.6, 1.2, 0);
finCab( 3.6, 1.2, 0);
finCab(-1.6,-3.6, 0);
// (dirty plates: none \u2014 that is the 0)

/* ---- the run corridor ---- */
const _cm=FZ_DOOR-FCOR.len/2;
fbox(FCOR.hw*2,0.2,FCOR.len, finMat.floor, 0,-0.1,_cm);
fbox(FCOR.hw*2,0.2,FCOR.len, finMat.ceil , 0,FCOR.h,_cm);
fbox(0.2,FCOR.h,FCOR.len, finMat.wall2, -FCOR.hw,FCOR.h/2,_cm);
fbox(0.2,FCOR.h,FCOR.len, finMat.wall2,  FCOR.hw,FCOR.h/2,_cm);
// end wall wrapped around a 1.7 m ELEVATOR opening (the real way out)
fbox(0.95,FCOR.h,0.2, finMat.wall, -1.325,FCOR.h/2, FZ_END);
fbox(0.95,FCOR.h,0.2, finMat.wall,  1.325,FCOR.h/2, FZ_END);
fbox(1.7,FCOR.h-2.2,0.2, finMat.wall, 0,2.2+(FCOR.h-2.2)/2, FZ_END); // lintel
// brushed-metal frame around the opening
fbox(0.1,2.25,0.24, finMat.metal, -0.9,1.12, FZ_END);
fbox(0.1,2.25,0.24, finMat.metal,  0.9,1.12, FZ_END);
fbox(1.94,0.12,0.24, finMat.metal, 0,2.25, FZ_END);
// the elevator CAR, recessed behind the wall
const EVZ=FZ_END-2.0, EVC=FZ_END-1.0;
fbox(1.76,0.16,2.0, finMat.metal, 0,0.04,EVC);                     // car floor
fbox(1.76,0.14,2.0, std({color:0x22262d,roughness:.6}), 0,2.34,EVC); // car ceiling
fbox(0.12,2.3,2.0, finMat.cab, -0.86,1.15,EVC);                    // car left wall
fbox(0.12,2.3,2.0, finMat.cab,  0.86,1.15,EVC);                    // car right wall
fbox(1.76,2.3,0.1, std({color:0x323942,roughness:.35,metalness:.55}), 0,1.15,EVZ); // car back
const evArrow=fbox(0.5,0.2,0.05, std({color:0x0a0a0d,emissive:0x27d69a,emissiveIntensity:1.4}), 0,2.1,EVZ+0.08);
// two sliding doors at the opening (start OPEN, retracted into the pockets)
fbox(1.1,0.26,0.06, std({color:0x0a0a0d,emissive:0x38e0a0,emissiveIntensity:1.6}), 0,2.44, FZ_END+0.12); // EXIT call sign
const evL=fbox(0.87,2.2,0.09, finMat.metal, -1.34,1.1, FZ_END+0.05);
const evR=fbox(0.87,2.2,0.09, finMat.metal,  1.34,1.1, FZ_END+0.05);
evL.userData.closed=-0.435; evL.userData.open=-1.34;
evR.userData.closed= 0.435; evR.userData.open= 1.34;
// warm light spilling out of the car
const evLight=new THREE.PointLight(0xffe9c4, 9.0, 13, 2);
evLight.position.set(FX,2.1,EVC); finWorld.add(evLight);
// dim service lights down the corridor
const finCorLights=[];
for(let i=1;i<=Math.floor(FCOR.len/18);i++){
  const lz=FZ_DOOR - i*18;
  fbox(0.5,0.06,0.2, std({color:0x0a0a0c,emissive:0xffe6b0,emissiveIntensity:.8}), 0,FCOR.h-0.12,lz);
  const pl=new THREE.PointLight(0xffd9a0, 3.2, 11, 2); pl.position.set(FX,FCOR.h-0.3,lz);
  finWorld.add(pl); finCorLights.push(pl);
}
const finEndLight=new THREE.PointLight(0xffd9a0, 6.0, 20, 2);
finEndLight.position.set(FX,1.8,FZ_END+1.4); finWorld.add(finEndLight);
// room bulb
const finBulb=new THREE.PointLight(0xffdca8, 9, 16, 2);
finBulb.position.set(FX,FR.h-0.4,0); finWorld.add(finBulb);
const finFill=new THREE.PointLight(0x8fa6c0, 1.6, 20, 2);
finFill.position.set(FX,1.6,FZ_DOOR-3); finWorld.add(finFill);

/* ---- APARTMENT 4C : the door you come back to after the elevator ---- */
const Z4C = FZ_DOOR - 45;                 // partway down the corridor, on the west wall
// black void behind the door (revealed when it slides open)
fbox(0.05,2.02,0.94, std({color:0x000000, roughness:1}), -FCOR.hw-0.02, 1.0, Z4C);
// door frame
fbox(0.16,2.34,1.16, finMat.metal, -FCOR.hw+0.02, 1.17, Z4C);
// the 4C door leaf (slides along +z into its pocket when it opens)
const fourcDoor = fbox(0.1,2.05,0.9, std({color:0x3a2c22, roughness:.9}), -FCOR.hw+0.1, 1.03, Z4C);
fourcDoor.userData.opening=false; fourcDoor.userData.z0=Z4C;
// door handle
fbox(0.06,0.1,0.1, finMat.metal, -FCOR.hw+0.16, 1.02, Z4C+0.32);
// glowing "4C" number plate
const fourcSign = fbox(0.04,0.3,0.36, std({color:0x0a0a0d, emissive:0x38e0a0, emissiveIntensity:1.4}), -FCOR.hw+0.14, 1.95, Z4C);
// beacon light at the door + a hidden red eye that wakes at the reveal
const fourcLight = new THREE.PointLight(0x38e0a0, 0, 7, 2);
fourcLight.position.set(FX-FCOR.hw+0.6, 1.7, Z4C); finWorld.add(fourcLight);
const fourcEye = new THREE.PointLight(0xff2a1e, 0, 5, 2);
fourcEye.position.set(FX-FCOR.hw-0.3, 1.6, Z4C); finWorld.add(fourcEye);
// ---- residential HALLWAY dressing (only shown when you come back) ----
const hallDress=new THREE.Group(); hallDress.visible=false; finWorld.add(hallDress);
function hbox(w,h,d,m,x,y,z,ry){ const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);
  o.position.set(FX+x,y,z); o.rotation.y=ry||0; hallDress.add(o); return o; }
// warm carpet runner down the middle of the corridor
hbox(1.05,0.02,46, std({color:0x3a1f1c, roughness:1}), 0,0.02, Z4C-8);
// three neighbour doors leading up to 4C, each with a warm sconce
[['4F',Z4C-18],['4E',Z4C-12],['4D',Z4C-6]].forEach(function(e){
  const z=e[1];
  hbox(0.16,2.3,1.12, std({color:0x2a2320, roughness:.9}), -FCOR.hw+0.02,1.15,z);   // frame
  hbox(0.1,2.02,0.82, std({color:0x3a2c22, roughness:.92}), -FCOR.hw+0.1,1.02,z);    // leaf
  hbox(0.05,0.24,0.3, std({color:0x0a0a0d, emissive:0x151519, emissiveIntensity:.4}), -FCOR.hw+0.14,1.92,z); // dark number plate
  hbox(0.12,0.18,0.12, std({color:0x1a1712, emissive:0xffb060, emissiveIntensity:.9}), -FCOR.hw+0.22,2.22,z); // sconce
  const sc=new THREE.PointLight(0xffb060, 1.7, 7, 2); sc.position.set(FX-FCOR.hw+0.55,2.15,z); hallDress.add(sc);
});

/* ===== OUTSIDE : the rainy street & the waiting car (final escape) ===== */
const OX=FX;
const CARZ=57;
const finOut=new THREE.Group(); finOut.visible=false; scene.add(finOut);
function obox(w,h,d,m,x,y,z,ry){ const o=new THREE.Mesh(B(w,h,d),m); o.position.set(OX+x,y,z); o.rotation.y=ry||0; finOut.add(o); return o; }
// wet asphalt + kerb
obox(42,0.2,66, std({color:0x0d0f13, roughness:.35, metalness:.5}), 0,-0.1,52);
obox(42,0.12,6, std({color:0x1a1c20, roughness:.9}), 0,0.02,41);
// the building facade you just came out of
obox(20,7,0.5, std({color:0x16171c, roughness:.95}), 0,3.5,39);
obox(2.0,3.0,0.3, std({color:0x2a2622, roughness:.9}), 0,1.5,38.9);
obox(1.7,2.7,0.2, std({color:0x0a0a0d, emissive:0x2a1c10, emissiveIntensity:.7}), 0,1.45,38.75);
const doorGlow=new THREE.PointLight(0xffcaa0, 4.0, 15, 2); doorGlow.position.set(OX,2.0,40.4); finOut.add(doorGlow);
obox(1.4,1.2,0.2, std({color:0x0c0e12, emissive:0x0a0c10, emissiveIntensity:.3}), -6,4.3,38.9);
obox(1.4,1.2,0.2, std({color:0x0c0e12, emissive:0x0a0c10, emissiveIntensity:.3}),  6,4.3,38.9);
// ---- the CAR (long axis along X) ----
const carMat=std({color:0x2a2e36, roughness:.35, metalness:.7});
const glassMat=std({color:0x05070b, roughness:.1, metalness:.4, emissive:0x0a1018, emissiveIntensity:.3});
obox(4.4,0.8,1.9, carMat, 0,0.75,CARZ);
obox(2.6,0.75,1.7, carMat, 0,1.4,CARZ);
obox(2.5,0.6,0.05, glassMat, 0,1.42,CARZ-0.86);
obox(2.5,0.6,0.05, glassMat, 0,1.42,CARZ+0.86);
obox(0.05,0.55,1.55, glassMat, -1.32,1.42,CARZ);
obox(0.05,0.55,1.55, glassMat,  1.32,1.42,CARZ);
[[-1.5,CARZ-0.95],[-1.5,CARZ+0.95],[1.5,CARZ-0.95],[1.5,CARZ+0.95]].forEach(function(w){
  const t=new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.42,0.3,16), std({color:0x0a0a0c,roughness:.9}));
  t.rotation.z=Math.PI/2; t.position.set(OX+w[0],0.42,w[1]); finOut.add(t); });
obox(0.08,0.22,0.3, std({color:0xfff4d6, emissive:0xfff0cf, emissiveIntensity:2.2}), -2.18,0.8,CARZ-0.5);
obox(0.08,0.22,0.3, std({color:0xfff4d6, emissive:0xfff0cf, emissiveIntensity:2.2}), -2.18,0.8,CARZ+0.5);
obox(0.08,0.2,0.28, std({color:0x400000, emissive:0xff2a1e, emissiveIntensity:1.4}), 2.18,0.85,CARZ-0.5);
obox(0.08,0.2,0.28, std({color:0x400000, emissive:0xff2a1e, emissiveIntensity:1.4}), 2.18,0.85,CARZ+0.5);
const carHead=new THREE.SpotLight(0xfff2d0, 0, 24, Math.PI/6, .5, 1.5); carHead.position.set(OX-2.2,0.9,CARZ); carHead.target.position.set(OX-18,0,CARZ); finOut.add(carHead); finOut.add(carHead.target);
const carInside=new THREE.PointLight(0xffcf9a, 0, 5, 2); carInside.position.set(OX,1.3,CARZ); finOut.add(carInside);
// streetlight + cold moon fill
obox(0.14,6,0.14, std({color:0x1a1c20}), -11,3,50);
obox(1.4,0.2,0.5, std({color:0x1a1c20}), -10.5,5.9,50);
const streetLamp=new THREE.PointLight(0xffd9a0, 5.0, 26, 2); streetLamp.position.set(OX-10.2,5.7,50); finOut.add(streetLamp);
const moonFill=new THREE.PointLight(0x5b6b90, 2.2, 70, 2); moonFill.position.set(OX,22,55); finOut.add(moonFill);
// ---- rain ----
const oRainN=1600; const oRainGeo=new THREE.BufferGeometry(); const oRainPos=new Float32Array(oRainN*3);
for(let i=0;i<oRainN;i++){ oRainPos[i*3]=OX+(Math.random()-0.5)*44; oRainPos[i*3+1]=Math.random()*16; oRainPos[i*3+2]=52+(Math.random()-0.5)*64; }
oRainGeo.setAttribute('position', new THREE.BufferAttribute(oRainPos,3));
const oRain=new THREE.Points(oRainGeo, new THREE.PointsMaterial({color:0xaebfd6, size:0.05, transparent:true, opacity:.5, depthWrite:false}));
finOut.add(oRain);
// ---- the thing in the doorway (softened, not scary) ----
const outMon=new THREE.Group(); outMon.visible=false; finOut.add(outMon);
const omMat=std({color:0x1a1720, roughness:.98});
outMon.add(mesh(B(0.55,1.2,0.32), omMat, 0,1.15,0));
const omHead=mesh(B(0.32,0.4,0.3), std({color:0x8f8574, roughness:.7}), 0,1.92,0); outMon.add(omHead);
const omArmL=new THREE.Group(); omArmL.position.set(-0.36,1.6,0); outMon.add(omArmL); omArmL.add(mesh(B(0.1,1.0,0.1),omMat,0,-0.5,0));
const omArmR=new THREE.Group(); omArmR.position.set(0.36,1.6,0); outMon.add(omArmR); omArmR.add(mesh(B(0.1,1.0,0.1),omMat,0,-0.5,0));
outMon.add(mesh(B(0.13,1.05,0.13),omMat,-0.15,0.52,0));
outMon.add(mesh(B(0.13,1.05,0.13),omMat, 0.15,0.52,0));
outMon.position.set(OX,0,40.2); outMon.rotation.y=Math.PI; omHead.rotation.x=0.18;

/* ---- the thing that wakes up and chases you ---- */
const fmon=new THREE.Group();
const fmBody=new THREE.Group(); fmBody.position.y=0; fmon.add(fmBody);
fmBody.add(mesh(B(0.55,1.15,0.32), std({color:0x120f18,roughness:.98}), 0,1.15,0));
const fmHead=mesh(B(0.34,0.42,0.3), std({color:0xc9bfa8,roughness:.55,emissive:0x241610,emissiveIntensity:.4}), 0,1.95,0); fmBody.add(fmHead);
fmHead.add(mesh(B(0.1,0.06,0.03), std({color:0x060608}), -0.08,0.04,0.15));
fmHead.add(mesh(B(0.1,0.06,0.03), std({color:0x060608}),  0.08,0.04,0.15));
const fmArmL=new THREE.Group(); fmArmL.position.set(-0.36,1.6,0); fmBody.add(fmArmL);
fmArmL.add(mesh(B(0.1,1.0,0.1), std({color:0x120f18}), 0,-0.5,0));
const fmArmR=new THREE.Group(); fmArmR.position.set( 0.36,1.6,0); fmBody.add(fmArmR);
fmArmR.add(mesh(B(0.1,1.0,0.1), std({color:0x120f18}), 0,-0.5,0));
const fmLegL=new THREE.Group(); fmLegL.position.set(-0.15,1.05,0); fmBody.add(fmLegL);
fmLegL.add(mesh(B(0.13,1.05,0.13), std({color:0x120f18}), 0,-0.52,0));
const fmLegR=new THREE.Group(); fmLegR.position.set( 0.15,1.05,0); fmBody.add(fmLegR);
fmLegR.add(mesh(B(0.13,1.05,0.13), std({color:0x120f18}), 0,-0.52,0));
fmon.scale.setScalar(1.0); fmon.visible=false; finWorld.add(fmon);
const fmonEyes=new THREE.PointLight(0xff4326, 0, 6, 2);
fmonEyes.position.set(0,2.0,0.2); fmon.add(fmonEyes);
let fmWalk=0;
function animateFmon(dt){ fmWalk+=dt*10;
  const s=Math.sin(fmWalk)*0.6, c=Math.cos(fmWalk)*0.6;
  fmLegL.rotation.x=s; fmLegR.rotation.x=-s;
  fmArmL.rotation.x=-s*0.8; fmArmR.rotation.x=s*0.8;
  fmBody.position.y=Math.abs(Math.sin(fmWalk))*0.05; }

const FIN={raf:0,code:'',dist:0,mon:0,running:false,grace:0,held:false,last:0,padBuilt:false,
           whoosh:0,foot:0,kd:null,ku:null};
function finMsg(txt){ const m=$('finMsg'); if(!m) return; m.textContent=txt||''; m.style.opacity=txt?1:0; }
function finShow(id,on){ const e=$(id); if(!e) return; const disp=(id==='finRoom')?'flex':'block'; e.style.display=on?disp:'none'; }
function finCodeShow(){ let d=FIN.code.split(''); while(d.length<3) d.push('\u00b7'); $('finCode').textContent=d.join(''); }

function jumpToRoom(){
  $('menu').style.display='none';
  $('timer').style.display='none';
  finEnter3DRoom();
}
function beginFinale(){
  if(S.mode!=='play') return;
  S.mode='finale'; S.stage='finale'; S.overlay='finale';
  S.hiding=false; document.body.classList.remove('hiding','playing');
  entity.visible=false; entityEyes.intensity=0;
  scare.visible=false; scareLight.intensity=0;
  $('prompt').style.display='none'; $('timer').style.display='none';
  if(!IS_TOUCH){ try{ controls.unlock(); }catch(e){} }
  SFX.doorOpen();
  $('fin').classList.add('on');
  finVoidPhase();
}

/* PHASE 1 — the exit opens on nothing: you float, then rush through the void */
function finVoidPhase(){
  finShow('finVoid',true); finShow('finDream',false); finShow('finRoom',false); finShow('finChase',false);
  $('finEnd').style.display='none'; $('finScare').style.opacity=0;
  const v=$('finVoid'); v.style.opacity=0;
  const holder=$('finStreaks'); holder.innerHTML='';
  for(let i=0;i<52;i++){ const s=document.createElement('div'); s.className='streak';
    s.style.transform='rotate('+(i/52*360)+'deg)';
    s.style.animationDelay=(-Math.random()*1.1)+'s';
    s.style.opacity=String(0.25+Math.random()*0.6); holder.appendChild(s); }
  requestAnimationFrame(()=>{ v.style.opacity=1; });
  vFlash();
  finMsg('The fire exit opens on nothing. You step out, and there is no floor.');
  let n=0; FIN.whoosh=setInterval(()=>{ sfxNoise(0.5,110+n*28,0.28,'lowpass'); n=(n+1)%9; },430);
  setTimeout(()=>finMsg('You are falling. Or floating. Everything rushes past, faster and faster.'),3300);
  setTimeout(()=>{ clearInterval(FIN.whoosh); finDreamPhase(); },7200);
}

/* PHASE 2 — the dream reveal: you were asleep the whole time */
function finDreamPhase(){
  const v=$('finVoid'); v.style.opacity=0;
  setTimeout(()=>finShow('finVoid',false),1000);
  finShow('finDream',true);
  const d=$('finDream'); d.style.opacity=0; requestAnimationFrame(()=>{ d.style.opacity=1; });
  finMsg(''); SFX.creak();
  setTimeout(()=>finMsg('You see yourself. Asleep on the couch. You never got up tonight.'),1300);
  setTimeout(()=>finMsg('None of it happened. You have been asleep the whole time\u2026'),4800);
  setTimeout(()=>finJumpscare(),8600);
}

/* PHASE 3 — a door opens in the dark, and something lunges */
function finJumpscare(){
  finMsg('A door opens somewhere in the dark.');
  setTimeout(()=>{
    $('finScare').style.opacity=1; vFlash(); SFX.screech();
    if(navigator.vibrate) navigator.vibrate(220);
    setTimeout(()=>{ $('finScare').style.opacity=0; finRoomPhase(); },950);
  },1900);
}

/* PHASE 4 — wake in a locked room: count the objects for the code (4,3,0 -> 430) */
function finBuildPad(){}

/* ================= REAL 3D LOCKED ROOM + CHASE ================= */
function finEnter3DRoom(){
  // leave the surreal HTML overlay behind, show the real 3D world
  $('fin').classList.remove('on');
  ['finVoid','finDream','finRoom','finChase','finScare','finEnd'].forEach(id=>{ const e=$(id); if(e) e.style.display='none'; });
  finMsg('');
  finWorld.visible=true;
  fmon.visible=false; fmonEyes.intensity=0;
  finDoorMesh.position.y=1.1; finDoorMesh.userData.opening=false;
  FIN.code=''; FIN.solved=false; FIN.grace=0; FIN.monSpd=0;
  S.hiding=false; S.sitting=false; S.frontOpen=false; S.curtainOpen=false; S.dev=false;
  document.body.classList.remove('hiding'); document.body.classList.add('playing');
  S.mode='play'; S.stage='froom'; S.overlay=null;
  camera.position.set(FX,1.55,FR.hd-1.0);
  camera.lookAt(FX,1.45,FZ_DOOR);
  $('vblood').style.opacity='0'; $('prompt').style.display='none';
  if(!IS_TOUCH){ try{ controls.lock(); }catch(e){} }
  objective('Find the 3-digit code, then open the door');
  say('You wake on a cold floor. A locked door, a keypad. Count what is here \u2014 boxes, then cupboards, then dirty plates.',6200);
}
// finRoomPhase is the hook the dream/jumpscare and the menu shortcut call
function finRoomPhase(){ finEnter3DRoom(); }

/* ---- compact keypad popup (code entry only) ---- */
function fkBuild(){
  if(FIN.padBuilt) return; FIN.padBuilt=true;
  const pad=$('fkPad'); const ks=['1','2','3','4','5','6','7','8','9','C','0','E'];
  ks.forEach(k=>{ const b=document.createElement('button'); b.className='finBtn';
    b.textContent = k==='E'?'ENTER':(k==='C'?'CLR':k);
    if(k==='E') b.classList.add('wide');
    b.addEventListener('click',()=>fkKey(k)); pad.appendChild(b); });
}
function fkShow(){ let d=FIN.code.split(''); while(d.length<3) d.push('\u00b7'); $('fkCode').textContent=d.join(''); }
function openFinKeypad(){
  fkBuild(); FIN.code=''; fkShow();
  $('fkMsg').textContent='A 3-digit keypad. Boxes, then cupboards, then dirty plates.';
  S.overlay='finKeypad'; $('finKeypad').style.display='flex'; $('prompt').style.display='none';
  if(!IS_TOUCH){ try{ controls.unlock(); }catch(e){} }
}
function closeFinKeypad(){
  $('finKeypad').style.display='none'; S.overlay=null;
  if(!IS_TOUCH && S.mode==='play'){ try{ controls.lock(); }catch(e){} }
}
function fkKey(k){
  if(k==='C'){ FIN.code=''; SFX.click(); fkShow(); return; }
  if(k==='E'){ fkTry(); return; }
  if(FIN.code.length<3){ FIN.code+=k; SFX.click(); fkShow(); }
}
function fkTry(){
  if(FIN.code==='430'){
    SFX.win(); $('fkMsg').textContent='The lock clicks open\u2026';
    setTimeout(()=>{ $('finKeypad').style.display='none'; S.overlay=null; finChasePhase(); },900);
  } else {
    SFX.hit(); $('fkMsg').textContent='Wrong. Count again \u2014 boxes, cupboards, dirty plates.';
    FIN.code=''; fkShow();
  }
}

/* ---- PHASE 5 : the real 3D chase down the corridor ---- */
function finChasePhase(){
  FIN.solved=true;
  finDoorMesh.userData.opening=true;
  SFX.doorOpen();
  camera.position.set(FX,1.55,FZ_DOOR-1.4);
  camera.lookAt(FX,1.45,FZ_END);
  fmon.visible=true; fmonEyes.intensity=2.4;
  fmon.position.set(FX,0,FZ_DOOR+1.6); fmon.rotation.y=Math.PI;
  FIN.grace=3.5; FIN.monSpd=0;
  S.stage='fchase'; S.mode='play'; S.overlay=null;
  $('vblood').style.opacity='0.2';
  if(!IS_TOUCH){ try{ controls.lock(); }catch(e){} }
  objective('RUN to the elevator at the end. Do not stop.');
  say('The door opens on a black corridor. Something behind you wakes up. RUN.',4600);
}

/* driven from the main animate() loop */
function updateFin(dt,t){
  if(S.stage!=='froom' && S.stage!=='fchase' && S.stage!=='fev' && S.stage!=='fback') return;
  scene.fog.density=0.026;                       // keep the finale navigable
  if(finDoorMesh){
    const tgt=(S.stage==='fchase'||finDoorMesh.userData.opening)?3.3:1.1;
    finDoorMesh.position.y += (tgt-finDoorMesh.position.y)*Math.min(1,dt*3);
  }
  if(finBulb) finBulb.intensity=9+Math.sin(t*7)*1.2+(Math.random()<0.02?-5:0);
  if(S.stage==='fev'){ updateElevator(dt,t); return; }
  if(S.stage==='fback'){ updateFback(dt,t); return; }
  if(S.stage!=='fchase') return;
  const p=camera.position;
  if(FIN.grace>0){ FIN.grace-=dt; FIN.monSpd=0; }
  else { FIN.monSpd=Math.min(4.0,FIN.monSpd+dt*1.2); }
  fmon.position.x += (p.x-fmon.position.x)*Math.min(1,dt*2.5);
  fmon.position.z -= FIN.monSpd*dt;
  if(fmon.position.z < p.z+0.35) fmon.position.z = p.z+0.35;
  fmon.lookAt(p.x,1.4,p.z);
  fmonEyes.intensity=2.0+Math.sin(t*12)*1.0;
  if(FIN.monSpd>0) animateFmon(dt);
  const gap=fmon.position.z - p.z;               // metres it is behind
  const rem=Math.max(0,Math.floor(p.z - FZ_END)); // metres left to the door
  const danger=Math.max(0,Math.min(1,(4-gap)/4));
  $('vblood').style.opacity=String(0.12+danger*0.82);
  if(FIN.grace>0) objective('GET UP. RUN!  ('+Math.ceil(FIN.grace)+')');
  else if(gap<2.2) objective('IT IS RIGHT BEHIND YOU \u2014 RUN!');
  else objective('RUN \u2014 '+rem+' m to the elevator');
  if(gap<3 && Math.random()<dt*3) sfxNoise(0.18,90,0.5,'lowpass');
  if(gap<=0.55){ finCaught(); return; }
  if(p.z<=FZ_END+1.9){ finEnterElevator(); return; }
}

function finCaught(){
  vFlash(); SFX.screech(); $('vblood').style.opacity='0.95';
  if(navigator.vibrate) navigator.vibrate(240);
  say('It caught you \u2014 get up, go again.',2800);
  const p=camera.position;
  fmon.position.z=p.z+5.0; FIN.grace=1.4; FIN.monSpd=0;
}

const EV={t:0,done:false,shut:false};
const FB={t:0,reached:false};
function finEnterElevator(){
  S.stage='fev'; EV.t=0; EV.done=false; EV.shut=false;
  fmon.visible=true;
  fmon.position.z=Math.max(fmon.position.z, camera.position.z+0.7);
  SFX.doorOpen();
  objective('GET IN THE ELEVATOR');
  say('An elevator \u2014 the doors are open. GET IN.',2600);
}

/* the scripted elevator escape: it charges the closing doors, gets sealed out,
   then the car rumbles and rises past the floors into the win screen */
function updateElevator(dt,t){
  EV.t+=dt;
  const p=camera.position;
  const EVC=FZ_END-1.0;
  p.x += (FX-p.x)*Math.min(1,dt*3.4);
  p.z += (EVC-p.z)*Math.min(1,dt*3.0);
  const closing = EV.t>0.6;
  if(fmon.visible && !EV.shut){
    fmon.position.x += (FX-fmon.position.x)*Math.min(1,dt*4);
    const target = closing ? FZ_END+0.15 : FZ_END+0.7;
    fmon.position.z += (target-fmon.position.z)*Math.min(1,dt*6);
    fmon.lookAt(FX,1.4,EVC);
    fmonEyes.intensity=2.6+Math.sin(t*20)*1.6;
    animateFmon(dt*1.6);
    if(closing && Math.random()<dt*8) sfxNoise(0.2,120,0.25,'lowpass');
  }
  const kl = closing? evL.userData.closed : evL.userData.open;
  const kr = closing? evR.userData.closed : evR.userData.open;
  const sp = closing? 5.5 : 4;
  evL.position.x += ((FX+kl)-evL.position.x)*Math.min(1,dt*sp);
  evR.position.x += ((FX+kr)-evR.position.x)*Math.min(1,dt*sp);
  if(closing) p.y = 1.55 + Math.sin(t*40)*0.012;
  if(evLight) evLight.color.setHex(closing && !EV.shut ? 0xff5a48 : 0xffe9c4);
  if(evArrow) evArrow.material.emissive.setHex(closing && !EV.shut ? 0xff3b2a : 0x27d69a);
  if(closing && !EV.shut && Math.abs(evL.position.x-(FX+evL.userData.closed))<0.06){
    EV.shut=true; EV.shutT=EV.t;
    vFlash(); SFX.screech(); if(navigator.vibrate) navigator.vibrate([90,50,160]);
    say('The doors slam shut in its face.',2400);
    fmon.visible=false; fmonEyes.intensity=0; S.knockShake=1.8;
    if(evLight) evLight.color.setHex(0xffe9c4);
    if(evArrow) evArrow.material.emissive.setHex(0x27d69a);
  }
  if(EV.shut){
    const r=EV.t-EV.shutT;
    const fade=Math.max(0,1-r*0.4);
    p.x = FX + Math.sin(t*24)*0.02*fade;
    p.y = 1.55 + Math.sin(t*32)*0.02*fade;
    if(evArrow) evArrow.material.emissiveIntensity = 1.0+Math.abs(Math.sin(t*5))*1.3;
    $('vblood').style.opacity=String(Math.max(0,0.45-r*0.5));
    const floor=Math.min(3,1+Math.floor(r*1.3));
    if(floor!==EV.floor){ EV.floor=floor; if(SFX.click) SFX.click(); }
    objective('\u25B2 GOING UP \u2014 floor '+floor);
    if(Math.random()<dt*6) sfxNoise(0.12,64,0.4,'lowpass');
    if(r>2.6 && !EV.done){ EV.done=true; vFlash(); finComeBack(); return; }
  }
}

/* the elevator rises... then lurches and opens on your own floor.
   you step back out and have to walk to apartment 4C -- the last door. */
function finComeBack(){
  S.stage='fback'; FB.t=0; FB.reached=false;
  fmon.visible=false; fmonEyes.intensity=0;
  $('vblood').style.opacity='0';
  scene.fog.density=0.045;
  if(fourcLight) fourcLight.intensity=2.6;
  if(hallDress) hallDress.visible=true;
  camera.position.set(FX,1.55,FZ_END+2.4);
  camera.lookAt(FX,1.5,FZ_DOOR);
  if(evLight){ evLight.color.setHex(0xffe9c4); }
  if(!IS_TOUCH){ try{ controls.lock(); }catch(e){} }
  SFX.doorOpen(); if(navigator.vibrate) navigator.vibrate(60);
  objective('Walk to apartment 4C');
  say('The car lurches \u2014 then stops. It never climbed. The doors open on YOUR floor, and it is wrong. Walk to 4C.',5600);
}

function updateFback(dt,t){
  FB.t+=dt;
  // the elevator doors gape open behind you
  evL.position.x += ((FX+evL.userData.open)-evL.position.x)*Math.min(1,dt*3);
  evR.position.x += ((FX+evR.userData.open)-evR.position.x)*Math.min(1,dt*3);
  // the 4C beacon flickers like a sick fluorescent
  if(fourcLight) fourcLight.intensity=2.3+Math.sin(t*6)*0.7+(Math.random()<0.03?-1.6:0);
  if(fourcSign) fourcSign.material.emissiveIntensity=1.1+Math.abs(Math.sin(t*3))*0.9;
  // the door creaks open once you have been told
  if(fourcDoor && fourcDoor.userData.opening){
    fourcDoor.position.z += ((fourcDoor.userData.z0+0.82)-fourcDoor.position.z)*Math.min(1,dt*1.4);
  }
  // ambient dread while you walk
  if(A.ctx && Math.random()<dt*0.55) sfxNoise(0.4,120,0.06,'lowpass');
  if(A.ctx && Math.random()<dt*0.25 && SFX.whisper) SFX.whisper();
  const p=camera.position;
  if(!FB.reached){
    const rem=Math.max(0,Math.round(Math.abs(p.z-Z4C)));
    objective('Apartment 4C \u2014 '+rem+' m');
    if(Math.abs(p.z-Z4C)<1.9){ FB.reached=true; finFourC(); return; }
  }
}

/* the final beat at 4C: the truth about who lives here, then one last scare */
function finFourC(){
  S.overlay='fourc';
  if(!IS_TOUCH){ try{ controls.unlock(); }catch(e){} }
  camera.lookAt(FX-2.0,1.35,Z4C);
  objective('');
  if(fourcDoor) fourcDoor.userData.opening=true;
  SFX.creak();
  say('4C. Ada\u2019s door \u2014 and it is open a crack. It has never been open.',4400);
  setTimeout(()=>{ SFX.creak();
    say('Inside hangs your own coat. Your shoes sit by the mat. Your family smiles from Ada\u2019s photos.',5400); },4500);
  setTimeout(()=>{
    say('You have always lived in 4C. There was never a Mom at the door. There was never a curfew to survive.',5600); },10100);
  setTimeout(()=>{ SFX.whisper(); if(fourcEye) fourcEye.intensity=3.2; vFlash();
    say('Something in the dark of the flat says your name \u2014 in your own voice.',4600); },15900);
  setTimeout(()=>{ if($('finScare')) $('finScare').style.opacity=1; vFlash(); SFX.screech();
    if(navigator.vibrate) navigator.vibrate(260); },20700);
  setTimeout(()=>{ if($('finScare')) $('finScare').style.opacity=0;
    if(fourcEye) fourcEye.intensity=0; finOutside(); },21800);
}

let FO={t:0,inCar:false,rainInt:0};
function finOutMove(dt){
  let f=0,sd=0;
  if(keys['KeyW']||keys['ArrowUp'])f+=1; if(keys['KeyS']||keys['ArrowDown'])f-=1;
  if(keys['KeyD']||keys['ArrowRight'])sd+=1; if(keys['KeyA']||keys['ArrowLeft'])sd-=1;
  if(IS_TOUCH){ if(Math.abs(TOUCH.my)>0.12)f+=-TOUCH.my; if(Math.abs(TOUCH.mx)>0.12)sd+=TOUCH.mx; }
  const p=camera.position; breathe+=dt;
  if(f||sd){ camera.getWorldDirection(fwd); fwd.y=0; fwd.normalize(); rightV.copy(fwd).cross(UP).normalize();
    const running=((keys['ShiftLeft']||keys['ShiftRight'])||TOUCH.run);
    const spd=(running?RUN:WALK)*Math.min(1,Math.hypot(f,sd));
    let nx=p.x+(fwd.x*f+rightV.x*sd)*spd*dt, nz=p.z+(fwd.z*f+rightV.z*sd)*spd*dt;
    p.x=THREE.MathUtils.clamp(nx, OX-16+RAD, OX+16-RAD);
    p.z=THREE.MathUtils.clamp(nz, 41+RAD, 62-RAD);
    const prev=Math.floor(bob/Math.PI); bob+=dt*(running?13:9);
    if(Math.floor(bob/Math.PI)!==prev) sfxNoise(0.09,700,0.08,'bandpass');
  }
  p.y=1.6+Math.sin(bob)*0.03;
}

function finOutside(){
  S.stage='fout'; S.overlay=null; FO.t=0; FO.inCar=false;
  finWorld.visible=false; if(typeof hallDress!=='undefined'&&hallDress) hallDress.visible=false;
  finOut.visible=true; outMon.visible=false; if(omArmR) omArmR.rotation.x=0;
  $('vblood').style.opacity='0';
  scene.fog.color.setHex(0x0a0e16); scene.fog.density=0.03;
  camera.position.set(OX,1.6,43); camera.lookAt(OX,1.35,CARZ);
  if(streetLamp) streetLamp.intensity=5; if(carHead) carHead.intensity=0; if(carInside) carInside.intensity=0;
  if(!IS_TOUCH){ try{ controls.lock(); }catch(e){} }
  if(FO.rainInt) clearInterval(FO.rainInt);
  if(A.ctx) FO.rainInt=setInterval(function(){ sfxNoise(0.5,2400,0.05,'highpass'); },150);
  vFlash(); SFX.doorOpen();
  objective('Get to the car');
  say('You shove through a fire door \u2014 and you are outside. Freezing rain. A car idles at the kerb. Get in.',5200);
}

function updateFout(dt,t){
  if(S.stage!=='fout') return;
  scene.fog.density=0.03;
  const arr=oRain.geometry.attributes.position.array;
  for(let i=1;i<arr.length;i+=3){ arr[i]-=dt*15; if(arr[i]<0) arr[i]+=16; }
  oRain.geometry.attributes.position.needsUpdate=true;
  if(streetLamp) streetLamp.intensity=5+Math.sin(t*13)*0.5+(Math.random()<0.02?-3:0);
  if(A.ctx && Math.random()<dt*0.12){ sfxNoise(0.6,80,0.28,'lowpass'); if(Math.random()<0.4) vFlash(); }
  if(FO.inCar) return;
  const p=camera.position;
  const rem=Math.max(0,Math.round(Math.hypot(p.x-OX,p.z-(CARZ-1))));
  objective('Get to the car \u2014 '+rem+' m');
  if(Math.abs(p.z-CARZ)<2.0 && Math.abs(p.x-OX)<2.8){ FO.inCar=true; getInCar(); }
}

function getInCar(){
  S.overlay='incar';
  if(!IS_TOUCH){ try{ controls.unlock(); }catch(e){} }
  SFX.doorOpen(); if(carInside) carInside.intensity=2.2;
  camera.position.set(OX-0.5,1.15,CARZ);
  camera.lookAt(OX-6,1.2,CARZ);
  objective('');
  say('You drop into the seat and slam the door. Rain hammers the roof. Your hands are shaking.',4600);
  setTimeout(function(){ camera.lookAt(OX,1.5,40); SFX.creak();
    outMon.visible=true; if(doorGlow) doorGlow.intensity=6.0;
    say('A shape fills the doorway behind you. You turn to look back.',3800); },4700);
  setTimeout(function(){
    say('It just stands there in the rain. It does not chase. It does not scream.',4400); },8700);
  setTimeout(function(){ if(omArmR) omArmR.rotation.x=-1.7; SFX.whisper && SFX.whisper();
    say('Slowly it lifts a hand \u2014 not to grab you, to wave. Up close it is not a monster at all. It looks tired. Sad. Its mouth shapes the old words \u2014 \u201cI will find you\u201d \u2014 but now it sounds like a promise to come home.',7200); },13300);
  setTimeout(function(){ say('You start the engine.',2400); if(A.ctx) sfxNoise(1.0,70,0.35,'lowpass'); if(carHead) carHead.intensity=42; },20000);
  setTimeout(function(){ finComplete(); },23000);
}

function finComplete(){
  S.stage='finaledone'; S.mode='won';
  if(typeof finOut!=='undefined'&&finOut) finOut.visible=false;
  if(typeof FO!=='undefined'&&FO&&FO.rainInt){ clearInterval(FO.rainInt); FO.rainInt=0; }
  if(typeof hallDress!=='undefined' && hallDress) hallDress.visible=false;
  finWorld.visible=false; fmon.visible=false;
  $('vblood').style.opacity='0';
  vFlash(); SFX.doorOpen(); SFX.win();
  try{ recordEnding('survived'); }catch(e){}
  if(!IS_TOUCH){ try{ controls.unlock(); }catch(e){} }
  $('fin').classList.add('on');
  ['finVoid','finDream','finRoom','finChase','finScare'].forEach(id=>{ const e=$(id); if(e) e.style.display='none'; });
  $('finEnd').style.display='flex';
}
$('finReplay') && $('finReplay').addEventListener('click',()=>location.reload());
$('fkClose') && $('fkClose').addEventListener('click',()=>closeFinKeypad());


/* one hide round: knock, 5 s to get in, 6 s to stay in */
function updateScript(dt){
  if(S.mode!=='play'||S.overlay||S.practice||S.dev||S.freecam) return;
  if(S.stage==='froom'||S.stage==='fchase'||S.stage==='fev') return;

  if(S.stage==='dawn' && S.hiding){
    S.dawnHide+=dt;
    if(S.dawnHide>=60) secretEnding('waited');
    return;
  }

  /* --- 6:00 AM, not hiding: you MUST let Mom in. Wait too long and Mom is
         gone by the time you reach the door -- the 4C door opens instead. --- */
  if(S.stage==='dawn' && !S.hiding){
    S.dawnWait=(S.dawnWait||0)+dt;
    if(!S._dawnWarned && S.dawnWait>=18){ S._dawnWarned=true; SFX.knock();
      say('Mom knocks again, harder. "Leo? It is six, open up." Answer the FRONT door now.',5200); }
    if(S.dawnWait>=44){ fourCEnding(); return; }
  }

  if(S.stage==='night'){
    if(S.hideWindow<=0 && !S.safe){
      S.roundWait-=dt;
      if(S.roundWait<=0){
        S.round++;
        S.hideWindow=6; S.hiddenFor=0;
        SFX.knock(); SFX.whisper();
        say(ROUND_LINES[Math.min(S.round,ROUND_LINES.length)-1]+' ('+S.round+' of '+S.ROUNDS+')',4800);
        /* on the later rounds something comes down to the courtyard and
           waits under the window. Look out now and it will look back. */
        S.windowWatch = !S.practice && (S.round>=2 || S.hard);
        watcher.visible = S.windowWatch;
        if(S.windowWatch) setTimeout(()=>{ if(S.mode==='play'&&S.windowWatch&&!S.hiding)
          say('Something is standing in the courtyard, four floors down, with its face turned up at your window. Do not go and look.',5200); }, 1400);
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
      /* --- it comes to the cupboard and tries the doors --- */
      if(!S.tried && S.hiddenFor>=2.6){
        S.tried=true; S.rattle=1; sfxNoise(0.5,150,0.3,'lowpass'); SFX.creak();
        if(!S.latched){
          gameOver('It put both hands in the gap and pulled the cupboard open. '+
                   'The latch was on the inside the whole time.');
          return;
        }
        SFX.whisper();
        nerveHit(9,'The doors jump against the latch. Twice. It cannot get its fingers past the wood.');
      }
      $('timer').style.display='block';
      $('timer').innerHTML=Math.ceil(Math.max(0,6-S.hiddenFor))+'<small>'+
        (S.latched?'STAY HIDDEN':'LATCH THE DOORS')+'</small>';
      if(S.hiddenFor>=6){
        S.safe=false; S.hiddenFor=0; $('timer').style.display='none';
        S.tried=false; S.rattle=0;
        S.windowWatch=false; watcher.visible=false; S.windowFace=0; winFace.visible=false;
        SFX.creak();
        S.minutes=Math.min(DAWN-6,WAKE+S.round*11);
        if(S.round>=S.ROUNDS){
          enterDescent();
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
  S.latched=false; S.tried=false;
  $('state').textContent='hiding';
  SFX.doorOpen();
  say('You climb into the cupboard and pull the doors shut.');
  if(S.calling){ S.calling=false; setTimeout(()=>say('The calling stops. Something walks past the doors.',4200),1600); }
}
function leaveCloset(){
  if(!S.hiding) return;
  S.latched=false;
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
  if(e.code==='KeyK') skipBeat();
  if(e.code==='KeyQ') toggleLatch();
  if(e.code==='KeyE') interact();
});
addEventListener('keyup',e=>{ keys[e.code]=false; });
function toggleLatch(){
  if(!S.hiding||S.mode!=='play') return;
  S.latched=!S.latched; SFX.click();
  say(S.latched?'You hook the little latch over the inside of the doors.'
               :'You lift the latch off its hook. The doors are loose again.',3200);
}
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

/* floor height under a point: 0 in the flat, rising up the stair treads to the upper room */
function groundAt(x,z){
  if(Math.abs(x) < DOWN_HALF+0.1 && z <= LAND_END+0.1 && z >= DOWN_END-0.3) return DOWN_FLOOR;   // basement
  if(Math.abs(x) < stepW/2+0.1 && z <= stepZ0+0.2 && z >= LAND_END-0.3){                          // descending stairs
    const drop = THREE.MathUtils.clamp((stepZ0 - z)/stepRun, 0, STEPS) * stepRise;
    return Math.max(DOWN_FLOOR, -0.125 - drop);
  }
  return 0;
}
function finMove(dt){
  let f=0,s=0;
  if(keys['KeyW']||keys['ArrowUp'])    f+=1;
  if(keys['KeyS']||keys['ArrowDown'])  f-=1;
  if(keys['KeyD']||keys['ArrowRight']) s+=1;
  if(keys['KeyA']||keys['ArrowLeft'])  s-=1;
  if(IS_TOUCH){ if(Math.abs(TOUCH.my)>0.12) f+=-TOUCH.my; if(Math.abs(TOUCH.mx)>0.12) s+=TOUCH.mx; }
  const p=camera.position; breathe+=dt;
  const chase=(S.stage==='fchase');
  const corridor=(S.stage==='fchase'||S.stage==='fback');
  const running = chase || ((keys['ShiftLeft']||keys['ShiftRight'])||TOUCH.run);
  if(f||s){
    camera.getWorldDirection(fwd); fwd.y=0; fwd.normalize();
    rightV.copy(fwd).cross(UP).normalize();
    const spd=(running?RUN:WALK)*Math.min(1,Math.hypot(f,s));
    let nx=p.x+(fwd.x*f+rightV.x*s)*spd*dt;
    let nz=p.z+(fwd.z*f+rightV.z*s)*spd*dt;
    if(!corridor){
      nx=THREE.MathUtils.clamp(nx, FX-FR.hw+RAD, FX+FR.hw-RAD);
      nz=THREE.MathUtils.clamp(nz, FZ_DOOR+RAD, FR.hd-RAD);
    } else {
      nx=THREE.MathUtils.clamp(nx, FX-FCOR.hw+RAD, FX+FCOR.hw-RAD);
      nz=THREE.MathUtils.clamp(nz, FZ_END+RAD, FZ_DOOR+0.5);
    }
    p.x=nx; p.z=nz;
    const prev=Math.floor(bob/Math.PI); bob+=dt*(running?13:9);
    if(Math.floor(bob/Math.PI)!==prev) sfxNoise(0.09,900,0.1,'bandpass');
  }
  p.y=1.55+Math.sin(bob)*0.035+Math.sin(breathe*1.7)*0.012;
}
function move(dt){
  if(S.freecam){ freeMove(dt); return; }
  if(S.mode!=='play'||S.overlay||S.hiding||S.sitting){ return; }
  if(S.stage==='fev'||S.stage==='finaledone'){ return; }
  if(S.stage==='fout'){ finOutMove(dt); return; }
  if(S.stage==='froom'||S.stage==='fchase'||S.stage==='fback'){ finMove(dt); return; }
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
    const HALL_HALF = 1.4, THRESH = -ROOM.d/2;
    if(S.dev){
      p.x = THREE.MathUtils.clamp(nx, DEV.x-DEV.hw+RAD, DEV.x+DEV.hw-RAD);
      p.z = THREE.MathUtils.clamp(nz, DEV.z-DEV.hd+RAD, DEV.z+DEV.hd-RAD);
    } else {
      /* zones: the flat, the corridor, the stairwell landing, and the basement */
      const gapOK  = S.frontOpen && nx>DOOR_GAP[0]+RAD && nx<DOOR_GAP[1]-RAD;
      const landGap = nx>-HALL_HALF+RAD && nx<HALL_HALF-RAD;
      if(p.z < LAND_END){                       // basement (foot of the stairs)
        p.x = THREE.MathUtils.clamp(nx, -DOWN_HALF+RAD, DOWN_HALF-RAD);
        p.z = THREE.MathUtils.clamp(nz, DOWN_END+RAD, LAND_END+0.6);
      } else if(p.z < LAND_Z){                   // stairwell landing + staircase
        p.x = THREE.MathUtils.clamp(nx, -LAND_HALF+RAD, LAND_HALF-RAD);
        p.z = THREE.MathUtils.clamp(nz, DOWN_END+RAD, landGap ? THRESH-RAD : LAND_Z-RAD);
      } else if(p.z < THRESH){                   // communal corridor
        p.x = THREE.MathUtils.clamp(nx, -HALL_HALF+RAD, HALL_HALF-RAD);
        p.z = THREE.MathUtils.clamp(nz, LAND_END+RAD, gapOK ? ROOM.d/2-RAD : THRESH-RAD);
      } else {                                  // the flat
        p.x = THREE.MathUtils.clamp(nx, -ROOM.w/2+RAD, ROOM.w/2-RAD);
        p.z = THREE.MathUtils.clamp(nz, gapOK ? LAND_END+RAD : THRESH+RAD, ROOM.d/2-RAD);
      }
    }

    /* slide along furniture instead of walking through it */
    if(!solid(startX,startZ)){
      const wantX=p.x, wantZ=p.z;
      if(solid(wantX,startZ)) p.x=startX;
      if(solid(p.x,wantZ))    p.z=startZ;
      if(solid(p.x,p.z)){ p.x=startX; p.z=startZ; }
    }

    const prevStep=Math.floor(bob/Math.PI);
    bob+=dt*(running?13:9);
    if(Math.floor(bob/Math.PI)!==prevStep) sfxNoise(0.09,900,0.1,'bandpass');   // one tap per step
  }
  $('state').textContent = p.z<LAND_END ? 'basement' : (p.z<LAND_Z ? 'stairwell' : (p.z<-ROOM.d/2 ? 'hallway' : 'kitchen'));
  const gy = groundAt(p.x,p.z);
  p.y = gy + 1.55 + Math.sin(bob)*0.035 + Math.sin(breathe*1.7)*0.012 + S.knockShake*Math.random()*0.02;
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
  window:{ t:'THE FACE AT THE GLASS',
    s:'You went to the window one time too many, and this time it was already there — '+
      'pressed flat to the pane, breath fogging the cold glass, a smile with far too many teeth.<br><br>'+
      'It did not need the door. It had learned the only thing it ever wanted from you: your face, '+
      'lit up in the dark, looking back.<br>The latch turns on the inside. Windows were never rules; '+
      'they were invitations.<br><br>ENDING &mdash; it will find you, and now it knows where to look.' },
  guest:{ t:'THE POLITE GUEST',
    s:'You knocked three times on a door that has been locked since the fire.<br>'+
      'Three is polite. Three is practice.<br><br>'+
      'Something on the other side knocks back, exactly in time with you, and then '+
      'says thank you in your grandmother\u2019s voice. The lock turns from the inside.<br><br>'+
      'ENDING &mdash; you invited it.' },
  shoes:{ t:"ADA'S SHOES",
    s:'At the dead end of the hallway, in your own torchlight, there is a pair of small '+
      'shoes still laced, pointing at the wall.<br>Two weeks of dust. No footprints '+
      'leading to them.<br><br>You turn around and the hallway is one door longer than it was.<br><br>'+
      'ENDING &mdash; you found what the police missed.' },
  waited:{ t:'THE ONE WHO WAITED',
    s:'Six o\u2019clock came, and the knocking was Mom, and you stayed in the cupboard '+
      'with the latch shut anyway.<br><br>She calls your name for a while. Then two voices '+
      'call it together. Then twenty.<br>You do not open the door. You never open the door again.<br><br>'+
      'ENDING &mdash; the rules kept you, and kept you, and kept you.' },
  dark:{ t:'DARK ADAPTED',
    s:'Four knocks, four hides, and you never once switched the flashlight on.<br>'+
      'It spent the whole night looking for a boy who made no light and no sound.<br><br>'+
      'Mom opens the door at 6:00 AM and says you must have slept right through it.<br>'+
      'You did not. You have simply stopped needing to see.<br><br>'+
      'ENDING &mdash; the quiet ending.' },
  fourc:{ t:'THE OPEN 4C DOOR',
    s:'Six o’clock came. Mom knocked, and knocked, and used her key.<br>'+
      'You did not open the front door in time — and by the time you reached it, '+
      'the knocking had stopped.<br><br>'+
      'Down the hall, the door of 4C swings open on its own. Ada’s door. '+
      'The one that has been locked since the fire.<br>'+
      'Something steps out of it wearing Mom’s coat, and starts counting the doors back toward 4B.<br><br>'+
      'ENDING &mdash; you left the only real door shut too long.' }
};
function windowScare(){
  S.windowPeeks=(S.windowPeeks||0)+1;
  S.windowFace=1; winFace.visible=true; winFace.position.x=winFaceBase;
  SFX.screech(); vFlash();
  const doomed = S.windowPeeks>=3 || (!S.windowLatched && S.windowPeeks>=2);
  if(doomed && !S.practice && !S.dev && !S.freecam){
    say('It is already at the glass. It smiles with far too many teeth and mouths your name.',4200);
    setTimeout(()=>{ if(S.mode==='play') secretEnding('window'); }, 1600);
    return;
  }
  nerveHit(22, S.windowPeeks===1
    ? 'A face fills the whole window, pressed flat to the pane. It saw you see it. Rule 5.'
    : 'It is closer now, and the glass fogs where it breathes. Do NOT look out again.');
  setTimeout(()=>{ S.windowFace=0; setTimeout(()=>{ if(S.windowFace<=0) winFace.visible=false; },700); }, 1600);
}
function secretEnding(k){
  if(S.mode==='dead'||S.mode==='won') return;
  S.mode='won';
  S.hiding=false; S.sitting=false;
  document.body.classList.remove('hiding');
  entity.visible=false; entityEyes.intensity=0;
  recordEnding(k);
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
  else if(k==='fourc'){ SFX.creak(); SFX.knock(); SFX.whisper(); }
  else if(k==='window'){ SFX.screech(); SFX.whisper(); }
  else SFX.win();
}

/* the 6 AM fail: Mom leaves, the 4C door opens instead */
function fourCEnding(){
  if(S.mode!=='play') return;
  S.fourCOpen=true;
  secretEnding('fourc');
}

function winGame(){
  if(S.mode==='dead'||S.mode==='won') return;
  S.mode='won'; SFX.win();
  recordEnding('survived');
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
  if(S.freecam) return;
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
  else { sfxNoise(0.5,220,0.22,'lowpass');
    const flavor=[
      'Something drags once across the hallway floor.',
      'A child laughs three doors down, then covers its own mouth.',
      'The wallpaper seam behind the couch is peeled back a little further than before.',
      'For a second every clock in the flat reads a different time.',
      'You hear a knuckle test the wood of 4B, gently, from the inside.'
    ];
    say(flavor[Math.floor(Math.random()*flavor.length)],3800); }
}

/* =========================================================
   15. METERS + ENTITY BEHAVIOUR
========================================================= */
const lookDir=new THREE.Vector3();
function updateMeters(dt){
  if(S.mode!=='play'||S.overlay) return;
  if(S.stage==='froom'||S.stage==='fchase'||S.stage==='fev') return;
  if(S.freecam){
    $('clock').textContent='FREE CAM';
    $('batBar').firstElementChild.style.width='100%';
    $('sanBar').firstElementChild.style.width='100%';
    $('vblood').style.opacity='0';
    return;
  }
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
                     S.stage==='heating'||S.stage==='collect'||S.stage==='couch'||
                     S.stage==='chores')){
    S.nextEvent-=dt;
    if(S.nextEvent<=0) spawnEvent();
  }
  if(S.flashOn){
    S.battery=Math.max(0,S.battery-dt*(S.stage==='night'?0.6:1.4));
    if(S.battery<=0){ S.flashOn=false; $('fl').textContent='DEAD'; say('The flashlight dies.'); }
  }
  $('batBar').firstElementChild.style.width=S.battery+'%';
  $('sanBar').firstElementChild.style.width=S.nerve+'%';
  $('sanBar').firstElementChild.style.background=
    (camera.position.z<-ROOM.d/2 && HALLD.t>6) ? '#e0463a' : '#b0574a';
  if(S.mode==='play') $('vblood').style.opacity=String(Math.max(0,(45-S.nerve)/45*0.8));
  if(A.heartGain) A.heartGain.gain.value=0;
  if(S.nerve<70 && A.ctx && Math.random()<dt*(3.2-S.nerve/40)) sfxTone(54,0.28,'sine',0.3);
  if(S.nerve<55 && A.ctx && Math.random()<dt*0.5) SFX.whisper();
  if(A.ctx && S.mode==='play' && Math.random()<dt*0.4) sfxNoise(0.5,120,0.05,'lowpass');
}
/* --- standing out in the communal hallway eats your nerve --- */
const HALLD={t:0,warn:0};
const HALL_WARN=[
  [5,'You should not be out here. The doors are all listening.'],
  [11,'Your chest is tight. Something at the dark end has stopped pretending to be furniture.'],
  [18,'4F breathes in. The hallway light flickers and does not come back the same.'],
  [26,'Every door unlocks at once, very quietly. GET INSIDE.']
];
function updateHall(dt){
  if(S.mode!=='play'||S.overlay||S.practice||S.dev||S.freecam){ return; }
  if(S.stage==='froom'||S.stage==='fchase'||S.stage==='fev') return;
  const inHall = camera.position.z < -ROOM.d/2 && !S.hiding;
  if(!inHall){
    if(HALLD.t>0){
      HALLD.t=Math.max(0,HALLD.t-dt*3);
      if(HALLD.t===0) HALLD.warn=0;
    }
    return;
  }
  HALLD.t+=dt;
  while(HALLD.warn<HALL_WARN.length && HALLD.t>=HALL_WARN[HALLD.warn][0]){
    say(HALL_WARN[HALLD.warn][1],4600);
    if(HALLD.warn>0){ vFlash(); SFX.whisper(); }
    if(HALLD.warn>=2) hallDoors.forEach(d=>d.shake=1);
    HALLD.warn++;
  }
  if(HALLD.t>6){                                    // six seconds of grace, then it ramps up
    const rate=Math.min(7,1.5+(HALLD.t-6)*0.3);
    S.nerve=Math.max(0,S.nerve-dt*rate);
    if(Math.random()<dt*0.5) sfxNoise(0.16,240,0.14,'lowpass');
    if(S.nerve<=0){
      gameOver('You stayed in the hallway. Something came out of a door that has no handle.');
      return;
    }
  }
}
function updateEntity(dt,t){
  if(S.stage==='froom'||S.stage==='fchase'||S.stage==='fev'){ entity.visible=false; entityEyes.intensity=0; return; }
  if(S.freecam){ entity.visible=false; entityEyes.intensity=0; entity.position.set(0,0,-13); return; }
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
    entity.visible=!S.hiding || (S.safe && S.rattle>0.25);
    entityEyes.intensity=entity.visible?2.2+Math.sin(t*11)*1.1:0;
    if(S.safe){
      /* you are in the cupboard: it walks to the doors, tries them, then drifts off */
      const near=S.hiddenFor<4.2;
      const tx=near?closet.position.x:3.0+Math.sin(t*0.5)*1.1;
      const tz=near?closet.position.z+1.35:0.6+Math.cos(t*0.5)*1.4;
      const sp=near?2.6:1.4;
      entity.position.x += (tx-entity.position.x)*Math.min(1,dt*sp);
      entity.position.z += (tz-entity.position.z)*Math.min(1,dt*sp);
      entity.lookAt(closet.position.x,2.2,closet.position.z);
      if(Math.random()<dt*0.7) sfxNoise(0.14,260,0.13,'lowpass');   // slow footfalls
    } else {
      /* the hide window: it walks straight at you, arriving as the timer hits 0 */
      const k=1-Math.max(0,S.hideWindow)/6;                        // 0 -> 1
      const rush=1+S.round*0.12;                                   // later rounds are faster
      entity.position.x += ((camera.position.x)-entity.position.x)*Math.min(1,dt*1.6*rush);
      entity.position.z = -5.2 + Math.min(1,k*rush)*(camera.position.z+5.2);
      entity.lookAt(camera.position.x,1.9,camera.position.z);
      entity.rotation.z=Math.sin(t*7)*0.03*k;                      // lurching
      if(Math.random()<dt*(2+k*4)) sfxNoise(0.12,220+Math.random()*160,0.16,'lowpass');
    }
    /* it never clips out through a wall */
    entity.position.x=THREE.MathUtils.clamp(entity.position.x,-ROOM.w/2+0.5,ROOM.w/2-0.5);
    entity.position.z=THREE.MathUtils.clamp(entity.position.z,-5.4,ROOM.d/2-0.5);
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
  const calm = camera.position.z > -ROOM.d/2;      // no recovery while you are out in the hall
  if(entity.visible){
    entity.lookAt(camera.position.x,1.9,camera.position.z);
    camera.getWorldDirection(lookDir);
    const staring = lookDir.z<-0.55 && camera.position.z<2.0;
    if(staring){
      walking=true;
      const hd=S.hard?1.75:1;
      entity.position.z += dt*1.5*hd;                  // it closes in while watched
      entity.position.x += (0-entity.position.x)*dt*2;
      S.nerve=Math.max(0,S.nerve-dt*15*hd);
      if(Math.random()<dt*1.5) SFX.whisper();
      if(entity.position.z>-9&&Math.random()<dt*0.6)
        say('It has not moved its feet. It is just closer.',2600);
      if(S.nerve<=0||entity.position.z>-6.0)
        gameOver('You looked, and you kept looking. It learned that you can see it. Rules 1 and 5.');
    } else {
      entity.position.z = Math.max(-16, entity.position.z - dt*0.9);
      if(calm) S.nerve=Math.min(100,S.nerve+dt*4.5);
    }
  } else if(calm) S.nerve=Math.min(100,S.nerve+dt*6);
  animateEntity(t,walking);
}

/* =========================================================
   15b. STAIRWELL JUMPSCARE
========================================================= */
function triggerScare(){
  S.scareActive=true; S.scareDone=true; S.scareT=0;
  scare.visible=true;
  scare.position.set(0,DOWN_FLOOR+1.5,LAND_END-0.3);
  vFlash(); SFX.screech(); S.knockShake=1.6;
  say('SOMETHING COMES UP OUT OF THE DARK.',2600);
  if(!S.freecam && !S.practice){ $('vblood').style.opacity='0.9'; nerveHit(38); }
}
function updateScare(dt,t){
  if(S.stage==='froom'||S.stage==='fchase'||S.stage==='fev'){ scare.visible=false; scareLight.intensity=0; return; }
  const canRun = (S.mode==='play' || S.freecam);
  /* fade the sickly upstairs glow in as the player approaches the well */
  const near = camera.position.z < -19.0;
  upLight.intensity += ((near?2.2:0)-upLight.intensity)*Math.min(1,dt*3);
  if((S.mode==='play'||S.freecam) && camera.position.z < LAND_END && !S.upSeen){
    S.upSeen=true;
    say('The basement. A sealed fire exit at the far wall \u2014 chained, padlocked, painted over. The only way out of this building has not opened in years.',5600);
  }
  if(canRun && !S.scareDone && !S.scareActive){
    const descending = groundAt(camera.position.x,camera.position.z) < -0.4;
    const onStair  = camera.position.z < -22.0 && Math.abs(camera.position.x) < 2.4;
    if(descending || onStair) triggerScare();
  }
  if(S.scareActive){
    S.scareT += dt;
    const k = Math.min(1, S.scareT/0.55);
    const startZ = LAND_END-0.3, startY = DOWN_FLOOR+1.5;
    /* lunge down the stairs into the player's face */
    const tz = camera.position.z + 1.1;
    scare.position.z = startZ + k*(tz-startZ);
    scare.position.x += (camera.position.x-scare.position.x)*Math.min(1,dt*9);
    scare.position.y = startY - k*(startY-camera.position.y-0.05);
    scare.lookAt(camera.position.x,camera.position.y,camera.position.z);
    scare.rotation.z = Math.sin(t*34)*0.12;
    scareLight.intensity = 5+Math.sin(t*42)*3;
    if(S.scareT>1.15){
      S.scareActive=false;
      scare.visible=false; scareLight.intensity=0;
      if(!S.freecam) $('vblood').style.opacity=String(Math.max(0,(45-S.nerve)/45*0.8));
    }
  } else {
    scare.visible=false; scareLight.intensity=0;
  }
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
  /* something outside is trying the doors */
  if(S.rattle>0){
    S.rattle=Math.max(0,S.rattle-dt*0.45);
    const j=Math.sin(t*38)*0.10*S.rattle;
    clHingeL.rotation.y+=j; clHingeR.rotation.y-=j;
    if(Math.random()<dt*6) sfxNoise(0.09,190+Math.random()*90,0.1,'lowpass');
  }
  /* curtain: bunched to one side, or drawn across the window */
  const cSc=S.curtainOpen?0.45:1, cZ=S.curtainOpen?-2.92:-2.0;
  curtain.scale.x += (cSc-curtain.scale.x)*Math.min(1,dt*4);
  curtain.position.z += (cZ-curtain.position.z)*Math.min(1,dt*4);
  /* light switch nub */
  switchNub.position.y += (((S.hallLightOn?1.38:1.46))-switchNub.position.y)*dt*10;
  /* front door shakes when knocked */
  if(S.knockShake>0){
    S.knockShake=Math.max(0,S.knockShake-dt*0.6);
    doorPivot.position.x=1.4+Math.sin(t*40)*0.012*S.knockShake;
  } else doorPivot.position.x=1.4;
  doorPivot.rotation.y += ((S.frontOpen?DOOR_SWING:0)-doorPivot.rotation.y)*Math.min(1,dt*3.2);
  /* the swung-open leaf becomes solid so you cannot walk through it */
  const leafOut=doorPivot.rotation.y>0.7;
  DOORBLK.hw=leafOut?0.12:0; DOORBLK.hd=leafOut?0.87:0;
  /* locked hallway doors rattle when tried */
  hallDoors.forEach(d=>{
    if(d.shake>0){ d.shake=Math.max(0,d.shake-dt*1.4);
      d.group.position.x = d.baseX + Math.sin(t*45)*0.01*d.shake; }
    else d.group.position.x = d.baseX;
  });
  /* the 4C door swings open on the fail ending */
  if(S.fourCOpen && hallDoors[0]){
    const leaf=hallDoors[0].group.children[0];
    if(leaf) leaf.rotation.y += (-1.25-leaf.rotation.y)*Math.min(1,dt*2.5);
  }
  /* phone receiver rattles while ringing */
  receiver.position.y = 0.09 + (S.calling?Math.abs(Math.sin(t*26))*0.012:0);
  /* curtain wave */
  const pos=curtain.geometry.attributes.position;
  for(let i=0;i<pos.count;i++){
    const bx=curtainBase[i*3], by=curtainBase[i*3+1];
    pos.setZ(i, Math.sin(t*1.6+bx*1.7+by*0.6)*0.06*(1-Math.abs(by)/0.9));
  }
  pos.needsUpdate=true;
  /* the face pressed to the window slides in and breathes */
  if(winFace.visible){
    const tx = S.windowFace>0.4 ? winFaceIn : winFaceBase;
    winFace.position.x += (tx-winFace.position.x)*Math.min(1,dt*6);
    winFace.position.y = (WIN_Y-0.1) + Math.sin(t*2.2)*0.03;
    faceLight.intensity = 2.6*S.windowFace + Math.sin(t*40)*0.5*S.windowFace;
    faceEyeMat.emissiveIntensity = 2.0 + Math.sin(t*30)*0.8;
  } else { faceLight.intensity=0; }
  /* the watcher sways in the courtyard, its eyes pulsing */
  if(watcher.visible){
    watcher.rotation.y = Math.sin(t*0.6)*0.16;
    watcher.position.y = -2.0 + Math.sin(t*0.9)*0.03;
    const ev = 1.4 + Math.sin(t*5)*0.6;
    watchEyeL.intensity=ev; watchEyeR.intensity=ev;
  } else { watchEyeL.intensity=0; watchEyeR.intensity=0; }
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
  scene.fog.density = (S.power?0.04:0.09) + Math.max(0,(55-S.nerve))*0.0016;
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
const perfProbe={frames:0,time:0,done:PERF};   // auto-detect slow hardware
function animate(){
  requestAnimationFrame(animate);
  if(window.SRM&&SRM.animation&&SRM.animation.ambient){ try{ SRM.animation.ambient(performance.now()); }catch(e){} }
  const dt=Math.min(0.05,clock.getDelta()), t=clock.elapsedTime;
  if(S.mode==='menu'&&!S.overlay) menuCamera(t);
  move(dt);
  updateScript(dt);
  animateFlashlight(dt);
  updateHall(dt);
  updateFocus();
  updateMeters(dt);
  updateEntity(dt,t);
  updateScare(dt,t);
  animateProps(dt,t);
  updateAtmosphere(dt,t);
  updateFin(dt,t);
  updateFout(dt,t);
  if(A.humGain) A.humGain.gain.value = 0.05/(1+camera.position.distanceTo(fridge.position)*0.25);
  document.querySelectorAll('.hands').forEach(h=>h.classList.toggle('show',S.carrying&&S.mode==='play'&&!S.sitting));
  /* adaptive: if the first few seconds run slow, switch to performance mode once */
  if(!PERF && !perfProbe.done){
    perfProbe.frames++; perfProbe.time+=dt;
    if(perfProbe.time>=3){
      perfProbe.done=true;
      if(perfProbe.frames/perfProbe.time < 40){ PERF=true; applyPerf(true); }
    }
  }
  if(!retro && !PERF && composer){
    if(gradePass){
      gradePass.uniforms.uTime.value=t;
      const fear = (S.mode==='play')? Math.max(0.16,(72-S.nerve)/72) : 0.05;
      gradePass.uniforms.uFear.value += (fear-gradePass.uniforms.uFear.value)*0.06;
    }
    if(bloomPass) bloomPass.strength = (S.power?(IS_TOUCH?0.35:0.55):0.75)+(S.tvOn?0.12:0);
    composer.render();
  } else {
    renderer.render(scene,camera);
  }
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
if(window.__dismissBoot) window.__dismissBoot();

/* ===== bridge to the srm/ add-on modules ===== */
try{
  window.__GAME={ renderer:renderer, scene:scene, camera:camera, S:S, THREE:THREE,
    bulb:bulb, moon:moon, hemi:hemi, ambient:ambient,
    resize:resize, say:say, sfxNoise:sfxNoise,
    isTouch:(typeof IS_TOUCH!=='undefined'?IS_TOUCH:false) };
  if(window.SRM && SRM.graphics && SRM.graphics.apply) SRM.graphics.apply(SRM.current);
}catch(e){ /* add-ons are optional; core game runs without them */ }

