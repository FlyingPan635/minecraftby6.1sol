import test from 'node:test';
import assert from 'node:assert/strict';
import {B,isSolid} from '../src/blocks.js';
import {CHUNK_SIZE,WORLD_HEIGHT,generateChunk,indexOf,sampleColumn,noise2,noise3} from '../src/terrain.js';
import * as THREE from 'three';
import {World} from '../src/world.js';

test('terrain is seeded, deterministic and bounded across negative chunk coordinates',()=>{
 const a=generateChunk(-1,2,241108),b=generateChunk(-1,2,241108),c=generateChunk(-1,2,9876);
 assert.equal(a.data.length,CHUNK_SIZE*CHUNK_SIZE*WORLD_HEIGHT);assert.deepEqual(a.data,b.data);assert.notDeepEqual(a.data,c.data);
 for(let z=0;z<16;z++)for(let x=0;x<16;x++){assert.equal(a.data[indexOf(x,0,z)],B.BEDROCK);assert.ok(sampleColumn(x-16,z+32).height<96);}
});
test('origin is safe and has an accessible tree in all generation modes',()=>{
 for(const type of ['normal','amplified','floating']){let {data}=generateChunk(0,0,241108,type),c=sampleColumn(0,0,241108,type);assert.equal(data[indexOf(0,c.height,0)],B.GRASS);assert.ok(!isSolid(data[indexOf(0,c.height+1,0)]));let tree=sampleColumn(8,8,241108,type);assert.equal(data[indexOf(8,tree.height+1,8)],B.LOG);}
});
test('continuous noise does not seam at integer lattice points',()=>{
 assert.ok(Math.abs(noise2(3-1e-5,-2)-noise2(3+1e-5,-2))<1e-4);
 assert.ok(Math.abs(noise3(-4-1e-5,5,2)-noise3(-4+1e-5,5,2))<1e-4);
});
test('terrain variants change the world while preserving the playable height range',()=>{
 const normal=generateChunk(6,6,241108,'normal').data,amplified=generateChunk(6,6,241108,'amplified').data,floating=generateChunk(6,6,241108,'floating').data;
 assert.notDeepEqual(normal,amplified);assert.notDeepEqual(normal,floating);assert.equal(floating.length,normal.length);
});
test('village has usable stations and remains coherent across chunk boundaries',()=>{
 let counts={};for(let cx=2;cx<=4;cx++)for(let cz=-4;cz<=-1;cz++)for(let id of generateChunk(cx,cz).data)counts[id]=(counts[id]||0)+1;
 assert.equal(counts[B.CRAFTING],3);assert.equal(counts[B.FURNACE],3);assert.equal(counts[B.BED],3);assert.equal(counts[B.CHEST],3);assert.equal(counts[B.TORCH],7);
 assert.equal(counts[B.DOOR],3);assert.equal(counts[B.DOOR_TOP],3);assert.equal(counts[B.FARMLAND],56);assert.equal(counts[B.CROP_YOUNG]+counts[B.CROP_MATURE],56);
 assert.equal(sampleColumn(56,-36).height,30);
});
test('loaded-only queries, finite geometry, boundary edits, bucket raycast and saved torches',async()=>{
 const context=new Proxy({}, {get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context})};
 const scene=new THREE.Scene(),world=new World(scene,{renderDistance:2});
 world.loadEdits([[2,40,2,B.TORCH]]);await world.init();
 const size=world.chunks.size;assert.equal(world.getBlock(1e6,40,1e6),B.AIR);assert.equal(world.chunks.size,size);assert.equal(world.getBlock(2,40,2),B.TORCH);
 assert.equal(world.setBlock(15,40,15,B.STONE),true);assert.equal(world.dirty.size,4);
 world.setBlock(2,40,2,B.WATER);
 const origin=new THREE.Vector3(2.5,42,2.5),dir=new THREE.Vector3(0,-1,0);
 assert.equal(world.raycast(origin,dir,4,true).id,B.WATER);assert.equal(world.raycast(origin,dir,4),null);
 for(let x=0;x<16;x++)world.setBlock(x,41,0,B.TORCH);
 world.update(0,0,.016);assert.equal(world.torchLights.length,8);assert.equal(world.torchLights.filter(l=>l.visible).length,8);
 for(const chunk of world.chunks.values())for(const mesh of chunk.meshes){const g=mesh.geometry;for(const attr of Object.values(g.attributes))for(const value of attr.array)assert.ok(Number.isFinite(value));for(const index of g.index.array)assert.ok(index<g.attributes.position.count);}
 const saved=world.saveEdits();world.dispose();assert.equal(scene.children.length,0);
 const restored=new World(scene,{renderDistance:2});restored.loadEdits(saved);await restored.init();assert.equal(restored.getBlock(15,40,15),B.STONE);assert.equal(restored.getBlock(2,40,2),B.WATER);assert.ok(restored.torchPositions.size>=16);restored.dispose();
});
test('floating islands have a real void below the world',()=>{
 const scene=new THREE.Scene(),world=new World(scene,{type:'floating'});assert.equal(world.getBlock(0,-1,0),B.AIR);assert.equal(world.getBlock(0,-100,0),B.AIR);world.dispose();
});
