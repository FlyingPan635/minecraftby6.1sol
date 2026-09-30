import { isSolid, B } from './blocks.js';

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
const EPS = 0.0001;

export function collides(world, p, height = PLAYER_HEIGHT) {
  const r = PLAYER_WIDTH / 2;
  for (let x = Math.floor(p.x-r+EPS); x <= Math.floor(p.x+r-EPS); x++)
    for (let y = Math.floor(p.y+EPS); y <= Math.floor(p.y+height-EPS); y++)
      for (let z = Math.floor(p.z-r+EPS); z <= Math.floor(p.z+r-EPS); z++)
        {
          const id=world.getBlock(x,y,z);if(!isSolid(id))continue;
          const inset=[B.CACTUS,B.CHEST].includes(id)?.0625:0;
          const maxX=[36,37].includes(id)?x+.1875:x+1-inset;
          const maxY=id===30?y+.9375:id===B.BED?y+.5625:id===B.CHEST?y+.875:y+1;
          const maxZ=[34,35].includes(id)?z+.1875:z+1-inset;
          if(p.x+r>x+inset+EPS&&p.x-r<maxX-EPS&&p.y+height>y+EPS&&p.y<maxY-EPS&&p.z+r>z+inset+EPS&&p.z-r<maxZ-EPS)return true;
        }
  return false;
}

export function intersectsPlayer(x,y,z,p,height=PLAYER_HEIGHT) {
  const r=PLAYER_WIDTH/2;
  return x+1>p.x-r && x<p.x+r && y+1>p.y && y<p.y+height && z+1>p.z-r && z<p.z+r;
}

export class PlayerPhysics {
  constructor(position) {
    this.position = position;
    this.velocity = {x:0,y:0,z:0};
    this.grounded=false; this.flying=false; this.crouching=false;
    this.inWater=false; this.underWater=false; this.fallStart=position.y;
    this.lastJump=0; this.walkDistance=0; this.fallDistance=0;
  }
  reset(position) {
    this.position.copy(position); this.velocity={x:0,y:0,z:0};
    this.grounded=false; this.fallStart=position.y; this.fallDistance=0;
  }
  update(dt,keys,yaw,world,mode,onFall) {
    const p=this.position,v=this.velocity;
    const beganGrounded=this.grounded;
    let didJump=false;
    this.inWater=[B.WATER,B.LAVA].includes(world.getBlock(Math.floor(p.x),Math.floor(p.y+.5),Math.floor(p.z)));
    this.underWater=[B.WATER,B.LAVA].includes(world.getBlock(Math.floor(p.x),Math.floor(p.y+1.5),Math.floor(p.z)));
    this.crouching=keys.has('ShiftLeft')||keys.has('ShiftRight');
    if(mode!=='creative')this.flying=false;
    let forward=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0);
    let right=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
    const mag=Math.hypot(forward,right);
    if(mag>0){forward/=mag;right/=mag;}
    const sprint=(keys.has('ControlLeft')||keys.has('ControlRight'))&&forward>0&&!this.crouching;
    let speed=this.crouching?1.3:sprint?5.612:4.317;
    if(this.flying)speed=sprint?15:10;
    else if(this.inWater)speed=2.3;
    const tx=(-Math.sin(yaw)*forward+Math.cos(yaw)*right)*speed;
    const tz=(-Math.cos(yaw)*forward-Math.sin(yaw)*right)*speed;
    const accel=this.flying?8:this.inWater?5:this.grounded?16:3;
    const blend=1-Math.exp(-accel*dt);
    v.x+=(tx-v.x)*blend; v.z+=(tz-v.z)*blend;
    if(this.flying){v.y=((keys.has('Space')?1:0)-(this.crouching?1:0))*speed;}
    else if(this.inWater){
      v.y=Math.max(-3,v.y-4*dt);
      if(keys.has('Space'))v.y=Math.min(4.2,v.y+13*dt);
      v.y*=Math.exp(-2*dt);
    } else {
      if(this.grounded&&keys.has('Space')) {v.y=8.4;this.grounded=false;this.fallStart=p.y;didJump=true;}
      v.y=Math.max(-55,v.y-32*dt);
    }
    const oldY=p.y; const wasGround=this.grounded;
    if(wasGround)this.fallDistance=0;
    if(v.y<0&&!this.inWater&&!this.flying)this.fallDistance+=-v.y*dt;
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(v.x*dt),Math.abs(v.y*dt),Math.abs(v.z*dt))/.18));
    const h=dt/steps;
    this.grounded=false;
    for(let i=0;i<steps;i++){
      for(const axis of ['x','z','y']){
        const delta=v[axis]*h;
        if(delta===0)continue;
        const old=p[axis];p[axis]+=delta;
        if(collides(world,p)){
          if(axis!=='y'&&wasGround&&!this.flying){
            const baseY=p.y;p.y+=.6;
            if(!collides(world,p)){
              let low=0,high=.6;for(let n=0;n<10;n++){const mid=(low+high)/2;p.y=baseY+mid;if(collides(world,p))low=mid;else high=mid;}
              p.y=baseY+high;this.grounded=true;v.y=0;continue;
            }
            p.y=baseY;
          }
          let low=0,high=1;
          for(let n=0;n<9;n++){let mid=(low+high)/2;p[axis]=old+delta*mid;if(collides(world,p))high=mid;else low=mid;}
          p[axis]=old+delta*low;
          if(axis==='y'&&v.y<0){this.grounded=true;}
          v[axis]=0;
        } else if(axis!=='y'&&this.crouching&&wasGround&&!this.flying&&!this.inWater) {
          p.y-=.08;const support=collides(world,p);p.y+=.08;
          if(!support){p[axis]=old;v[axis]=0;}
        }
      }
    }
    if(this.grounded&&!wasGround&&this.fallDistance>3&&!this.inWater&&!this.flying)onFall?.(Math.floor(this.fallDistance-3));
    if(this.grounded||this.inWater||this.flying)this.fallDistance=0;
    this.walkDistance+=Math.hypot(v.x,v.z)*dt;
    return {sprinting:sprint,moving:mag>0,jumped:didJump};
  }
}
