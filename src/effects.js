import * as THREE from 'three';
import { BLOCKS, B, getItem, getTile } from './blocks.js';
import { itemIcon, createAtlas } from './textures.js';
import { blockBounds } from './shapes.js';

const box=new THREE.BoxGeometry(1,1,1);
const cachedIcons=new Map();
function texture(id){if(!cachedIcons.has(id)){const t=new THREE.TextureLoader().load(itemIcon(id));t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;t.colorSpace=THREE.SRGBColorSpace;cachedIcons.set(id,t);}return cachedIcons.get(id);}
function blockGeometry(id,size){const geo=new THREE.BoxGeometry(size,size,size),uv=geo.attributes.uv,atlas=createAtlas();for(let f=0;f<6;f++){const [cx,cy]=atlas.tiles[getTile(id,f)]||atlas.tiles.stone;for(let k=0;k<4;k++){const i=f*4+k;uv.setXY(i,(cx+uv.getX(i))/8,1-(cy+1-uv.getY(i))/8);}}return geo;}

export class Effects {
  constructor(scene){
    this.scene=scene;this.particles=[];this.drops=[];this.time=0;this.lights=[];
    this.outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.005,1.005,1.005)),new THREE.LineBasicMaterial({color:0x111111,transparent:true,opacity:.65}));this.outline.visible=false;scene.add(this.outline);
    this.crackTextures=[];
    for(let stage=0;stage<10;stage++){
      const c=document.createElement('canvas');c.width=c.height=16;const ctx=c.getContext('2d');ctx.fillStyle='rgba(12,10,8,.8)';
      let seed=72;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
      for(let branch=0;branch<stage+2;branch++){let x=7,y=7;for(let k=0;k<stage+3;k++){x+=Math.floor(rand()*3)-1;y+=Math.floor(rand()*3)-1;ctx.fillRect(x,y,stage>7?2:1,1);}}
      const t=new THREE.CanvasTexture(c);t.magFilter=THREE.NearestFilter;this.crackTextures.push(t);
    }
    this.crackMat=new THREE.MeshBasicMaterial({map:this.crackTextures[0],transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
    this.crack=new THREE.Mesh(new THREE.BoxGeometry(1.006,1.006,1.006),this.crackMat);this.crack.visible=false;scene.add(this.crack);
  }
  target(hit,progress){
    this.outline.visible=!!hit;this.crack.visible=!!hit&&progress>0;
    if(hit){const b=blockBounds(hit.id);this.outline.position.set(hit.x+(b[0][0]+b[0][1])/2,hit.y+(b[1][0]+b[1][1])/2,hit.z+(b[2][0]+b[2][1])/2);this.outline.scale.set(b[0][1]-b[0][0],b[1][1]-b[1][0],b[2][1]-b[2][0]);this.crack.position.copy(this.outline.position);this.crack.scale.copy(this.outline.scale);this.crackMat.map=this.crackTextures[Math.min(9,Math.floor(progress*10))];}
  }
  burst(x,y,z,id,count=18){
    const color=BLOCKS[id]?.color||'#8f7d62';
    for(let i=0;i<count;i++){
      const mat=new THREE.MeshLambertMaterial({color});const mesh=new THREE.Mesh(box,mat);mesh.scale.setScalar(.05+Math.random()*.065);mesh.position.set(x+Math.random(),y+Math.random(),z+Math.random());this.scene.add(mesh);
      this.particles.push({mesh,life:.55+Math.random()*.3,velocity:new THREE.Vector3((Math.random()-.5)*4,Math.random()*4,(Math.random()-.5)*4)});
    }
  }
  addDrop(id,count,pos){
    for(const d of this.drops){if(d.id===id&&d.pos.distanceTo(pos)<1&&d.count+count<=64){d.count+=count;return;}}
    const group=new THREE.Group();
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.28,.28),new THREE.MeshBasicMaterial({map:texture(id),transparent:true,side:THREE.DoubleSide,alphaTest:.1}));group.add(mesh);group.position.copy(pos);this.scene.add(group);
    this.drops.push({id,count,pos:group.position,mesh:group,velocity:new THREE.Vector3((Math.random()-.5)*1.5,2.5,(Math.random()-.5)*1.5),age:0,onGround:false});
  }
  update(dt,world,player,inventory,sound){
    this.time+=dt;
    for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.life-=dt;p.velocity.y-=14*dt;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.rotation.x+=dt*2;
      if(p.life<0){this.scene.remove(p.mesh);p.mesh.material.dispose();this.particles.splice(i,1);}}
    for(let i=this.drops.length-1;i>=0;i--){const d=this.drops[i];d.age+=dt;d.mesh.rotation.y+=dt*1.4;
      if(!d.onGround){d.velocity.y-=18*dt;const oldY=d.pos.y;d.pos.addScaledVector(d.velocity,dt);
        if(BLOCKS[world.getBlock(Math.floor(d.pos.x),Math.floor(d.pos.y-.1),Math.floor(d.pos.z))]?.solid){d.pos.y=Math.floor(oldY)+.16;d.velocity.set(0,0,0);d.onGround=true;}}
      d.mesh.children[0].position.y=.1+Math.sin(this.time*2.5+d.id)*.045;
      const dist=d.pos.distanceTo(player.position.clone().add(new THREE.Vector3(0,.65,0)));
      if(d.age>.6&&dist<2.1){const vec=player.position.clone().add(new THREE.Vector3(0,.7,0)).sub(d.pos);d.pos.addScaledVector(vec,dt*8);}
      if(d.age>.65&&dist<.9){const remain=inventory.add(d.id,d.count);if(remain!==d.count)sound?.play('pickup');d.count=remain;}
      if(d.count===0||d.age>300||d.pos.y<-5){this.scene.remove(d.mesh);d.mesh.children[0].material.dispose();this.drops.splice(i,1);}
    }
  }
  serializeDrops(){return this.drops.map(d=>({id:d.id,count:d.count,x:d.pos.x,y:d.pos.y,z:d.pos.z,age:d.age}));}
  loadDrops(data){for(const d of data){if(!getItem(d.id)||!Number.isFinite(d.x+d.y+d.z)||d.count<=0)continue;this.addDrop(d.id,d.count,new THREE.Vector3(d.x,d.y,d.z));const drop=this.drops[this.drops.length-1];if(drop)drop.age=Math.max(0,d.age||0);}}
  refreshTorches(world,player){
    const candidates=[];
    const p=player.position;
    for(let x=Math.floor(p.x)-12;x<Math.floor(p.x)+12;x++)for(let z=Math.floor(p.z)-12;z<Math.floor(p.z)+12;z++)for(let y=Math.max(0,Math.floor(p.y)-6);y<Math.floor(p.y)+6;y++)if(world.getBlock(x,y,z)===B.TORCH)candidates.push({x:x+.5,y:y+.8,z:z+.5,dist:(x-p.x)**2+(z-p.z)**2});
    candidates.sort((a,b)=>a.dist-b.dist);
    for(let i=0;i<Math.min(8,candidates.length);i++){if(!this.lights[i]){this.lights[i]=new THREE.PointLight(0xffb64b,7.5,12,1.5);this.scene.add(this.lights[i]);}this.lights[i].position.set(candidates[i].x,candidates[i].y,candidates[i].z);this.lights[i].visible=true;}
    for(let i=Math.min(8,candidates.length);i<this.lights.length;i++)this.lights[i].visible=false;
  }
  clear(){for(const p of this.particles){this.scene.remove(p.mesh);p.mesh.material.dispose();}this.particles=[];for(const d of this.drops){this.scene.remove(d.mesh);d.mesh.children[0].material.dispose();}this.drops=[];for(const l of this.lights)this.scene.remove(l);this.lights=[];}
}

