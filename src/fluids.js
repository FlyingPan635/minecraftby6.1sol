import { B, isSolid } from './blocks.js';

const key=(x,y,z)=>`${x},${y},${z}`;
const parse=k=>k.split(',').map(Number);
/** Event-driven water flow. Natural oceans remain cheap; opened/placed water activates locally. */
export class FluidSimulation {
  constructor(world){this.world=world;this.sources=new Map();this.queue=[];this.queued=new Set();this.flows=new Map();this.timer=0;}
  enqueue(x,y,z,level=0,source=key(x,y,z)){
    const k=key(x,y,z);if(this.queued.has(k)||y<1||y>=95||this.queue.length>4096)return;
    this.queued.add(k);this.queue.push({x,y,z,level,source});
  }
  addSource(x,y,z){const k=key(x,y,z);this.sources.set(k,[x,y,z]);this.enqueue(x,y,z,0,k);}
  activateNeighbors(x,y,z){for(const [dx,dy,dz]of [[1,0,0],[-1,0,0],[0,1,0],[0,0,1],[0,0,-1]]){
    const nx=x+dx,ny=y+dy,nz=z+dz;if(this.world.getBlock(nx,ny,nz)===B.WATER&&!this.flows.has(key(nx,ny,nz)))this.addSource(nx,ny,nz);
  }}
  removeSource(x,y,z){
    const k=key(x,y,z);this.sources.delete(k);
    for(const [pos,flow]of this.flows)if(flow.source===k){const [fx,fy,fz]=parse(pos);if(this.world.getBlock(fx,fy,fz)===B.WATER)this.world.setBlock(fx,fy,fz,B.AIR);this.flows.delete(pos);}
    this.queue=this.queue.filter(q=>q.source!==k);this.queued=new Set(this.queue.map(q=>key(q.x,q.y,q.z)));
  }
  flow(x,y,z,level,source){
    if(y<1||y>=95||!this.world.chunks?.has(`${Math.floor(x/16)},${Math.floor(z/16)}`))return false;
    const id=this.world.getBlock(x,y,z);
    if(id===B.LAVA){this.world.setBlock(x,y,z,B.OBSIDIAN);return false;}
    if(isSolid(id))return false;
    const k=key(x,y,z),prev=this.flows.get(k);
    if(id===B.WATER&&!prev)return false;
    if(prev&&prev.level<=level)return false;
    if(this.flows.size>=1800)return false;
    if(id!==B.WATER)this.world.setBlock(x,y,z,B.WATER);
    this.flows.set(k,{level,source});this.enqueue(x,y,z,level,source);return true;
  }
  update(dt){
    this.timer+=dt;if(this.timer<.22)return;this.timer=0;
    const batch=this.queue.splice(0,Math.min(40,this.queue.length));
    for(const q of batch){const k=key(q.x,q.y,q.z);this.queued.delete(k);if(this.world.getBlock(q.x,q.y,q.z)!==B.WATER||!this.sources.has(q.source))continue;
      const below=this.world.getBlock(q.x,q.y-1,q.z);
      if(below===B.LAVA){this.world.setBlock(q.x,q.y-1,q.z,B.OBSIDIAN);}
      if(!isSolid(below)&&below!==B.WATER){this.flow(q.x,q.y-1,q.z,0,q.source);continue;}
      if(q.level<7){for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]])this.flow(q.x+dx,q.y,q.z+dz,q.level+1,q.source);}
    }
  }
  serialize(){return {sources:[...this.sources.values()],flows:[...this.flows].map(([k,f])=>[...parse(k),f.level,f.source])};}
  load(data){if(!data)return;for(const p of data.sources||[])this.addSource(...p);for(const [x,y,z,level,source]of data.flows||[]){this.flows.set(key(x,y,z),{level,source});this.enqueue(x,y,z,level,source);}}
}
