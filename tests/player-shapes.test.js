import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {collides,PlayerPhysics} from '../src/physics.js';
import {B} from '../src/blocks.js';
import {intersectBlock} from '../src/shapes.js';
const at=(id)=>({getBlock:(x,y,z)=>x===1&&y===1&&z===1?id:0});
test('player collides with door panels and can walk in their opened cell space',()=>{
  assert.equal(collides(at(34),new THREE.Vector3(1.5,1,1.6)),false);
  assert.equal(collides(at(34),new THREE.Vector3(1.5,1,1.2)),true);
  assert.equal(collides(at(36),new THREE.Vector3(1.6,1,1.5)),false);
  assert.equal(collides(at(36),new THREE.Vector3(1.2,1,1.5)),true);
});
test('automatic step exits lowered farmland without jumping or scaling full blocks',()=>{
  const world={getBlock:(x,y,z)=>y===0?(x<0?30:B.GRASS):0};
  const player=new PlayerPhysics(new THREE.Vector3(-.5,.9375,.5));player.grounded=true;
  const keys=new Set(['KeyD']);let jump=false;
  for(let i=0;i<90;i++)jump ||=player.update(1/60,keys,0,world,'survival').jumped;
  assert.ok(player.position.x>3);assert.ok(Math.abs(player.position.y-1)<.01);assert.equal(jump,false);
});
test('aiming through open door space targets the interior rather than invisible cell bounds',()=>{
  const origin={x:1.5,y:1.5,z:4},direction={x:0,y:0,z:-1};
  assert.equal(intersectBlock(origin,direction,1,1,1,36,5),null);
  const closed=intersectBlock(origin,direction,1,1,1,34,5);
  assert.ok(Math.abs(closed.distance-2.8125)<.00001);assert.deepEqual(closed.normal,{x:0,y:0,z:1});
});
