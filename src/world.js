import * as THREE from 'three';
import { B, BLOCKS, isSolid, isTransparent, tileForFace } from './blocks.js';
import { createAtlas } from './textures.js';
import { intersectBlock } from './shapes.js';
import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, generateChunk, sampleColumn, indexOf } from './terrain.js';
export { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL };

const FACES=[
 {name:'px',n:[1,0,0],v:[[1,0,1],[1,0,0],[1,1,0],[1,1,1]],u:2,w:1,shade:.88},
 {name:'nx',n:[-1,0,0],v:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]],u:2,w:1,shade:.88},
 {name:'py',n:[0,1,0],v:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]],u:0,w:2,shade:1},
 {name:'ny',n:[0,-1,0],v:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],u:0,w:2,shade:.54},
 {name:'pz',n:[0,0,1],v:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]],u:0,w:1,shade:.78},
 {name:'nz',n:[0,0,-1],v:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]],u:0,w:1,shade:.78},
];
const key=(x,z)=>`${x},${z}`;
const voxelKey=(x,y,z)=>`${x},${y},${z}`;
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function meshData(){return {positions:[],normals:[],uvs:[],colors:[],indices:[]};}
function geometry(data){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(data.uvs,2));g.setAttribute('color',new THREE.Float32BufferAttribute(data.colors,3));g.setIndex(data.indices);g.computeBoundingBox();g.computeBoundingSphere();return g;}

