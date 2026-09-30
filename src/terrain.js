import { B } from './blocks.js';

export const CHUNK_SIZE=16, WORLD_HEIGHT=96, SEA_LEVEL=22;
export function hash3(x,y,z,seed=241108){
 let h=(Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,2147483647)^Math.imul(seed|0,1274126177))|0;
 h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h>>>0)/4294967295;
}
export const hash2=(x,z,seed=241108)=>hash3(x,0,z,seed);
const smooth=t=>t*t*(3-2*t), mix=(a,b,t)=>a+(b-a)*t;
export function noise2(x,z,seed=241108){const ix=Math.floor(x),iz=Math.floor(z),tx=smooth(x-ix),tz=smooth(z-iz);return mix(mix(hash2(ix,iz,seed),hash2(ix+1,iz,seed),tx),mix(hash2(ix,iz+1,seed),hash2(ix+1,iz+1,seed),tx),tz)*2-1;}
export function noise3(x,y,z,seed=241108){const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),tx=smooth(x-ix),ty=smooth(y-iy),tz=smooth(z-iz);const a=mix(mix(hash3(ix,iy,iz,seed),hash3(ix+1,iy,iz,seed),tx),mix(hash3(ix,iy+1,iz,seed),hash3(ix+1,iy+1,iz,seed),tx),ty);const b=mix(mix(hash3(ix,iy,iz+1,seed),hash3(ix+1,iy,iz+1,seed),tx),mix(hash3(ix,iy+1,iz+1,seed),hash3(ix+1,iy+1,iz+1,seed),tx),ty);return mix(a,b,tz)*2-1;}
export function fractal2(x,z,seed=241108,octaves=4){let out=0,amp=1,total=0;for(let i=0;i<octaves;i++){out+=noise2(x,z,seed+i*1579)*amp;total+=amp;amp*=.5;x*=2;z*=2;}return out/total;}
export function getSettlement(x,z,seed=241108){
 const gx=Math.floor((x+128)/256),gz=Math.floor((z+128)/256);
 if(gx===0&&gz===0)return {x:56,z:-36,height:30};
 if(hash2(gx,gz,seed+1709)>.16)return null;
 return {x:gx*256+Math.floor(hash2(gx,gz,seed+1721)*64)-32,z:gz*256+Math.floor(hash2(gx,gz,seed+1723)*64)-32,height:29+Math.floor(hash2(gx,gz,seed+1733)*7)};
}
export function sampleColumn(x,z,seed=241108,type='normal'){
 const continental=fractal2(x*.0048,z*.0048,seed+3,4), hills=fractal2(x*.024,z*.024,seed+31,3), detail=noise2(x*.13,z*.13,seed+97);
 const temperature=noise2(x*.004+14,z*.004-22,seed+67)*.5+.5, moisture=noise2(x*.006-31,z*.006+18,seed+121)*.5+.5;
 let height=28+continental*22+hills*11+detail*1.8;
 const ridge=Math.pow(1-Math.abs(noise2(x*.011,z*.011,seed+211)),3);
 if(continental>.2)height+=ridge*20*Math.min(1,(continental-.2)*3);
 let river=0;
 const riverNoise=Math.abs(noise2(x*.007,z*.007,seed+771));
 if(riverNoise<.034 && height<47)river=(1-riverNoise/.034)*.92;
 // A sheltered meadow at the origin gives every seed a viable first night.
 const distance=Math.hypot(x,z), meadow=Math.max(0,1-distance/24);
 height=mix(height,27+noise2(x*.09,z*.09,seed+893)*1.5,smooth(meadow));
 const scenicRiver=Math.abs(x+23-Math.sin(z*.023)*6-noise2(z*.03,0,seed+81)*4);
 if(Math.abs(z)<145 && x<0 && distance<170)river=Math.max(river,Math.max(0,1-scenicRiver/6));
 if(distance<11)river=0;
 height=mix(height,SEA_LEVEL-3,river);
 if(type==='amplified'){
  const amplification=Math.min(1,Math.max(0,(distance-18)/45));
  height+=amplification*(Math.pow(Math.max(0,hills+.42),1.6)*36+ridge*15);
 }
 let present=true,bottom=0;
 if(type==='floating'){
  const island=noise2(x*.025,z*.025,seed+331), mask=fractal2(x*.015,z*.015,seed+119,3);
  present=mask>-.13 || distance<25;
  height=48+Math.max(0,island)*22+hills*8;
  const meadowFloat=Math.max(0,1-distance/25);height=mix(height,48+detail*.6,smooth(meadowFloat));
  bottom=Math.floor(height-5-Math.max(0,island+.3)*19);
  river=0;
 }
 const settlement=type==='floating'?null:getSettlement(x,z,seed);
 let village=0;
 if(settlement){const distance=Math.max(Math.abs(x-settlement.x),Math.abs(z-settlement.z));village=Math.max(0,Math.min(1,(32-distance)/12));if(village)height=mix(height,settlement.height,smooth(village));}
 height=Math.max(7,Math.min(85,Math.floor(height)));
 let biome='平原',top=B.GRASS;
 if(temperature>.62&&moisture<.42){biome='沙漠';top=B.SAND;}
 else if(temperature<.27){biome='积雪针叶林';top=B.SNOW;}
 else if(moisture>.52){biome='森林';}
 if(height>48 && type!=='floating'){biome=height>62?'雪山':'山地';top=height>62?B.SNOW:B.STONE;}
 if(height<=SEA_LEVEL+1&&type!=='floating'){biome=height<SEA_LEVEL-1?'河流':'沙滩';top=B.SAND;}
 if(distance<30){biome=moisture>.48?'森林':'平原';top=B.GRASS;}
 if(river>.55){biome='河流';top=B.SAND;}
 if(village>.5){biome='平原';top=B.GRASS;river=0;}
 return {height,bottom,present,biome,top,temperature,moisture,river,village,settlement};
}
export const indexOf=(x,y,z)=>(y*CHUNK_SIZE+z)*CHUNK_SIZE+x;
function caveAt(x,y,z,seed,column,type){
 if(type==='floating'||y<3)return false;
 if(column.village<.05&&column.height>SEA_LEVEL+4&&Math.hypot(x,z)>26&&noise2(x*.085,z*.085,seed+1471)>.65&&noise2(x*.026,z*.026,seed+1483)>.1&&y>=column.height-8)return true;
 if(y>column.height-4)return false;
 const a=noise3(x*.061,y*.078,z*.061,seed+401),b=noise3(x*.064+53,y*.065-20,z*.064+71,seed+503);
 // Intersect two fields for continuous winding tunnels and occasional chambers.
 return (Math.abs(a)<.09 && Math.abs(b)<.19)||(y<23&&noise3(x*.09,y*.09,z*.09,seed+557)>.66);
}
function oreAt(x,y,z,seed){
 const r=hash3(Math.floor(x/2),Math.floor(y/2),Math.floor(z/2),seed+743), edge=hash3(x,y,z,seed+991);
 if(y<12&&r<.013&&edge>.24)return B.DIAMOND_ORE;
 if(y<25&&r>.04&&r<.058&&edge>.23)return B.GOLD_ORE;
 if(y<43&&r>.12&&r<.16&&edge>.18)return B.IRON_ORE;
 if(r>.29&&r<.345&&edge>.12)return B.COAL_ORE;
 return B.STONE;
}
export function getProceduralBlock(x,y,z,seed=241108,type='normal',column=sampleColumn(x,z,seed,type)){
 if(y<0)return type==='floating'?B.AIR:B.BEDROCK;if(y>=WORLD_HEIGHT)return B.AIR;
 if(type==='floating'&&(!column.present||y<column.bottom))return B.AIR;
 if(y===0)return B.BEDROCK;
 if(y<=2&&type!=='floating'&&hash3(x,y,z,seed)>.28*y)return B.BEDROCK;
 if(y>column.height)return y<=SEA_LEVEL&&type!=='floating'?B.WATER:B.AIR;
 if(caveAt(x,y,z,seed,column,type))return y<5?B.LAVA:B.AIR;
 if(y===column.height)return column.top;
 if(y>column.height-4)return column.top===B.SAND?B.SAND:column.top===B.STONE?B.STONE:B.DIRT;
 if(y<=SEA_LEVEL-3&&hash3(Math.floor(x/3),Math.floor(y/2),Math.floor(z/3),seed+662)<.045)return B.GRAVEL;
 return oreAt(x,y,z,seed);
}
function treeCandidate(x,z,seed,column){
 if(!column.present || column.village>.5 || column.top!==B.GRASS&&column.top!==B.SNOW || column.height<=SEA_LEVEL || column.height>76 || Math.hypot(x,z)<5)return false;
 // Candidate points use a coarse grid with jitter, keeping canopies separated.
 const gx=Math.floor(x/5),gz=Math.floor(z/5);
 const tx=gx*5+Math.floor(hash2(gx,gz,seed+1021)*4),tz=gz*5+Math.floor(hash2(gx,gz,seed+1027)*4);
 if(tx!==x||tz!==z)return false;
 const density=column.biome==='森林'||column.biome==='积雪针叶林'?.6:.12;
 return hash2(gx,gz,seed+1049)<density || (x===8&&z===8);
}
export function generateChunk(cx,cz,seed=241108,type='normal'){
 const data=new Uint8Array(CHUNK_SIZE*WORLD_HEIGHT*CHUNK_SIZE),columns=new Array(256);
 const baseX=cx*16,baseZ=cz*16;
 const set=(x,y,z,id,airOnly=false)=>{x-=baseX;z-=baseZ;if(x<0||x>=16||z<0||z>=16||y<0||y>=WORLD_HEIGHT)return;let i=indexOf(x,y,z);if(!airOnly||data[i]===B.AIR)data[i]=id;};
 for(let z=0;z<16;z++)for(let x=0;x<16;x++){
  const wx=baseX+x,wz=baseZ+z,c=sampleColumn(wx,wz,seed,type);columns[z*16+x]=c;
  const limit=Math.max(c.height,type==='floating'?c.height:SEA_LEVEL);
  for(let y=0;y<=limit;y++)data[indexOf(x,y,z)]=getProceduralBlock(wx,y,wz,seed,type,c);
  if(c.present&&c.height>SEA_LEVEL&&c.top===B.GRASS&&data[indexOf(x,c.height,z)]===B.GRASS&&c.village<.5){let r=hash2(wx,wz,seed+1193);if(r<.16)set(wx,c.height+1,wz,B.TALL_GRASS,true);else if(r<.173)set(wx,c.height+1,wz,B.FLOWER,true);}
  if(c.present&&c.top===B.SAND&&c.biome==='沙漠'&&hash2(wx,wz,seed+1201)<.014){let n=2+Math.floor(hash2(wx,wz,seed+1207)*2);for(let i=1;i<=n;i++)set(wx,c.height+i,wz,B.CACTUS);}
 }
 // Look across the chunk boundary so the same tree appears in both chunks.
 for(let z=baseZ-3;z<baseZ+19;z++)for(let x=baseX-3;x<baseX+19;x++){
  const c=sampleColumn(x,z,seed,type);if(!treeCandidate(x,z,seed,c) && !(x===8&&z===8&&c.top===B.GRASS))continue;
  const h=4+Math.floor(hash2(x,z,seed+1087)*3),y=c.height+1,conifer=c.biome==='积雪针叶林';
  if(conifer){
   for(let dy=1;dy<=h+2;dy++){let radius=Math.max(0,Math.floor((h+2-dy)*.48));for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++)if(Math.abs(dx)+Math.abs(dz)<=radius*1.7+.1)set(x+dx,y+dy,z+dz,B.LEAVES,true);}
  }else{
   for(let dy=h-2;dy<=h+1;dy++){const radius=dy>=h?1:2;for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){
    if(Math.abs(dx)===radius&&Math.abs(dz)===radius&&(dy===h+1||hash3(x+dx,y+dy,z+dz,seed+1093)>.55))continue;
    set(x+dx,y+dy,z+dz,B.LEAVES,true);
   }}
  }
  for(let dy=0;dy<h;dy++)set(x,y+dy,z,B.LOG);
 }
 if(type!=='floating'){
  // Small oak-and-cobblestone settlements recur across the infinite world.
  const seen=new Set();
  for(const [xx,zz]of [[baseX,baseZ],[baseX+15,baseZ],[baseX,baseZ+15],[baseX+15,baseZ+15]]){
   const s=getSettlement(xx,zz,seed);if(!s||seen.has(`${s.x},${s.z}`)||Math.abs(baseX+8-s.x)>36||Math.abs(baseZ+8-s.z)>36)continue;seen.add(`${s.x},${s.z}`);const ground=s.height;
   for(let z=baseZ;z<baseZ+16;z++)for(let x=baseX;x<baseX+16;x++){const dx=x-s.x,dz=z-s.z;
    if(Math.abs(dx)<=19&&Math.abs(dz)<=19&&(Math.abs(dx)<=1||Math.abs(dz)<=1))set(x,ground,z,B.GRAVEL);
   }
   const house=(dx,dz,width=5,depth=6)=>{
    const hx=s.x+dx,hz=s.z+dz;
    for(let z=0;z<depth;z++)for(let x=0;x<width;x++){
     set(hx+x,ground,hz+z,B.COBBLE);
     for(let y=1;y<=4;y++){
      const edge=x===0||x===width-1||z===0||z===depth-1,corner=(x===0||x===width-1)&&(z===0||z===depth-1);
      let id=edge?(corner?B.LOG:B.PLANKS):B.AIR;
      if(edge&&!corner&&y===2&&((x===0||x===width-1)&&z===Math.floor(depth/2)||z===0&&x===Math.floor(width/2)))id=B.GLASS;
      if(z===depth-1&&x===Math.floor(width/2)&&y<=2)id=y===1?B.DOOR:B.DOOR_TOP;
      set(hx+x,ground+y,hz+z,id);
     }
    }
    // A stepped gable roof, overhanging the walls by one block.
    for(let z=-1;z<=depth;z++)for(let x=-1;x<=width;x++){let roof=ground+5+Math.min(x+1,width-x);set(hx+x,roof,hz+z,B.PLANKS);if(z===0||z===depth-1)for(let y=ground+5;y<roof;y++)set(hx+x,y,hz+z,B.PLANKS);}
    set(hx+1,ground+1,hz+1,B.CRAFTING);set(hx+width-2,ground+1,hz+1,B.FURNACE);set(hx+1,ground+1,hz+depth-2,B.CHEST);set(hx+width-2,ground+1,hz+depth-2,B.BED);set(hx+2,ground+3,hz+1,B.TORCH);
    for(let z=depth;z<depth+5;z++)for(let x=1;x<width-1;x++)set(hx+x,ground,hz+z,B.GRAVEL);
   };
   house(-15,-14);house(8,-13);house(8,8,6,6);
   // Village well and a small irrigated garden.
   for(let z=-2;z<=2;z++)for(let x=-2;x<=2;x++){set(s.x+x,ground,s.z+z,Math.abs(x)===2||Math.abs(z)===2?B.COBBLE:B.WATER);if(Math.abs(x)===2&&Math.abs(z)===2)for(let y=1;y<=4;y++)set(s.x+x,ground+y,s.z+z,B.LOG);set(s.x+x,ground+5,s.z+z,B.COBBLE);}
   for(let z=7;z<=16;z++)for(let x=-15;x<=-6;x++){const edge=z===7||z===16||x===-15||x===-6;set(s.x+x,ground,s.z+z,edge?B.LOG:x===-10?B.WATER:B.FARMLAND);if(!edge&&x!==-10)set(s.x+x,ground+1,s.z+z,hash2(s.x+x,s.z+z,seed+1747)<.25?B.CROP_YOUNG:B.CROP_MATURE);}
   for(const [dx,dz]of [[-3,-10],[3,10],[-10,-3],[10,3]]){set(s.x+dx,ground+1,s.z+dz,B.LOG);set(s.x+dx,ground+2,s.z+dz,B.TORCH);}
  }
 }
 return {data,columns,cx,cz};
}