export class Hand {
  constructor(){
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.01,10);this.camera.position.set(0,0,0);
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x746d57,2));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-1,3,2);this.scene.add(sun);
    this.group=new THREE.Group();this.scene.add(this.group);
    const skin=new THREE.MeshLambertMaterial({color:0xb47e57});const sleeve=new THREE.MeshLambertMaterial({color:0x27b5b7});
    this.arm=new THREE.Group();const arm=new THREE.Mesh(new THREE.BoxGeometry(.15,.43,.16),skin);arm.position.y=.1;this.arm.add(arm);const shirt=new THREE.Mesh(new THREE.BoxGeometry(.155,.18,.165),sleeve);shirt.position.y=-.1;this.arm.add(shirt);this.arm.rotation.set(-.45,.2,-.12);this.group.add(this.arm);
    this.itemGroup=new THREE.Group();this.group.add(this.itemGroup);this.id=null;this.swing=0;this.swingTime=0;
  }
  setItem(id){if(this.id===id)return;this.id=id;while(this.itemGroup.children.length){const c=this.itemGroup.children[0];this.itemGroup.remove(c);c.geometry.dispose();c.material.dispose();}
    this.arm.visible=!id;
    if(!id)return;
    const cube=id<100&&![B.TORCH,B.FLOWER,B.TALL_GRASS,31,32,33,34].includes(id);
    const mat=new THREE.MeshLambertMaterial({map:cube?createAtlas().texture:texture(id),alphaTest:.1,transparent:!cube||[B.GLASS,B.LEAVES].includes(id),side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(cube?blockGeometry(id,.23):new THREE.PlaneGeometry(.36,.36),mat);mesh.rotation.set(cube?.3:-.17,cube?-.65:-.35,cube?.1:-.13);mesh.position.set(.015,.015,0);this.itemGroup.add(mesh);
  }
  punch(){this.swingTime=.27;}
  update(dt,player,health){
    this.swingTime=Math.max(0,this.swingTime-dt);const s=Math.sin(this.swingTime/.27*Math.PI);
    const speed=Math.hypot(player.velocity.x,player.velocity.z);const bob=player.grounded?Math.sin(player.walkDistance*2.2)*Math.min(speed*.0025,.018):0;
    this.group.position.set(.34-s*.13,-.28+bob-s*.025,-.56+s*.09);this.group.rotation.set(-s*.35,0,-s*.6);
    this.scene.children[0].intensity=health>.3?2:1;
  }
  render(renderer){renderer.clearDepth();renderer.render(this.scene,this.camera);}
  resize(){this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();}
}