export class World {
 constructor(scene,{seed=241108,type='normal',renderDistance=4,onProgress}={}){
  this.scene=scene;this.seed=Number.isFinite(Number(seed))?Number(seed):241108;this.type=['normal','amplified','floating'].includes(type)?type:'normal';this.renderDistance=Math.max(2,Math.min(10,Math.round(renderDistance)));
  this.onProgress=onProgress;this.chunks=new Map();this.group=new THREE.Group();this.group.name='Voxel world';scene.add(this.group);
  this.atlas=createAtlas();this.edits=new Map();this.editsByChunk=new Map();this.dirty=new Set();this.queue=[];this.center=null;this.elapsed=0;this.disposed=false;this.torchPositions=new Map();this.torchLights=[];
  for(let i=0;i<8;i++){const light=new THREE.PointLight(0xffc16c,4.5,13,1.65);light.visible=false;this.group.add(light);this.torchLights.push(light);}
  this.materials={
   opaque:new THREE.MeshStandardMaterial({map:this.atlas.texture,vertexColors:true,roughness:1,metalness:0,alphaTest:.45}),
   water:new THREE.MeshStandardMaterial({map:this.atlas.texture,vertexColors:true,color:0xa7ceff,transparent:true,opacity:.64,roughness:.19,metalness:.08,depthWrite:false,side:THREE.DoubleSide}),
   lava:new THREE.MeshStandardMaterial({map:this.atlas.texture,vertexColors:true,emissive:0xff5d0b,emissiveIntensity:.9,roughness:.5}),
  };
  this.materials.water.userData.time={value:0};
  this.materials.water.userData.skyColor={value:new THREE.Color(0xbddbec)};
  this.materials.water.onBeforeCompile=shader=>{
   shader.uniforms.waterTime=this.materials.water.userData.time;
   shader.uniforms.waterSkyColor=this.materials.water.userData.skyColor;
   shader.vertexShader='uniform float waterTime;\nvarying vec3 waterPosition;\nvarying float waterUp;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nwaterPosition=(modelMatrix*vec4(position,1.0)).xyz;waterUp=normal.y;\nif(normal.y>0.5){transformed.y+=sin(waterPosition.x*1.1+waterTime*1.2)*cos(waterPosition.z*.9+waterTime*.7)*.026;}');
   shader.fragmentShader='uniform float waterTime;\nuniform vec3 waterSkyColor;\nvarying vec3 waterPosition;\nvarying float waterUp;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat ripple=sin(waterPosition.x*3.4+waterTime*1.3)*sin(waterPosition.z*2.8-waterTime*.9);\ndiffuseColor.rgb*=.93+ripple*.085;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nif(waterUp>.5){vec3 waveNormal=vec3(cos(waterPosition.x*1.7+waterTime*1.1)*.055,1.0,sin(waterPosition.z*1.4-waterTime*.8)*.055);normal=normalize(mat3(viewMatrix)*waveNormal)*faceDirection;}');
   shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','if(waterUp>.5){float fresnel=pow(1.0-max(dot(normal,normalize(vViewPosition)),0.0),4.0);outgoingLight=mix(outgoingLight,waterSkyColor,.05+fresnel*.55);}\n#include <opaque_fragment>');
   this.materials.water.userData.shader=shader;
  };
  this.materials.water.customProgramCacheKey=()=> 'voxel-water-v2';
 }
 _loadChunk(cx,cz){
  const k=key(cx,cz);if(this.chunks.has(k))return this.chunks.get(k);
  const chunk=generateChunk(cx,cz,this.seed,this.type);chunk.meshes=[];chunk.key=k;
  const changes=this.editsByChunk.get(k);if(changes)for(const [pos,id]of changes){const [x,y,z]=pos.split(',').map(Number);chunk.data[indexOf(x-cx*16,y,z-cz*16)]=id;}
  this.chunks.set(k,chunk);this.dirty.add(k);
  // Generated and saved torches enter the same bounded light pool.
  for(let y=0;y<96;y++)for(let z=0;z<16;z++)for(let x=0;x<16;x++)if(chunk.data[indexOf(x,y,z)]===B.TORCH){const wx=cx*16+x,wz=cz*16+z;this.torchPositions.set(voxelKey(wx,y,wz),new THREE.Vector3(wx+.5,y+.8,wz+.5));}
  for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]])if(this.chunks.has(key(cx+dx,cz+dz)))this.dirty.add(key(cx+dx,cz+dz));
  return chunk;
 }
 async init(px=0,pz=0){
  const cx=Math.floor(px/16),cz=Math.floor(pz/16),radius=Math.min(this.renderDistance,2),coords=[];
  for(let z=-radius;z<=radius;z++)for(let x=-radius;x<=radius;x++)coords.push([cx+x,cz+z,x*x+z*z]);coords.sort((a,b)=>a[2]-b[2]);
  this.onProgress?.(.02,'生成地形');
  for(let i=0;i<coords.length;i++){if(this.disposed)return;this._loadChunk(coords[i][0],coords[i][1]);this.onProgress?.(.04+(i+1)/coords.length*.56,'生成地形、洞穴与森林');if(i%3===0)await tick();}
  const keys=[...this.dirty];for(let i=0;i<keys.length;i++){if(this.disposed)return;this._buildChunk(this.chunks.get(keys[i]));this.dirty.delete(keys[i]);this.onProgress?.(.6+(i+1)/keys.length*.4,'计算方块光照');if(i%2===0)await tick();}
  this._refreshQueue(cx,cz);this.onProgress?.(1,'世界已就绪');
 }
 getBlock(x,y,z){
  x=Math.floor(x);y=Math.floor(y);z=Math.floor(z);if(!Number.isFinite(x+y+z))return B.AIR;if(y<0)return this.type==='floating'?B.AIR:B.BEDROCK;if(y>=WORLD_HEIGHT)return B.AIR;
  const cx=Math.floor(x/16),cz=Math.floor(z/16),chunk=this.chunks.get(key(cx,cz));if(!chunk)return B.AIR;return chunk.data[indexOf(x-cx*16,y,z-cz*16)];
 }
 setBlock(x,y,z,id){
  x=Math.floor(x);y=Math.floor(y);z=Math.floor(z);if(!Number.isFinite(x+y+z)||y<1||y>=WORLD_HEIGHT||!BLOCKS[id])return false;
  const cx=Math.floor(x/16),cz=Math.floor(z/16),k=key(cx,cz),chunk=this.chunks.get(k);if(!chunk)return false;
  const localX=x-cx*16,localZ=z-cz*16,idx=indexOf(localX,y,localZ);if(chunk.data[idx]===id||chunk.data[idx]===B.BEDROCK)return false;
  chunk.data[idx]=id;const pos=voxelKey(x,y,z);this.edits.set(pos,id);if(!this.editsByChunk.has(k))this.editsByChunk.set(k,new Map());this.editsByChunk.get(k).set(pos,id);this.dirty.add(k);
  // Corner occlusion can change in every adjacent chunk.
  const dxs=[0],dzs=[0];if(localX===0)dxs.push(-1);if(localX===15)dxs.push(1);if(localZ===0)dzs.push(-1);if(localZ===15)dzs.push(1);
  for(const dx of dxs)for(const dz of dzs)if(this.chunks.has(key(cx+dx,cz+dz)))this.dirty.add(key(cx+dx,cz+dz));
  if(id===B.TORCH)this.torchPositions.set(pos,new THREE.Vector3(x+.5,y+.8,z+.5));else this.torchPositions.delete(pos);
  return true;
 }
 getHeight(x,z){
  x=Math.floor(x);z=Math.floor(z);const cx=Math.floor(x/16),cz=Math.floor(z/16),chunk=this.chunks.get(key(cx,cz));
  if(chunk){for(let y=WORLD_HEIGHT-1;y>=0;y--)if(isSolid(chunk.data[indexOf(x-cx*16,y,z-cz*16)]))return y+1;return 0;}
  const c=sampleColumn(x,z,this.seed,this.type);return c.present?c.height+1:0;
 }
 getBiome(x,z){return sampleColumn(Math.floor(x),Math.floor(z),this.seed,this.type).biome;}
 getSurfaceInfo(x,z){return sampleColumn(Math.floor(x),Math.floor(z),this.seed,this.type);}
 findSpawn(){
  for(let r=0;r<=24;r++)for(let z=-r;z<=r;z++)for(let x=-r;x<=r;x++){if(r&&Math.abs(x)!==r&&Math.abs(z)!==r)continue;const y=this.getHeight(x,z),under=this.getBlock(x,y-1,z);if(y>SEA_LEVEL+1&&[B.GRASS,B.SNOW,B.SAND].includes(under)&&this.getBlock(x,y,z)===B.AIR&&this.getBlock(x,y+1,z)===B.AIR)return {x:x+.5,y:y+.02,z:z+.5};}
  return {x:.5,y:this.getHeight(0,0)+.05,z:.5};
 }
 _occludes(x,y,z){const id=this.getBlock(x,y,z);return isSolid(id)&&!isTransparent(id);}
 _addFace(d,x,y,z,id,face,bounds=null,ambient=true,textureOverride=null){
  const tile=this.atlas.tiles[textureOverride||tileForFace(id,face.name)]||this.atlas.tiles.stone;
  const unit=this.atlas.tileSize/this.atlas.size,inset=.025/this.atlas.size;
  const u0=tile[0]*unit+inset,u1=(tile[0]+1)*unit-inset,v0=1-(tile[1]+1)*unit+inset,v1=1-tile[1]*unit-inset;
  const uv=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]],start=d.positions.length/3,ao=[];
  for(let i=0;i<4;i++){
   const v=face.v[i],vertex=[...v];if(bounds)for(let j=0;j<3;j++)vertex[j]=bounds[j][v[j]];
   d.positions.push(x+vertex[0],y+vertex[1],z+vertex[2]);d.normals.push(...face.n);d.uvs.push(...uv[i]);
   let a=1;
   if(ambient){const p=[x+face.n[0],y+face.n[1],z+face.n[2]],su=v[face.u]===0?-1:1,sv=v[face.w]===0?-1:1;const sideU=[...p],sideV=[...p],corner=[...p];sideU[face.u]+=su;sideV[face.w]+=sv;corner[face.u]+=su;corner[face.w]+=sv;
    const a1=this._occludes(...sideU)?1:0,a2=this._occludes(...sideV)?1:0,c=this._occludes(...corner)?1:0;const brightness=a1&&a2?0:3-a1-a2-c;a=[.53,.69,.84,1][brightness];
   }
   // Gentle green biome variation on foliage, using existing generation data.
   const light=face.shade*a;d.colors.push(light,light,light);ao.push(a);
  }
  if(ao[0]+ao[2]>ao[1]+ao[3])d.indices.push(start,start+1,start+3,start+1,start+2,start+3);else d.indices.push(start,start+1,start+2,start,start+2,start+3);
 }
 _addPlant(d,x,y,z,id){
  const tile=this.atlas.tiles[BLOCKS[id].tile],unit=16/this.atlas.size,u0=tile[0]*unit,u1=u0+unit,v1=1-tile[1]*unit,v0=v1-unit;
  const planes=[[[.12,0,.12],[.88,0,.88],[.88,1,.88],[.12,1,.12]],[[.88,0,.12],[.12,0,.88],[.12,1,.88],[.88,1,.12]]];
  const height=id===B.CROP_YOUNG?.65:id===B.CROP_MATURE?.94:id===B.SAPLING?.85:1,offset=this.getBlock(x,y-1,z)===B.FARMLAND?-.0625:0;
  for(const verts of planes){let start=d.positions.length/3;for(let i=0;i<4;i++){d.positions.push(x+verts[i][0],y+offset+verts[i][1]*height,z+verts[i][2]);d.normals.push(0,1,0);d.uvs.push(i===0||i===3?u0:u1,i<2?v0:v1);d.colors.push(.93,.93,.93);}d.indices.push(start,start+1,start+2,start,start+2,start+3,start+2,start+1,start,start+3,start+2,start);}
 }
 _buildChunk(chunk){
  if(!chunk)return;
  for(const m of chunk.meshes){this.group.remove(m);m.geometry.dispose();}chunk.meshes=[];
  const opaque=meshData(),water=meshData(),lava=meshData(),baseX=chunk.cx*16,baseZ=chunk.cz*16;
  for(let y=0;y<WORLD_HEIGHT;y++)for(let z=0;z<16;z++)for(let x=0;x<16;x++){
   const id=chunk.data[indexOf(x,y,z)];if(id===B.AIR)continue;const wx=baseX+x,wz=baseZ+z;
   if([B.FLOWER,B.TALL_GRASS,B.CROP_YOUNG,B.CROP_MATURE,B.SAPLING].includes(id)){this._addPlant(opaque,wx,y,wz,id);continue;}
   if(id===B.TORCH){for(const face of FACES){this._addFace(opaque,wx,y,wz,id,face,[[.4375,.5625],[0,.625],[.4375,.5625]],false,'planks');this._addFace(lava,wx,y,wz,id,face,[[.40625,.59375],[.625,.75],[.40625,.59375]],false,'lava');}continue;}
   let bounds=null;if(id===B.CACTUS)bounds=[[.0625,.9375],[0,1],[.0625,.9375]];if(id===B.BED)bounds=[[0,1],[0,.5625],[0,1]];if(id===B.CHEST)bounds=[[.0625,.9375],[0,.875],[.0625,.9375]];
   if(id===B.FARMLAND)bounds=[[0,1],[0,.9375],[0,1]];
   if(id===B.DOOR||id===B.DOOR_TOP)bounds=[[0,1],[0,1],[0,.1875]];
   if(id===B.DOOR_OPEN||id===B.DOOR_OPEN_TOP)bounds=[[0,.1875],[0,1],[0,1]];
   const liquid=id===B.WATER||id===B.LAVA,target=liquid?(id===B.WATER?water:lava):opaque;
   for(const face of FACES){
    const neighbor=this.getBlock(wx+face.n[0],y+face.n[1],wz+face.n[2]);
    if(liquid){if(neighbor===id||isSolid(neighbor)&&!isTransparent(neighbor))continue;const liquidBounds=[[0,1],[0,this.getBlock(wx,y+1,wz)===id?1:.88],[0,1]];this._addFace(target,wx,y,wz,id,face,liquidBounds,false);}
    else{if(!bounds && (isSolid(neighbor)&&!isTransparent(neighbor)||neighbor===id&&[B.LEAVES,B.GLASS].includes(id)))continue;this._addFace(target,wx,y,wz,id,face,bounds,id!==B.GLASS);}
   }
  }
  for(const [data,name]of [[opaque,'opaque'],[water,'water'],[lava,'lava']])if(data.positions.length){const m=new THREE.Mesh(geometry(data),this.materials[name]);m.name=`Chunk ${chunk.key} ${name}`;m.castShadow=name==='opaque';m.receiveShadow=true;m.renderOrder=name==='water'?2:0;this.group.add(m);chunk.meshes.push(m);}
 }
 _refreshQueue(cx,cz){
  this.center={x:cx,z:cz};const coords=[],r=this.renderDistance;
  for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++)if(dx*dx+dz*dz<=(r+.5)*(r+.5)&&!this.chunks.has(key(cx+dx,cz+dz)))coords.push({x:cx+dx,z:cz+dz,d:dx*dx+dz*dz});coords.sort((a,b)=>a.d-b.d);this.queue=coords;
  for(const [k,chunk]of this.chunks)if(Math.abs(chunk.cx-cx)>r+2||Math.abs(chunk.cz-cz)>r+2){for(const m of chunk.meshes){this.group.remove(m);m.geometry.dispose();}this.chunks.delete(k);this.dirty.delete(k);for(const [pos,p]of this.torchPositions)if(Math.floor(p.x/16)===chunk.cx&&Math.floor(p.z/16)===chunk.cz)this.torchPositions.delete(pos);}
 }
 update(px,pz,dt=0){
  if(this.disposed)return;this.elapsed+=dt;this.materials.water.userData.time.value=this.elapsed;
  const cx=Math.floor(px/16),cz=Math.floor(pz/16);if(!this.center||cx!==this.center.x||cz!==this.center.z)this._refreshQueue(cx,cz);
  const start=performance.now();
  // The chunk under the player always receives priority after a teleport.
  if(!this.chunks.has(key(cx,cz)))this._loadChunk(cx,cz);
  if(this.queue.length){const c=this.queue.shift();this._loadChunk(c.x,c.z);}
  let built=0;for(const k of this.dirty){this._buildChunk(this.chunks.get(k));this.dirty.delete(k);if(++built>=2||performance.now()-start>8)break;}
  const nearest=[...this.torchPositions.values()].filter(p=>(p.x-px)**2+(p.z-pz)**2<28*28).sort((a,b)=>(a.x-px)**2+(a.z-pz)**2-((b.x-px)**2+(b.z-pz)**2)).slice(0,8);
  for(let i=0;i<this.torchLights.length;i++){const light=this.torchLights[i];light.visible=i<nearest.length;if(light.visible){light.position.copy(nearest[i]);light.intensity=4.5+Math.sin(this.elapsed*17+light.position.x)*.16;}}
 }
 setRenderDistance(n){this.renderDistance=Math.max(2,Math.min(10,Math.round(n)));if(this.center)this._refreshQueue(this.center.x,this.center.z);}
 raycast(origin,direction,maxDistance=5,includeLiquids=false){
  const ox=origin.x,oy=origin.y,oz=origin.z;let x=Math.floor(ox),y=Math.floor(oy),z=Math.floor(oz);const length=Math.hypot(direction.x,direction.y,direction.z);if(length<.00001)return null;const dx=direction.x/length,dy=direction.y/length,dz=direction.z/length;
  const sx=Math.sign(dx),sy=Math.sign(dy),sz=Math.sign(dz),tx=dx?Math.abs(1/dx):Infinity,ty=dy?Math.abs(1/dy):Infinity,tz=dz?Math.abs(1/dz):Infinity;
  let mx=dx?((sx>0?x+1:x)-ox)/dx:Infinity,my=dy?((sy>0?y+1:y)-oy)/dy:Infinity,mz=dz?((sz>0?z+1:z)-oz)/dz:Infinity,distance=0,normal={x:0,y:0,z:0};
  while(distance<=maxDistance){const id=this.getBlock(x,y,z);if(id!==B.AIR&&(includeLiquids||id!==B.WATER&&id!==B.LAVA)){const hit=intersectBlock(origin,{x:dx,y:dy,z:dz},x,y,z,id,maxDistance);if(hit)return {x,y,z,id,normal:hit.normal,distance:hit.distance};}
   if(mx<my&&mx<mz){x+=sx;distance=mx;mx+=tx;normal={x:-sx,y:0,z:0};}else if(my<mz){y+=sy;distance=my;my+=ty;normal={x:0,y:-sy,z:0};}else{z+=sz;distance=mz;mz+=tz;normal={x:0,y:0,z:-sz};}
  }return null;
 }
 saveEdits(){return [...this.edits].map(([pos,id])=>[...pos.split(',').map(Number),id]);}
 loadEdits(edits){
  if(!Array.isArray(edits))return;
  for(const entry of edits){if(!Array.isArray(entry)||entry.length<4)continue;let [x,y,z,id]=entry.map(Number);x=Math.floor(x);y=Math.floor(y);z=Math.floor(z);if(y<1||y>=96||!BLOCKS[id]||!Number.isFinite(x+y+z))continue;const k=key(Math.floor(x/16),Math.floor(z/16)),pos=voxelKey(x,y,z);this.edits.set(pos,id);if(!this.editsByChunk.has(k))this.editsByChunk.set(k,new Map());this.editsByChunk.get(k).set(pos,id);const chunk=this.chunks.get(k);if(chunk){chunk.data[indexOf(x-chunk.cx*16,y,z-chunk.cz*16)]=id;this.dirty.add(k);if(id===B.TORCH)this.torchPositions.set(pos,new THREE.Vector3(x+.5,y+.8,z+.5));else this.torchPositions.delete(pos);}}
 }
 dispose(){this.disposed=true;for(const chunk of this.chunks.values())for(const m of chunk.meshes)m.geometry.dispose();for(const mat of Object.values(this.materials))mat.dispose();this.scene.remove(this.group);this.chunks.clear();this.dirty.clear();this.torchPositions.clear();this.torchLights.length=0;}
}
