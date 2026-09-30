import * as THREE from 'three';
import { B, BLOCKS, ITEMS, tileForFace } from './blocks.js';

let cached;
const icons = new Map();
const TILE=16, GRID=8;
const colors={ dirt:[126,89,61], stone:[124,124,122], sand:[219,207,152], grass_top:[119,156,74], log:[105,82,47], planks:[168,133,78], cobble:[115,115,112], bedrock:[65,65,65], snow:[230,239,241], wool:[224,224,215], gravel:[143,135,123], obsidian:[41,29,55], water:[54,111,211], lava:[231,85,14], bricks:[163,78,57], cactus:[69,125,43], furnace:[114,115,110], chest:[153,107,40] };
const names=['grass_top','grass_side','dirt','stone','sand','water','log','log_top','leaves','planks','cobble','glass','bricks','bedrock','coal_ore','iron_ore','gold_ore','diamond_ore','snow','cactus','cactus_top','crafting_top','crafting_side','crafting_front','furnace','furnace_front','torch','wool','flower','tall_grass','gravel','obsidian','lava','chest','chest_top','chest_front','bed','bed_top','farmland','crop_young','crop_mature','sapling','door_bottom','door_top'];
function rng(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296;};}
function css(c,n=0,a=1){return `rgba(${c.map(v=>Math.max(0,Math.min(255,Math.round(v+n)))).join(',')},${a})`;}
function paintTile(ctx,name,index){
 const r=rng(index*3287+977), noise=(n=15)=>(r()-.5)*n;
 const px=(x,y,c,a=1)=>{ctx.fillStyle=Array.isArray(c)?css(c,0,a):c;ctx.fillRect(x,y,1,1);};
 const fill=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h);};
 const base=colors[name] || colors[name.replace('_ore','')] || (name.includes('crafting')?colors.planks:name.includes('chest')?colors.chest:name.includes('furnace')?colors.furnace:colors.stone);
 if(['glass','flower','tall_grass','torch','leaves','crop_young','crop_mature','sapling'].includes(name))ctx.clearRect(0,0,TILE,TILE);
 else for(let y=0;y<16;y++)for(let x=0;x<16;x++)px(x,y,base.map(v=>v+noise(name==='bedrock'?85:30)));
 if(name==='dirt'||name==='grass_side'){
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){const n=noise(48);px(x,y,[126+n,88+n,59+n]);if(r()<.075)px(x,y,[107,103,93]);}
  if(name==='grass_side')for(let x=0;x<16;x++){let h=3+Math.floor(r()*3);for(let y=0;y<h;y++)px(x,y,[112+noise(25),149+noise(25),69+noise(16)]);if(r()<.4)px(x,h,[91,125,52]);}
 }
 if(name==='stone'){for(let i=0;i<24;i++){const x=Math.floor(r()*15),y=Math.floor(r()*16);fill(x,y,2,1,css([115,115,113],noise(15)));}}
 if(name==='grass_top'){
  for(let i=0;i<60;i++){const x=Math.floor(r()*16),y=Math.floor(r()*16);px(x,y,[116+noise(35),152+noise(34),70+noise(25)]);}
 }
 if(name==='log')for(let x=0;x<16;x++){const c=[87+((x*7)%5)*7,65+((x*7)%5)*6,36+((x*7)%5)*4];for(let y=0;y<16;y++)px(x,y,c.map(v=>v+noise(19)+(x%4===0?-15:0)));if(x%5===0)for(let y=2;y<14;y++)px(x,y,[65,48,29]);}
 if(name==='log_top'||name==='cactus_top'){
  const wood=name==='log_top';for(let y=0;y<16;y++)for(let x=0;x<16;x++){let d=Math.max(Math.abs(x-7.5),Math.abs(y-7.5));const ring=Math.floor(d)%3===0;px(x,y,wood?[ring?124:173,ring?94:135,ring?52:83]:[ring?59:86,ring?120:146,ring?33:55]);}if(wood){fill(0,0,16,1,'#624b2d');fill(0,15,16,1,'#624b2d');fill(0,0,1,16,'#624b2d');fill(15,0,1,16,'#624b2d');}
 }
 if(name==='leaves')for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(r()>.14){const n=noise(44);px(x,y,[64+n,113+n,41+n]);if(r()<.14)px(x,y,[94,138,56]);}
 if(name==='planks'||name.startsWith('crafting')){
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){const seam=y%4===0, n=noise(24);px(x,y,[seam?103:171+n,seam?76:136+n,seam?44:82+n]);}
  for(let y=1;y<16;y+=4){let x=(y%8===1?5:11);fill(x,y,1,3,'#876334');fill((x+4)%16,y+1,2,1,'#bb965b');}
  if(name==='crafting_top'){fill(1,1,14,14,'#634424');fill(2,2,12,12,'#ad7d46');for(let i=0;i<4;i++){fill(2+i*3,2,1,12,'#6b4b2d');fill(2,2+i*3,12,1,'#6b4b2d');}fill(0,0,16,1,'#d1a46b');}
  if(name==='crafting_side'||name==='crafting_front'){fill(1,2,14,10,'#6a492a');fill(2,3,12,8,'#bc9459');fill(3,4,3,5,'#523b29');fill(9,4,4,2,'#725336');fill(10,6,2,4,'#5b4028');fill(2,12,2,4,'#765335');fill(12,12,2,4,'#765335');}
 }
 if(name==='cobble'){
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){const row=Math.floor(y/4),edge=(y%4===0||((x+(row%2)*2)%6===0));const n=noise(35);px(x,y,edge?[63,65,61]:[119+n,122+n,116+n]);}
 }
 if(name==='glass'){
  fill(0,0,16,1,'#c3e4e9');fill(0,15,16,1,'#92c7d5');fill(0,0,1,16,'#c3e4e9');fill(15,0,1,16,'#92c7d5');
  for(let i=0;i<5;i++){px(3+i,7-i,'rgba(210,240,248,.85)');px(8+i,12-i,'rgba(210,240,248,.85)');}fill(2,2,12,12,'rgba(174,210,231,.06)');
 }
 if(name==='bricks')for(let y=0;y<16;y++)for(let x=0;x<16;x++){const mortar=y%4===0||(x+(Math.floor(y/4)%2)*4)%8===0;const n=noise(26);px(x,y,mortar?[180,169,146]:[166+n,77+n,59+n]);}
 if(name.endsWith('_ore')){
  for(let y=0;y<16;y++)for(let x=0;x<16;x++)px(x,y,[122,122,119].map(v=>v+noise(32)));
  const c=name==='coal_ore'?[36,37,34]:name==='iron_ore'?[195,159,131]:name==='gold_ore'?[227,196,49]:[71,210,200];
  [[3,3],[11,2],[7,7],[2,11],[12,11],[8,13]].forEach(([x,y],i)=>{fill(x,y,3,i%2?2:3,css(c,-30));fill(x,y,2,1,css(c,25));px(x+2,y+1,c);});
 }
 if(name==='cactus'){
  for(let y=0;y<16;y++)for(let x=0;x<16;x++)px(x,y,[45+(x%4)*10+noise(15),102+(x%4)*12+noise(18),30+(x%4)*4]);
  for(let i=0;i<15;i++)px(Math.floor(r()*16),Math.floor(r()*16),r()>.5?'#1b3f13':'#acd084');
 }
 if(name==='furnace'||name==='furnace_front'){
  fill(0,0,16,1,'#999a94');fill(0,15,16,1,'#53544f');fill(0,0,1,16,'#999a94');fill(15,0,1,16,'#53544f');
  if(name==='furnace_front'){fill(2,3,12,4,'#3d3e3a');fill(3,4,10,2,'#222421');fill(3,10,10,4,'#41433d');fill(4,11,8,2,'#20221f');fill(3,9,10,1,'#a0a199');}
 }
 if(name==='torch'){fill(7,5,2,11,'#79542f');fill(7,5,1,11,'#bb9358');fill(6,2,4,4,'#ed972a');fill(7,0,2,5,'#fff59d');px(6,3,'#fff9cb');px(9,4,'#e65819');}
 if(name==='flower'){fill(7,6,2,10,'#3d8038');fill(4,10,3,2,'#478b37');fill(9,12,3,2,'#65a341');fill(5,3,6,4,'#e33a32');fill(4,4,8,2,'#c3202c');fill(6,2,4,3,'#f34c38');fill(7,4,2,2,'#6b2628');}
 if(name==='tall_grass')for(let x=2;x<14;x++){let top=5+Math.floor(r()*7);for(let y=top;y<16;y++){let xx=Math.min(15,Math.max(0,x+(y<11?Math.sign(x-8)*Math.floor((11-y)/3):0)));px(xx,y,[69+noise(18),119+noise(24),38+noise(15)]);}}
 if(name==='obsidian')for(let y=0;y<16;y++)for(let x=0;x<16;x++){const n=noise(25);px(x,y,[39+n,27+n,52+n]);if(r()<.15)px(x,y,[67,45,89]);}
 if(name==='water')for(let y=0;y<16;y++)for(let x=0;x<16;x++){const n=noise(18)+Math.sin(x*.8+y*.4)*8;px(x,y,[41+n,105+n,202+n]);}
 if(name==='lava')for(let y=0;y<16;y++)for(let x=0;x<16;x++){const n=Math.sin(x*.8)*Math.cos(y*.5)*45+noise(50);px(x,y,[237+n,95+n*1.4,8+Math.abs(n)*.2]);}
 if(name.startsWith('chest')){
  fill(0,0,16,1,'#603a15');fill(0,15,16,1,'#603a15');fill(0,0,1,16,'#603a15');fill(15,0,1,16,'#603a15');fill(1,1,14,1,'#cc993f');fill(1,14,14,1,'#785021');
  if(name!=='chest_top'){fill(1,5,14,1,'#533917');fill(1,6,14,1,'#b67f30');}
  if(name==='chest_front'){fill(7,5,2,5,'#3e3526');fill(7,5,1,4,'#d6c481');fill(8,5,1,3,'#a8955c');}
 }
 if(name==='bed'||name==='bed_top'){
  fill(0,0,16,16,'#b83a35');for(let i=0;i<55;i++)px(Math.floor(r()*16),Math.floor(r()*16),css([174,48,43],noise(18)));
  if(name==='bed_top'){fill(0,0,16,5,'#edece4');fill(0,4,16,1,'#cccac2');}else{fill(0,10,16,3,'#997044');fill(0,13,3,3,'#745235');fill(13,13,3,3,'#745235');}
 }
 if(name==='farmland'){
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){let n=noise(19),furrow=y%4===0;px(x,y,[furrow?61:93+n,furrow?43:65+n,furrow?27:38+n]);if(y%4===1)px(x,y,[117+n,82+n,46+n]);}
 }
 if(name==='crop_young'||name==='crop_mature'){
  const mature=name==='crop_mature';
  for(let x=2;x<16;x+=3){const h=mature?10+Math.floor(r()*4):4+Math.floor(r()*5),top=16-h;for(let y=top;y<16;y++)px(x,y,mature?[160,142,53]:[72,119,36]);
   for(let y=top+3;y<15;y+=3){px(x-1,y,mature?[192,170,64]:[103,155,45]);px(Math.min(15,x+1),y+1,mature?[185,161,55]:[86,141,37]);}
   if(mature)for(let y=top;y<top+5;y++){px(x,y,[222,193,79]);if(y%2===0){px(x-1,y,[201,167,53]);px(Math.min(15,x+1),y,[237,207,93]);}}
  }
 }
 if(name==='sapling'){
  fill(7,7,2,9,'#6b4f28');fill(7,7,1,9,'#967348');fill(4,11,3,1,'#77562f');fill(9,8,3,1,'#77562f');
  for(let y=1;y<12;y++)for(let x=2;x<14;x++)if((x-7.5)**2*.7+(y-6)**2<27&&r()>.16)px(x,y,[63+noise(29),115+noise(31),35+noise(20)]);
  fill(3,12,3,2,'#57903a');fill(10,10,3,2,'#75a443');
 }
 if(name==='door_bottom'||name==='door_top'){
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){let n=noise(20);px(x,y,[169+n,127+n,65+n]);}
  fill(0,0,1,16,'#624722');fill(15,0,1,16,'#624722');fill(1,0,1,16,'#d0a46a');fill(14,0,1,16,'#805d30');
  fill(2,1,12,1,'#d1a570');fill(2,14,12,1,'#684b2a');fill(7,2,2,12,'#85632f');
  if(name==='door_top'){
   for(const x of [3,9]){fill(x-1,2,5,8,'#634b28');ctx.clearRect(x,3,3,6);fill(x,9,3,1,'#c7a06b');}
   fill(2,11,12,1,'#755330');fill(2,12,12,1,'#be9154');
  }else{fill(3,3,3,9,'#b18143');fill(9,3,3,9,'#b18143');fill(3,3,3,1,'#826032');fill(9,3,3,1,'#826032');fill(13,3,2,2,'#ddd0a0');px(14,4,'#695a37');}
 }
}
export function createAtlas(){
 if(cached)return cached;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=TILE*GRID;const ctx=canvas.getContext('2d'), tiles={};
 names.forEach((name,i)=>{const col=i%GRID,row=Math.floor(i/GRID);tiles[name]=[col,row];ctx.save();ctx.translate(col*TILE,row*TILE);paintTile(ctx,name,i);ctx.restore();});
 for(const [id,def]of Object.entries(BLOCKS))tiles[id]=tiles[tileForFace(+id,'pz')]||tiles.stone;
 const texture=new THREE.CanvasTexture(canvas);texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=1;
 cached={texture,canvas,tiles,tileSize:TILE,size:GRID*TILE};return cached;
}
export function drawItemIcon(id,canvas){
 canvas.width=canvas.width||64;canvas.height=canvas.height||64;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;
 const scale=canvas.width/32;ctx.save();ctx.scale(scale,scale);
 if([B.DOOR,B.DOOR_TOP,B.DOOR_OPEN,B.DOOR_OPEN_TOP].includes(id)){
  const {canvas:atlas,tiles}=createAtlas();for(const [name,y]of [['door_top',2],['door_bottom',16]]){let[x,z]=tiles[name];ctx.drawImage(atlas,x*16,z*16,16,16,9,y,14,14);}
 }else if(id<100 && ![B.FLOWER,B.TALL_GRASS,B.TORCH,B.CROP_YOUNG,B.CROP_MATURE,B.SAPLING].includes(id)){
  const {canvas:atlas,tiles}=createAtlas();const face=(name,transform,shade)=>{const [x,y]=tiles[name]||tiles.stone;ctx.save();ctx.setTransform(transform[0]*scale,transform[1]*scale,transform[2]*scale,transform[3]*scale,transform[4]*scale,transform[5]*scale);ctx.drawImage(atlas,x*TILE,y*TILE,TILE,TILE,0,0,16,16);if(shade){ctx.fillStyle=`rgba(0,0,0,${shade})`;ctx.fillRect(0,0,16,16);}ctx.restore();};
  face(tileForFace(id,'py'),[.75,.375,-.75,.375,16,3],0);
  face(tileForFace(id,'pz'),[.75,.375,0,.75,4,9],.18);
  face(tileForFace(id,'px'),[.75,-.375,0,.75,16,15],.35);
 }else if(id<100){const {canvas:atlas,tiles}=createAtlas(),[x,y]=tiles[BLOCKS[id].tile];ctx.drawImage(atlas,x*16,y*16,16,16,4,2,24,28);}
 else{
  const item=ITEMS[id];if(!item){ctx.restore();return;}
  const pixel=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h);};
  const line=(x1,y1,x2,y2,c,thick=2)=>{ctx.strokeStyle=c;ctx.lineWidth=thick;ctx.lineCap='square';ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
  const col=item.color;
  if(item.tool){
   line(9,25,22,12,'#3c2e1d',4);line(9,25,22,12,'#987143',2);
   if(item.tool==='pickaxe'){line(12,6,25,9,'#283631',6);line(12,6,25,9,col,4);line(25,9,27,14,col,3);line(10,8,12,6,col,3);}
   if(item.tool==='axe'){pixel(15,4,10,9,'#303930');pixel(16,4,7,7,col);pixel(13,5,5,8,col);pixel(13,5,2,3,'#ffffff66');}
   if(item.tool==='hoe'){line(14,6,23,9,'#32372b',5);line(14,6,23,9,col,3);pixel(13,6,3,5,col);pixel(13,6,2,2,'#ffffff55');}
   if(item.tool==='sword'){line(12,21,26,7,'#32352e',6);line(12,21,26,7,col,4);line(14,18,24,8,'#ffffff88',1);line(9,17,17,25,'#493929',4);line(10,17,17,24,col,2);}
  }else if(id===B.STICK){line(8,26,24,7,'#4a351d',4);line(8,26,24,7,col,2);}
  else if(id===B.APPLE){pixel(15,3,2,5,'#684728');pixel(17,3,6,2,'#4e9235');pixel(9,8,15,18,'#93201f');pixel(6,11,22,12,col);pixel(9,25,14,3,'#b12623');pixel(10,10,4,6,'#f2634c');pixel(11,11,2,3,'#ffc6a0');}
  else if(id===B.COAL||id===B.DIAMOND){pixel(10,5,13,3,id===B.COAL?'#55565a':'#a9fff2');pixel(6,8,21,12,col);pixel(9,20,16,5,id===B.COAL?'#24232a':'#22adba');pixel(12,25,9,2,col);pixel(9,9,4,5,id===B.COAL?'#57565c':'#c4fff8');}
  else if(id===B.IRON||id===B.GOLD){pixel(7,11,17,3,'#ffffffaa');pixel(4,14,23,9,col);pixel(7,23,18,3,id===B.GOLD?'#bb8922':'#788487');pixel(7,11,17,5,col);pixel(8,12,14,2,'#ffffff66');}
  else if(id===B.BUCKET||id===B.WATER_BUCKET){pixel(6,7,20,3,'#e1e5e5');pixel(7,10,18,15,'#b6c0c1');pixel(9,25,14,3,'#798a92');pixel(9,10,14,8,id===B.WATER_BUCKET?'#3276cf':'#455258');pixel(7,12,2,10,'#eef2ef');pixel(23,12,2,11,'#819498');if(id===B.WATER_BUCKET)pixel(10,11,8,2,'#6eaee9');}
  else if(id===B.WHEAT||id===B.SEEDS){for(let i=0;i<3;i++){line(9+i*6,26,11+i*6,5,id===B.WHEAT?'#99772e':'#438035',2);for(let y=5;y<19;y+=4){pixel(8+i*6,y,4,2,col);pixel(12+i*6,y+2,3,2,col);}}}
  else{pixel(6,11,21,12,col);pixel(9,7,14,4,col);pixel(8,23,17,3,id===B.RAW_MEAT?'#b84d50':'#8d562b');pixel(9,10,7,3,'#ffffff55');pixel(5,15,2,5,id===B.RAW_MEAT?'#f5cfbd':'#aa723b');}
 }
 ctx.restore();
}
export function itemIcon(id){if(icons.has(id))return icons.get(id);const c=document.createElement('canvas');c.width=c.height=64;drawItemIcon(id,c);const url=c.toDataURL();icons.set(id,url);return url;}
