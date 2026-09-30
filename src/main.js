import './base.css';
import './ui.css';
import * as THREE from 'three';
import { World, SEA_LEVEL } from './world.js';
import { B, BLOCKS, ITEMS, getItem, isSolid } from './blocks.js';
import { Inventory, craft } from './inventory.js';
import { UI } from './ui.js';
import { EntityManager } from './entities.js';
import { SoundSystem } from './sound.js';
import { PlayerPhysics, collides, intersectsPlayer, EYE_HEIGHT } from './physics.js';
import { Environment } from './environment.js';
import { Effects, Hand } from './effects.js';
import { FluidSimulation } from './fluids.js';

const SAVE_KEY='voxel-save-v1';
const clamp=THREE.MathUtils.clamp;
const defaults={fov:75,sensitivity:.6,renderDistance:5,shadows:true,autoTime:true,timeSpeed:1,volume:.5};
class Game {
  constructor(){
    this.settings={...defaults};try{Object.assign(this.settings,JSON.parse(localStorage.getItem('voxel-settings')||'{}'));}catch{}
    this.scene=new THREE.Scene();this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setSize(innerWidth,innerHeight);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.shadowMap.enabled=this.settings.shadows;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.autoClear=false;this.canvas=this.renderer.domElement;this.canvas.className='game-canvas';this.canvas.id='game-canvas';this.canvas.tabIndex=0;this.canvas.setAttribute('aria-label','游戏画面');document.querySelector('#game').append(this.canvas);
    this.camera=new THREE.PerspectiveCamera(this.settings.fov,innerWidth/innerHeight,.05,420);this.camera.rotation.order='YXZ';
    this.player=new PlayerPhysics(new THREE.Vector3(.5,40,.5));this.health=20;this.hunger=20;this.air=10;this.xp=0;this.saturation=5;
    this.inventory=new Inventory('survival');this.mode='survival';this.started=false;this.loading=false;
    this.ui=new UI(this.inventory,{
      start:opts=>this.start(opts),resume:opts=>{if(!this.started||opts?.load)this.start({load:true});else this.resume();},
      save:()=>this.save(true),exit:()=>this.exit(),settings:s=>this.applySettings(s),command:text=>this.command(text),respawn:()=>this.respawn(),inventoryChanged:()=>this.onInventoryChanged(),craft:(id,station)=>this.craft(id,station),useRecipe:(id,station)=>this.craft(id,station),dropItem:(id,count)=>this.effects.addDrop(id,count,this.player.position.clone().add(new THREE.Vector3(0,.8,0)))
    });
    this.sound=new SoundSystem();this.sound.setVolume(this.settings.volume);
    this.environment=new Environment(this.scene,this.renderer);this.effects=new Effects(this.scene);this.hand=new Hand();
    this.keys=new Set();this.mouseDown=false;this.yaw=-.7;this.pitch=-.1;this.target=null;this.breaking=null;this.breakProgress=0;this.interactCooldown=0;this.attackCooldown=0;this.damageCooldown=0;
    this.frameCounter=0;this.fps=60;this.fpsTimer=0;this.survivalTimer=0;this.saveTimer=0;this.blockTick=0;this.lastSpace=0;this.photo=false;this.debug=false;this.elapsed=0;this.accumulator=0;this.stepTimer=0;this.keepInventory=false;this.plants=new Map();this.plantTimer=0;
    this.hurt=document.createElement('div');this.hurt.id='hurt-vignette';document.body.append(this.hurt);
    this.water=document.createElement('div');this.water.id='water-overlay';document.body.append(this.water);
    this.hint=document.createElement('div');this.hint.id='play-hint';this.hint.textContent='点击画面继续 · Esc 打开菜单';document.body.append(this.hint);
    this.bind();this.ui.setScreen('title');this.createPreview();this.last=performance.now();requestAnimationFrame(t=>this.frame(t));
  }
  async createPreview(){
    if(this.loading||this.started)return;
    this.loading=true;this.world=new World(this.scene,{seed:241108,type:'normal',renderDistance:3});
    await this.world.init(0,0);const spawn=this.world.findSpawn();this.previewCenter=new THREE.Vector3(spawn.x,spawn.y,spawn.z);this.player.position.copy(this.previewCenter);this.loading=false;
  }
  async start(opts={}){
    if(this.loading){this.ui.toast?.('世界正在准备，请稍候');return;}
    let saved=null;if(opts.load){try{saved=JSON.parse(localStorage.getItem(SAVE_KEY));}catch{}if(!saved){this.ui.toast('没有找到存档');return;}}
    this.sound.start();this.releasePointer();this.loading=true;this.started=false;this.ui.setScreen('loading');this.ui.setLoading?.(.05,'生成世界…');
    this.entities?.dispose();this.world?.dispose();this.effects.clear();this.keys.clear();
    this.mode=saved?.mode||opts.mode||'survival';this.inventory.mode=this.mode;
    const fresh=new Inventory(this.mode);this.inventory.slots=fresh.slots;this.inventory.selected=0;this.inventory.storage=fresh.storage||{};
    if(saved?.inventory)this.inventory.load(saved.inventory);
    let chosenSeed=Number(opts.seed);if(opts.seed&&!Number.isFinite(chosenSeed)){chosenSeed=0;for(const c of String(opts.seed))chosenSeed=(Math.imul(chosenSeed,31)+c.charCodeAt(0))|0;}
    const seed=saved?.seed??(Number.isFinite(chosenSeed)?chosenSeed:241108);const type=saved?.type||opts.type||'normal';
    this.settings.renderDistance=Number(opts.renderDistance)||this.settings.renderDistance;
    this.world=new World(this.scene,{seed,type,renderDistance:this.settings.renderDistance,onProgress:(p,t)=>this.ui.setLoading?.(p,t||'构建区块…')});
    if(saved?.edits)this.world.loadEdits(saved.edits);
    const initial=saved?.position||{x:0,z:0};await this.world.init(initial.x,initial.z);
    this.fluids=new FluidSimulation(this.world);this.fluids.load(saved?.fluids);
    this.plants=new Map(saved?.plants||[]);
    const spawn=saved?.position||this.world.findSpawn();this.spawn=saved?.spawn||{...spawn};
    this.player.reset(new THREE.Vector3(spawn.x,spawn.y,spawn.z));
    this.player.flying=saved?.flying&&this.mode==='creative';
    this.yaw=saved?.yaw??-.6;this.pitch=saved?.pitch??0;this.health=saved?.health??20;this.hunger=saved?.hunger??20;this.air=10;this.xp=saved?.xp??0;this.saturation=saved?.saturation??5;
    this.environment.time=saved?.time??1000;this.environment.day=saved?.day??1;
    this.keepInventory=saved?.keepInventory??false;
    this.entities=new EntityManager(this.scene,this.world,{onDamage:(amount,source)=>this.damage(amount,source),onDrop:(id,count,pos)=>this.effects.addDrop(id,count,new THREE.Vector3(pos.x,pos.y+.3,pos.z)),sound:this.sound});
    if(saved?.entities?.length)this.entities.load(saved.entities);else this.entities.spawnAround(this.player.position,12);
    if(saved?.drops)this.effects.loadDrops(saved.drops);
    this.target=null;this.breaking=null;this.breakProgress=0;this.loading=false;this.started=true;this.saveTimer=0;this.survivalTimer=0;this.ui.setLoading?.(1,'世界就绪');this.ui.setScreen(null);this.sound.start();this.sound.setVolume(this.settings.volume);this.updateCamera(0);this.onInventoryChanged();
    this.ui.toast(this.mode==='creative'?'创造模式 · 双击空格飞行 · E 打开物品栏':'生存模式 · 长按左键采集木头 · E 合成');if(this.health<=0){this.ui.setScreen('death');this.releasePointer();}else this.resume();
  }
  bind(){
    window.addEventListener('resize',()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);this.hand.resize();});
    document.addEventListener('contextmenu',e=>{if(this.started)e.preventDefault();});
    document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==this.canvas){this.keys.clear();this.mouseDown=false;if(this.started&&!this.ui.isOpen&&!this.loading)this.ui.setScreen('pause');}else this.hint.style.display='none';});
    document.addEventListener('pointerlockerror',()=>{this.ui.toast('当前浏览器限制鼠标锁定；可以按住画面拖动视角');this.dragLook=true;});
    let lastMouse=null;
    this.canvas.addEventListener('mousedown',e=>{
      if(!this.started||this.ui.isOpen)return;
      this.sound.start();
      if(document.pointerLockElement!==this.canvas){this.requestPointer();lastMouse={x:e.clientX,y:e.clientY};if(!this.dragLook)return;}
      if(e.button===0){this.mouseDown=true;this.attack();if(this.mode==='creative'&&this.attackCooldown<=0&&this.target&&this.interactCooldown<=0){this.breakBlock(this.target);this.interactCooldown=.2;this.mouseDown=false;}}if(e.button===2)this.use();if(e.button===1)this.pickBlock();
    });
    document.addEventListener('mouseup',()=>{this.mouseDown=false;this.breaking=null;this.breakProgress=0;lastMouse=null;});
    document.addEventListener('mousemove',e=>{
      if(!this.started||this.ui.isOpen)return;
      let dx=0,dy=0;
      if(document.pointerLockElement===this.canvas){dx=e.movementX;dy=e.movementY;}
      else if(this.dragLook&&lastMouse){dx=e.clientX-lastMouse.x;dy=e.clientY-lastMouse.y;lastMouse={x:e.clientX,y:e.clientY};}else return;
      const s=.0031*this.settings.sensitivity;this.yaw-=dx*s;this.pitch=clamp(this.pitch-dy*s,-Math.PI/2+.01,Math.PI/2-.01);
    });
    window.addEventListener('keydown',e=>{
      const typing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
      if(typing){if(e.code==='Escape'){document.activeElement.blur();this.resume();}return;}
      if(['Space','Tab','ArrowUp','ArrowDown','F1','F2','F3','F5'].includes(e.code))e.preventDefault();
      if(e.code==='F3'&&!e.repeat){this.debug=!this.debug;return;}
      if(e.code==='F1'&&!e.repeat){this.photo=!this.photo;document.body.classList.toggle('photo-mode',this.photo);return;}
      if(e.code==='F2'&&!e.repeat){this.screenshot();return;}
      if(e.code==='Escape'&&!e.repeat){if(this.started){if(this.ui.currentScreen==='pause'||this.ui.currentScreen==='inventory'||this.ui.currentScreen==='settings'||this.ui.currentScreen==='command')this.resume();else this.pause();}return;}
      if(!this.started||this.loading)return;
      if(e.code==='KeyE'&&!e.repeat){if(this.ui.currentScreen==='inventory')this.resume();else if(!this.ui.isOpen){this.releasePointer();this.ui.showInventory('hand');}return;}
      if((e.code==='KeyT'||e.code==='Slash')&&!e.repeat&&!this.ui.isOpen){this.releasePointer();this.ui.showCommand?.();return;}
      if(this.ui.isOpen)return;
      if(/^Digit[1-9]$/.test(e.code)){this.inventory.setSelected(Number(e.code.slice(-1))-1);this.onInventoryChanged();}
      if(e.code==='Space'&&!e.repeat){const now=performance.now();if(this.mode==='creative'&&now-this.lastSpace<300){this.player.flying=!this.player.flying;this.player.velocity.y=0;this.ui.toast(this.player.flying?'飞行已开启':'飞行已关闭');}this.lastSpace=now;}
      if(e.code==='KeyQ'&&!e.repeat)this.dropSelected(e.ctrlKey);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.code));
    this.canvas.addEventListener('wheel',e=>{if(!this.started||this.ui.isOpen)return;e.preventDefault();this.inventory.setSelected((this.inventory.selected+(e.deltaY>0?1:8))%9);this.onInventoryChanged();},{passive:false});
    window.addEventListener('blur',()=>{this.keys.clear();this.mouseDown=false;if(this.started&&!this.ui.isOpen)this.pause();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.started){this.save(false);this.pause();}});
    window.addEventListener('beforeunload',()=>{if(this.started)this.save(false);});
  }
  requestPointer(){try{const promise=this.canvas.requestPointerLock();promise?.catch(()=>{this.dragLook=true;this.ui.toast('按住画面拖动视角');});}catch{this.dragLook=true;}}
  releasePointer(){if(document.pointerLockElement)document.exitPointerLock();this.mouseDown=false;this.keys.clear();}
  resume(){if(!this.started)return;this.ui.close?.();this.ui.setScreen(null);this.canvas.focus();this.sound.start();this.requestPointer();}
  pause(){this.ui.setScreen('pause');this.releasePointer();this.breakProgress=0;}
  exit(){this.save(false);this.releasePointer();this.started=false;this.previewCenter=this.player.position.clone();this.ui.setScreen('title');}
  applySettings(s){Object.assign(this.settings,s);this.camera.fov=this.settings.fov;this.camera.updateProjectionMatrix();this.renderer.shadowMap.enabled=!!this.settings.shadows;this.sound.setVolume(this.settings.volume);this.world?.setRenderDistance(Number(this.settings.renderDistance));this.scene.fog.density=.048/Math.max(2,this.settings.renderDistance);localStorage.setItem('voxel-settings',JSON.stringify(this.settings));}
  onInventoryChanged(){this.hand.setItem(this.inventory.selectedItem?.id||null);this.itemLabelTime=2.4;}
  craft(id,station){if(craft(id,this.inventory,station)){this.sound.play('pickup');this.onInventoryChanged();this.ui.toast('合成成功');return true;}this.ui.toast('材料不足或需要工作台 / 熔炉');return false;}
  updateCamera(dt){
    const p=this.player;let bob=0;
    if(p.grounded&&Math.hypot(p.velocity.x,p.velocity.z)>.4&&!p.flying)bob=Math.sin(p.walkDistance*3.2)*.027;
    this.camera.position.set(p.position.x,p.position.y+(p.crouching?1.42:EYE_HEIGHT)+bob,p.position.z);
    this.camera.rotation.set(this.pitch,this.yaw,0);
    const sprint=this.keys.has('ControlLeft')&&this.keys.has('KeyW');const targetFov=this.settings.fov+(sprint?8:0)+(p.flying?4:0);
    this.camera.fov+=(targetFov-this.camera.fov)*Math.min(1,dt*8);this.camera.updateProjectionMatrix();
  }
  attack(){
    if(this.attackCooldown>0)return;const dir=this.camera.getWorldDirection(new THREE.Vector3());
    const targetDistance=this.target?.distance??3.2;const item=this.inventory.selectedItem;const id=item?.id;
    const dmg=id===119?6:id===118?5:id===117?4:id===116?7:id===115?6:id===114?5:1;
    const hit=this.entities?.attack(this.camera.position,dir,Math.min(3.2,targetDistance),dmg);
    if(hit){this.attackCooldown=.5;this.hand.punch();this.sound.play('swing');this.inventory.damageTool?.(1);this.xp+=.03;this.onInventoryChanged();}
  }
  miningTime(id){
    if(this.mode==='creative')return .12;const block=BLOCKS[id];if(!block)return Infinity;
    if(id===B.BEDROCK||block.hardness<0)return Infinity;
    const tool=this.inventory.selectedItem?.id;let speed=1;
    const picks=[110,111,112,113],axes=[114,115,116];
    if(picks.includes(tool)&&['stone','pickaxe','pick'].includes(block.tool))speed=[2,4,6,8][picks.indexOf(tool)];
    if(axes.includes(tool)&&['wood','axe'].includes(block.tool))speed=[2,4,6][axes.indexOf(tool)];
    if(picks.includes(tool)&&[B.STONE,B.COBBLE,B.COAL_ORE,B.IRON_ORE,B.GOLD_ORE,B.DIAMOND_ORE,B.FURNACE,B.BRICKS,B.OBSIDIAN].includes(id))speed=[2,4,6,8][picks.indexOf(tool)];
    if(axes.includes(tool)&&[B.LOG,B.PLANKS,B.CRAFTING,B.CHEST].includes(id))speed=[2,4,6][axes.indexOf(tool)];
    const requiresPick=['stone','pickaxe','pick'].includes(block.tool);
    const factor=requiresPick&&!picks.includes(tool)?5:1.5;
    return Math.max(.12,(block.hardness??1)*factor/speed);
  }
  tickMining(dt){
    if(!this.mouseDown||!this.target||this.attackCooldown>.2){this.breakProgress=0;this.breaking=null;return;}
    const h=this.target,key=`${h.x},${h.y},${h.z}`;
    if(key!==this.breaking){this.breaking=key;this.breakProgress=0;}
    const sec=this.miningTime(h.id);if(!Number.isFinite(sec))return;
    this.breakProgress+=dt/sec;this.hand.punch();
    this.mineSoundTimer=(this.mineSoundTimer||0)+dt;if(this.mineSoundTimer>.26){this.sound.play('dig',h.id);this.mineSoundTimer=0;this.effects.burst(h.x,h.y,h.z,h.id,2);}
    if(this.breakProgress>=1){
      this.breakBlock(h);this.breakProgress=0;this.breaking=null;
      if(this.mode==='creative'){this.mouseDown=false;}
    }
  }
  breakBlock(h){
    if(h.id===B.BEDROCK)return;
    if([34,35,36,37].includes(h.id)){const y=h.y-([35,37].includes(h.id)?1:0);this.world.setBlock(h.x,y,h.z,B.AIR);this.world.setBlock(h.x,y+1,h.z,B.AIR);this.effects.burst(h.x,y,h.z,34);this.sound.play('break');if(this.mode==='survival')this.effects.addDrop(34,1,new THREE.Vector3(h.x+.5,y+.5,h.z+.5));this.inventory.damageTool(1);return;}
    const storageKey=`${h.x},${h.y},${h.z}`,store=this.inventory.storage[storageKey];
    if(store){for(const s of store.slots||[])if(s)this.effects.addDrop(s.id,s.count,new THREE.Vector3(h.x+.5,h.y+.5,h.z+.5));delete this.inventory.storage[storageKey];}
    this.world.setBlock(h.x,h.y,h.z,B.AIR);this.fluids?.activateNeighbors(h.x,h.y,h.z);this.effects.burst(h.x,h.y,h.z,h.id);this.sound.play('break',h.id);this.hand.punch();
    if(this.mode==='survival'){
      let drop=BLOCKS[h.id]?.drop??h.id;const tool=this.inventory.selectedItem?.id;const pick=[110,111,112,113].includes(tool);
      if([B.STONE,B.COBBLE,B.COAL_ORE,B.IRON_ORE,B.FURNACE,B.BRICKS].includes(h.id)&&!pick)drop=0;
      if([B.GOLD_ORE,B.DIAMOND_ORE].includes(h.id)&&![112,113].includes(tool))drop=0;
      if(h.id===B.IRON_ORE&&![111,112,113].includes(tool))drop=0;
      if(h.id===B.OBSIDIAN&&tool!==113)drop=0;
      if(h.id===B.LEAVES)drop=Math.random()<.06?105:0;
      if(h.id===B.LEAVES&&!drop&&Math.random()<.1)drop=33;
      if(h.id===31)drop=122;
      if(h.id===32){drop=121;this.effects.addDrop(122,1+Math.floor(Math.random()*3),new THREE.Vector3(h.x+.5,h.y+.5,h.z+.5));}
      if(h.id===B.GRASS)drop=B.DIRT;if(h.id===B.STONE&&pick)drop=B.COBBLE;if(h.id===B.COAL_ORE&&pick)drop=101;if(h.id===B.DIAMOND_ORE&&tool>=112)drop=104;
      if(h.id===B.WATER||h.id===B.LAVA)drop=0;
      if(drop)this.effects.addDrop(drop,1,new THREE.Vector3(h.x+.5,h.y+.5,h.z+.5));
      this.inventory.damageTool?.(1);this.saturation-=.005;this.onInventoryChanged();
      if([B.COAL_ORE,B.DIAMOND_ORE].includes(h.id))this.xp+=.15;
    }
    // Trees and plants need support. Sand and gravel are handled by nearby ticks.
    const abovePlant=this.world.getBlock(h.x,h.y+1,h.z);
    if([B.FLOWER,B.TALL_GRASS,B.TORCH,31,32,33].includes(abovePlant))this.breakBlock({x:h.x,y:h.y+1,z:h.z,id:abovePlant});
    this.plants.delete(`${h.x},${h.y},${h.z}`);
  }
  use(){
    if(this.interactCooldown>0)return;this.interactCooldown=.16;const h=this.target;const item=this.inventory.selectedItem;const id=item?.id;
    if(h&&!this.player.crouching){
      if([34,35,36,37].includes(h.id)){const y=h.y-([35,37].includes(h.id)?1:0),open=[34,35].includes(h.id);this.world.setBlock(h.x,y,h.z,open?36:34);this.world.setBlock(h.x,y+1,h.z,open?37:35);this.sound.play('door');this.hand.punch();return;}
      const stations={[B.CRAFTING]:'crafting',[B.FURNACE]:'furnace',[B.CHEST]:'chest'};
      if(stations[h.id]){this.releasePointer();this.ui.showInventory(stations[h.id],`${h.x},${h.y},${h.z}`);return;}
      if(h.id===B.BED){if(this.environment.daylight>.45)this.ui.toast('你只能在晚上睡觉');else {this.environment.day++;this.environment.setTime(1000);this.health=20;this.spawn={x:h.x+.5,y:h.y+1,z:h.z+.5};this.ui.toast('一夜好梦，天亮了');}return;}
    }
    if([105,107,120,106].includes(id)){if(this.hunger>=20&&this.mode==='survival'){this.ui.toast('饱食度已满');return;}this.hunger=Math.min(20,this.hunger+({105:4,107:8,120:5,106:3}[id]));this.saturation=Math.min(12,this.saturation+3);if(this.mode==='survival')this.inventory.consumeSelected(1);this.sound.play('eat');this.hand.punch();this.onInventoryChanged();return;}
    if(!h)return;
    if([125,126,127].includes(id)&&[B.GRASS,B.DIRT].includes(h.id)){
      const above=this.world.getBlock(h.x,h.y+1,h.z);if([B.AIR,B.TALL_GRASS,B.FLOWER].includes(above)){this.world.setBlock(h.x,h.y,h.z,30);this.world.setBlock(h.x,h.y+1,h.z,B.AIR);this.inventory.damageTool(1);this.hand.punch();this.sound.play('dig',B.DIRT);this.onInventoryChanged();}return;
    }
    if(id===122&&h.id===30&&this.world.getBlock(h.x,h.y+1,h.z)===B.AIR){this.world.setBlock(h.x,h.y+1,h.z,31);this.plants.set(`${h.x},${h.y+1},${h.z}`,{kind:'wheat',age:0,duration:100+Math.random()*100});if(this.mode==='survival')this.inventory.consumeSelected(1);this.onInventoryChanged();this.hand.punch();this.sound.play('place');return;}
    if(id===123&&[B.WATER,B.LAVA].includes(h.id)){this.world.setBlock(h.x,h.y,h.z,B.AIR);this.fluids?.removeSource(h.x,h.y,h.z);this.inventory.consumeSelected(1);this.inventory.add(124,1);this.onInventoryChanged();this.sound.play('water');return;}
    const replaceable=[B.TALL_GRASS,B.FLOWER].includes(h.id);
    const x=h.x+(replaceable?0:h.normal.x),y=h.y+(replaceable?0:h.normal.y),z=h.z+(replaceable?0:h.normal.z);
    if(id===124){if(!intersectsPlayer(x,y,z,this.player.position)){this.world.setBlock(x,y,z,B.WATER);this.fluids?.addSource(x,y,z);if(this.mode==='survival'){this.inventory.consumeSelected(1);this.inventory.add(123,1);}this.onInventoryChanged();this.sound.play('water');}return;}
    if(!id||id>=100||!BLOCKS[id])return;
    if(intersectsPlayer(x,y,z,this.player.position)&&isSolid(id))return;
    if(y<1||y>=95)return;
    const old=this.world.getBlock(x,y,z);if(old!==B.AIR&&old!==B.WATER&&old!==B.TALL_GRASS&&old!==B.FLOWER)return;
    if(id===34){if(y>=94||!isSolid(this.world.getBlock(x,y-1,z))||this.world.getBlock(x,y+1,z)!==B.AIR||intersectsPlayer(x,y+1,z,this.player.position))return;this.world.setBlock(x,y+1,z,35);}
    if(id===33&&![B.GRASS,B.DIRT,30].includes(this.world.getBlock(x,y-1,z))){this.ui.toast('树苗需要种在泥土或草方块上');return;}
    if(this.world.setBlock(x,y,z,id)){if(id===B.WATER)this.fluids?.addSource(x,y,z);if(this.mode==='survival')this.inventory.consumeSelected(1);this.sound.play('place',id);this.hand.punch();this.onInventoryChanged();}
    if(id===33)this.plants.set(`${x},${y},${z}`,{kind:'sapling',age:0,duration:120+Math.random()*100});
  }
  pickBlock(){if(!this.target)return;const id=this.target.id;let idx=this.inventory.slots.findIndex(s=>s?.id===id);
    if(idx<0&&this.mode==='creative'){idx=this.inventory.selected;this.inventory.slots[idx]={id,count:64};}
    if(idx>=9&&idx>=0){const temp=this.inventory.slots[this.inventory.selected];this.inventory.slots[this.inventory.selected]=this.inventory.slots[idx];this.inventory.slots[idx]=temp;}
    else if(idx>=0)this.inventory.setSelected(idx);this.onInventoryChanged();
  }
  dropSelected(all){const item=this.inventory.selectedItem;if(!item)return;const n=all?item.count:1;const id=item.id;this.inventory.consumeSelected(n);const pos=this.camera.position.clone().addScaledVector(this.camera.getWorldDirection(new THREE.Vector3()),1);this.effects.addDrop(id,n,pos);this.onInventoryChanged();}
  damage(amount,source='环境'){
    if(this.mode==='creative'||!this.started||this.health<=0||this.damageCooldown>0)return;
    this.health=Math.max(0,this.health-amount);this.damageCooldown=.8;this.hurt.style.opacity=.85;this.sound.play('hurt');
    if(this.health===0){
      this.deathSource=source;
      this.ui.close?.();
      if(!this.keepInventory){for(const s of this.inventory.slots)if(s)this.effects.addDrop(s.id,s.count,this.player.position.clone().add(new THREE.Vector3(0,.4,0)));this.inventory.slots=Array(36).fill(null);this.xp=0;this.onInventoryChanged();}
      this.ui.setScreen('death');this.releasePointer();this.save(false);
    }
  }
  async respawn(){
    this.ui.setScreen('loading');this.loading=true;await this.world.init(this.spawn.x,this.spawn.z);
    const pos=new THREE.Vector3(this.spawn.x,this.spawn.y,this.spawn.z);if(collides(this.world,pos))pos.y=this.world.getHeight(pos.x,pos.z)+.1;
    this.player.reset(pos);this.health=this.hunger=20;this.air=10;this.saturation=5;this.loading=false;this.hurt.style.opacity=0;this.resume();
  }
  survival(dt,move){
    this.stepTimer+=dt;if(move.moving&&this.player.grounded&&this.stepTimer>(move.sprinting?.29:.39)){this.stepTimer=0;const p=this.player.position;const id=this.world.getBlock(Math.floor(p.x),Math.floor(p.y-.1),Math.floor(p.z));this.sound.play('step',id);}
    if(move.jumped)this.sound.play('jump');
    if(this.mode==='creative'){this.air=10;return;}
    if(move.moving&&this.player.grounded)this.saturation-=dt*(move.sprinting?.028:.008);
    if(this.player.inWater&&move.moving)this.saturation-=dt*.02;
    this.survivalTimer+=dt;
    if(this.player.underWater){this.air=Math.max(0,this.air-dt*.65);}else this.air=Math.min(10,this.air+dt*3);
    if(this.survivalTimer>=4){this.survivalTimer=0;
      if(this.saturation<=0){this.hunger=Math.max(0,this.hunger-1);this.saturation=2;}
      if(this.hunger>=18&&this.health<20){this.health=Math.min(20,this.health+1);this.saturation-=.8;}
      if(this.hunger===0&&this.health>1)this.damage(1,'饥饿');
      if(this.air===0)this.damage(2,'溺水');
    }
    const p=this.player.position;const feet=this.world.getBlock(Math.floor(p.x),Math.floor(p.y+.1),Math.floor(p.z));
    if(feet===B.LAVA)this.damage(4,'熔岩');
    for(const [dx,dz]of [[0,0],[.32,0],[-.32,0],[0,.32],[0,-.32]])if(this.world.getBlock(Math.floor(p.x+dx),Math.floor(p.y+.5),Math.floor(p.z+dz))===B.CACTUS)this.damage(1,'仙人掌');
    if(p.y<-4)this.damage(20,'虚空');
    const head=this.world.getBlock(Math.floor(p.x),Math.floor(p.y+1.55),Math.floor(p.z));if(isSolid(head)&&![30,34,35,36,37].includes(head))this.damage(1,'窒息');
    if(move.jumped)this.saturation-=.008;
  }
  updateBlocks(){
    const p=this.player.position;
    for(let x=Math.floor(p.x)-5;x<=Math.floor(p.x)+5;x++)for(let z=Math.floor(p.z)-5;z<=Math.floor(p.z)+5;z++)for(let y=Math.max(2,Math.floor(p.y)-4);y<Math.floor(p.y)+5;y++){
      const id=this.world.getBlock(x,y,z);
      if([B.SAND,B.GRAVEL].includes(id)&&[B.AIR,B.WATER].includes(this.world.getBlock(x,y-1,z))&&!intersectsPlayer(x,y-1,z,p)){
        const below=this.world.getBlock(x,y-1,z);this.world.setBlock(x,y,z,below);this.world.setBlock(x,y-1,z,id);
      }
      if(id===B.WATER&&this.world.getBlock(x,y-1,z)===B.LAVA)this.world.setBlock(x,y-1,z,B.OBSIDIAN);
    }
  }
  updatePlants(dt){
    this.plantTimer+=dt;if(this.plantTimer<1)return;const elapsed=this.plantTimer;this.plantTimer=0;
    const p=this.player.position;
    for(let x=Math.floor(p.x)-10;x<=Math.floor(p.x)+10;x++)for(let z=Math.floor(p.z)-10;z<=Math.floor(p.z)+10;z++)for(let y=Math.max(1,Math.floor(p.y)-3);y<Math.floor(p.y)+4;y++)if(this.world.getBlock(x,y,z)===31&&!this.plants.has(`${x},${y},${z}`))this.plants.set(`${x},${y},${z}`,{kind:'wheat',age:0,duration:120+Math.random()*80});
    for(const [key,plant]of this.plants){const [x,y,z]=key.split(',').map(Number);if(!this.world.chunks.has(`${Math.floor(x/16)},${Math.floor(z/16)}`))continue;
      const id=this.world.getBlock(x,y,z);if(id!==(plant.kind==='wheat'?31:33)){this.plants.delete(key);continue;}
      const soil=this.world.getBlock(x,y-1,z);if(plant.kind==='wheat'?soil!==30:![B.GRASS,B.DIRT,30].includes(soil)){this.breakBlock({x,y,z,id});this.plants.delete(key);continue;}
      if(this.environment.daylight<.3)continue;
      let hydrated=false;if(plant.kind==='wheat')for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++)if(this.world.getBlock(x+dx,y-1,z+dz)===B.WATER)hydrated=true;
      plant.age+=elapsed*(plant.kind==='wheat'&&!hydrated?.5:1);
      if(plant.age<plant.duration)continue;
      if(plant.kind==='wheat')this.world.setBlock(x,y,z,32);
      else{
        let clear=true;for(let dy=1;dy<6;dy++)if(isSolid(this.world.getBlock(x,y+dy,z)))clear=false;
        if(!clear){plant.age=plant.duration-15;continue;}
        for(let dy=2;dy<=5;dy++){const r=dy===5?1:2;for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)if(this.world.getBlock(x+dx,y+dy,z+dz)===B.AIR)this.world.setBlock(x+dx,y+dy,z+dz,B.LEAVES);}
        for(let dy=0;dy<5;dy++)this.world.setBlock(x,y+dy,z,B.LOG);
      }
      this.plants.delete(key);
    }
  }
  save(notify=false){
    if(!this.world||!this.started||this.loading)return;
    if(this.ui.currentScreen==='inventory')this.ui.close();
    try{const p=this.player.position;const data={version:1,seed:this.world.seed,type:this.world.type,mode:this.mode,position:{x:p.x,y:p.y,z:p.z},spawn:this.spawn,yaw:this.yaw,pitch:this.pitch,flying:this.player.flying,health:this.health,hunger:this.hunger,saturation:this.saturation,xp:this.xp,time:this.environment.time,day:this.environment.day,keepInventory:this.keepInventory,inventory:this.inventory.serialize(),edits:this.world.saveEdits(),entities:this.entities?.serialize(),drops:this.effects.serializeDrops(),fluids:this.fluids?.serialize(),plants:[...this.plants],savedAt:Date.now()};localStorage.setItem(SAVE_KEY,JSON.stringify(data));if(notify)this.ui.toast('世界已保存到此浏览器');}catch(error){console.error('保存失败',error);this.ui.toast('存档空间不足，请减少方块修改数量');}
  }
  command(raw){
    const text=String(raw).trim().replace(/^\//,'');const a=text.split(/\s+/);const cmd=a.shift()?.toLowerCase();
    switch(cmd){
      case 'time':if(a[0]==='set'){const times={day:1000,noon:6000,night:13000,midnight:18000,sunrise:0,sunset:12000};const t=times[a[1]]??Number(a[1]);if(Number.isFinite(t)){this.environment.setTime(t);this.ui.toast(`时间已设为 ${a[1]}`);}}else if(a[0]==='add')this.environment.setTime(this.environment.time+Number(a[1]||0));break;
      case 'weather':this.environment.setWeather(a[0]==='rain'||a[0]==='thunder'?'rain':'clear');this.ui.toast('天气已改变');break;
      case 'gamemode':this.mode=['creative','1','创造'].includes(a[0])?'creative':'survival';this.inventory.mode=this.mode;this.ui.toast(this.mode==='creative'?'已切换至创造模式':'已切换至生存模式');break;
      case 'give':{if(a[0]==='@s')a.shift();const key=a.shift();const id=Number(key)||B[key?.toUpperCase()]||Object.values(ITEMS).find(i=>i.name===key)?.id;if(ITEMS[id]&&id>0){this.inventory.add(id,clamp(Number(a[0])||64,1,2304));this.onInventoryChanged();this.ui.toast(`获得 ${getItem(id).name}`);}else this.ui.toast('物品不存在');break;}
      case 'tp':{if(a[0]==='@s')a.shift();const p=this.player.position;const v=a.slice(0,3).map((s,i)=>s.startsWith('~')?[p.x,p.y,p.z][i]+Number(s.slice(1)||0):Number(s));const rotation=a.slice(3,5).map(Number);if(v.length===3&&v.every(Number.isFinite)&&rotation.every(Number.isFinite)){if(a[3]!==undefined)this.yaw=Math.PI-rotation[0]*Math.PI/180;if(a[4]!==undefined)this.pitch=clamp(-rotation[1]*Math.PI/180,-1.56,1.56);this.teleport(v);}else this.ui.toast('格式：/tp x y z [朝向 俯仰]');break;}
      case 'seed':this.ui.toast(`种子：${this.world.seed}`);break;
      case 'summon':{const type=a[0];const p=this.player.position;const pos=a.length>=4?new THREE.Vector3(...a.slice(1,4).map(Number)):p.clone().add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(4));if(this.entities?.spawnAt(type,pos))this.ui.toast(`生成了 ${type}`);else this.ui.toast('支持 sheep、pig、cow、zombie、creeper、skeleton');break;}
      case 'gamerule':if(a[0]==='doDaylightCycle'){this.settings.autoTime=a[1]!=='false';this.ui.toast(`昼夜循环：${this.settings.autoTime?'开启':'关闭'}`);}else if(a[0]==='keepInventory'){this.keepInventory=a[1]==='true';this.ui.toast(`死亡保留物品：${this.keepInventory?'开启':'关闭'}`);}break;
      case 'timespeed':this.settings.timeSpeed=clamp(Number(a[0])||1,.1,100);this.ui.toast(`时间流速：${this.settings.timeSpeed} 倍`);break;
      case 'help':this.ui.toast('/time set day|night · /weather rain · /gamemode creative · /give 6 64 · /tp x y z · /timespeed 10',9000);break;
      default:this.ui.toast('未知指令；输入 /help 查看帮助');
    }
    this.resume();
  }
  async teleport(v){this.loading=true;this.ui.setScreen('loading');await this.world.init(v[0],v[2]);this.player.reset(new THREE.Vector3(...v));this.loading=false;this.resume();}
  screenshot(){this.renderer.clear();this.renderer.render(this.scene,this.camera);this.hand.render(this.renderer);const link=document.createElement('a');link.download=`方块世界-${Date.now()}.png`;link.href=this.canvas.toDataURL('image/png');link.click();this.ui.toast('截图已保存');}
  frame(now){
    requestAnimationFrame(t=>this.frame(t));const dt=Math.min((now-this.last)/1000,.08);this.last=now;this.elapsed+=dt;this.frameCounter++;this.fpsTimer+=dt;
    if(this.fpsTimer>1){this.fps=Math.round(this.frameCounter/this.fpsTimer);this.frameCounter=0;this.fpsTimer=0;}
    const running=this.started&&!this.loading&&!this.ui.isOpen&&this.health>0;
    if(this.world&&!this.loading){
      if(running){
        this.damageCooldown=Math.max(0,this.damageCooldown-dt);this.interactCooldown=Math.max(0,this.interactCooldown-dt);this.attackCooldown=Math.max(0,this.attackCooldown-dt);this.itemLabelTime=Math.max(0,(this.itemLabelTime||0)-dt);
        this.accumulator+=dt;let move={};while(this.accumulator>=1/60){move=this.player.update(1/60,this.keys,this.yaw,this.world,this.mode,a=>this.damage(a,'摔落'));this.accumulator-=1/60;}
        this.survival(dt,move);this.updateCamera(dt);const dir=this.camera.getWorldDirection(new THREE.Vector3());this.target=this.world.raycast(this.camera.position,dir,this.mode==='creative'?5:4.5,this.inventory.selectedItem?.id===123);
        this.tickMining(dt);this.effects.target(this.target,this.breakProgress);this.entities?.update(dt,this.player,{daylight:this.environment.daylight,time:this.environment.time,mode:this.mode,paused:false});this.effects.update(dt,this.world,this.player,this.inventory,this.sound);
        this.hand.setItem(this.inventory.selectedItem?.id||null);this.hand.update(dt,this.player,this.environment.daylight);
        this.saveTimer+=dt;if(this.saveTimer>30){this.saveTimer=0;this.save(false);}
        this.blockTick+=dt;if(this.blockTick>.4){this.blockTick=0;this.updateBlocks();}
        this.fluids?.update(dt);
        this.updatePlants(dt);
      }else if(!this.started&&this.previewCenter){const c=this.previewCenter;const a=-.7+this.elapsed*.018;this.camera.position.set(c.x+Math.sin(a)*7,c.y+5,c.z+Math.cos(a)*7);this.camera.lookAt(c.x,c.y+1,c.z);this.player.position.copy(c);}
      this.world.update(this.player.position.x,this.player.position.z,running?dt:0);
    }
    this.environment.update(running?dt:0,this.camera.position,this.settings,!running);
    this.world?.materials?.water?.userData?.skyColor?.value.copy(this.scene.fog.color);
    if(this.player.underWater&&running){this.scene.fog.color.set(0x24628f);this.scene.fog.density=.11;this.water.style.display='block';}else{this.scene.fog.density=.046/Math.max(2,this.settings.renderDistance);this.water.style.display='none';}
    this.hurt.style.opacity=String(this.damageCooldown*.5);
    this.renderer.clear();this.renderer.render(this.scene,this.camera);if(running&&!this.photo)this.hand.render(this.renderer);
    this.sound.update?.(dt,{inWater:this.player.inWater,daylight:this.environment.daylight,rain:this.environment.rainAmount,paused:!running});
    if(this.started){
      const p=this.player.position;const item=this.inventory.selectedItem;const state={health:this.health,hunger:this.hunger,air:this.air,xp:this.xp,selected:this.inventory.selected,mode:this.mode,itemName:this.itemLabelTime>0?getItem(item?.id)?.name||'':'',targetName:this.target?BLOCKS[this.target.id]?.name||'':'',biome:this.world.getBiome(p.x,p.z),time:this.environment.time,day:this.environment.day,fps:this.fps,position:p,flying:this.player.flying,debug:this.debug,saveAvailable:!!localStorage.getItem(SAVE_KEY),deathSource:this.deathSource,seed:this.world.seed,weather:this.environment.weather,breaking:this.breakProgress,chunks:this.world.chunks.size};this.ui.update(state);
      if(this.debug)this.canvas.setAttribute('data-state',JSON.stringify({position:{x:p.x,y:p.y,z:p.z},health:this.health,hunger:this.hunger,time:Math.round(this.environment.time),mode:this.mode,grounded:this.player.grounded,target:this.target,chunks:this.world.chunks.size,inventory:this.inventory.serialize()}));
    }
  }
}

try { new Game(); } catch(error) {console.error(error);const panel=document.createElement('div');panel.id='boot-error';const h=document.createElement('h1');h.textContent='游戏启动失败';const p=document.createElement('p');p.textContent=`请使用支持 WebGL 2 的桌面浏览器。${error.message}`;panel.append(h,p);document.body.append(panel);}
