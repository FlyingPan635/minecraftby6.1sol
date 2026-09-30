import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FluidSimulation} from '../src/fluids.js';
import {B} from '../src/blocks.js';
const key=(x,y,z)=>`${x},${y},${z}`;
function setup(){const data=new Map();return {data,chunks:new Map([['0,0',{}]]),getBlock(x,y,z){if(y===0)return B.BEDROCK;return data.get(key(x,y,z))||B.AIR;},setBlock(x,y,z,id){data.set(key(x,y,z),id);return true;}};}
test('placed water falls, then spreads on solid support without crossing unloaded chunks',()=>{
  const world=setup();world.setBlock(8,4,8,B.WATER);const fluids=new FluidSimulation(world);fluids.addSource(8,4,8);
  for(let i=0;i<45;i++)fluids.update(.25);
  assert.equal(world.getBlock(8,1,8),B.WATER);assert.equal(world.getBlock(9,1,8),B.WATER);
  assert.equal(world.getBlock(16,1,8),B.AIR);assert.equal(world.getBlock(8,0,8),B.BEDROCK);
});
test('removing a source retracts its flows and cancels pending spread',()=>{
  const world=setup();world.setBlock(8,3,8,B.WATER);const fluids=new FluidSimulation(world);fluids.addSource(8,3,8);
  for(let i=0;i<12;i++)fluids.update(.25);world.setBlock(8,3,8,B.AIR);fluids.removeSource(8,3,8);
  for(let i=0;i<12;i++)fluids.update(.25);
  assert.equal(fluids.flows.size,0);assert.equal(world.getBlock(8,1,8),B.AIR);
});
test('water touching lava makes obsidian, and source simulation survives saving',()=>{
  const world=setup();world.setBlock(8,3,8,B.WATER);world.setBlock(8,2,8,B.LAVA);
  const fluids=new FluidSimulation(world);fluids.addSource(8,3,8);fluids.update(.25);
  assert.equal(world.getBlock(8,2,8),B.OBSIDIAN);
  const restored=new FluidSimulation(world);restored.load(JSON.parse(JSON.stringify(fluids.serialize())));
  assert.equal(restored.sources.size,1);assert.deepEqual(restored.serialize().sources,fluids.serialize().sources);
});
