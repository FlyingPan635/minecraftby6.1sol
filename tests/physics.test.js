import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Scene } from 'three';
import { B, BLOCKS } from '../src/blocks.js';
import { PlayerPhysics, collides, intersectsPlayer } from '../src/physics.js';
import { EntityManager } from '../src/entities.js';
import { Environment } from '../src/environment.js';

const dt = 1 / 60;
const flat = { getBlock: (_x, y, _z) => y < 1 ? B.STONE : B.AIR };
function simulate(player, frames, keys = new Set(), world = flat, onFall) {
  let result;
  for (let i = 0; i < frames; i++) result = player.update(dt, keys, 0, world, 'survival', onFall);
  return result;
}

test('player collision uses a 0.6 × 1.8 bounding box and exact block boundaries', () => {
  assert.equal(collides(flat, new Vector3(.5, 1, .5)), false);
  assert.equal(collides(flat, new Vector3(.5, .98, .5)), true);
  const wall = { getBlock: (x, y, z) => x === 1 && y >= 1 && y <= 2 && z === 0 ? B.STONE : B.AIR };
  assert.equal(collides(wall, new Vector3(.7, 1, .5)), false);
  assert.equal(collides(wall, new Vector3(.701, 1, .5)), true);
  assert.equal(intersectsPlayer(1, 1, 0, new Vector3(.5, 1, .5)), false);
  assert.equal(intersectsPlayer(0, 2, 0, new Vector3(.5, 1, .5)), true);
});

test('ground contact settles accurately without sinking or accumulating fall damage', () => {
  const p = new PlayerPhysics(new Vector3(.5, 1.02, .5));
  let hits = 0;
  simulate(p, 360, new Set(), flat, () => hits++);
  assert.equal(p.grounded, true);
  assert.ok(Math.abs(p.position.y - 1) < .001);
  assert.equal(p.velocity.y, 0);
  assert.equal(hits, 0);
});

test('walking, normalized diagonal movement and sprinting preserve expected speeds', () => {
  const walk = new PlayerPhysics(new Vector3(.5, 1.01, .5));
  const diagonal = new PlayerPhysics(new Vector3(.5, 1.01, .5));
  const sprint = new PlayerPhysics(new Vector3(.5, 1.01, .5));
  simulate(walk, 180, new Set(['KeyW']));
  simulate(diagonal, 180, new Set(['KeyW', 'KeyD']));
  simulate(sprint, 180, new Set(['KeyW', 'ControlLeft']));
  assert.ok(Math.abs(Math.hypot(walk.velocity.x, walk.velocity.z) - 4.317) < .001);
  assert.ok(Math.abs(Math.hypot(diagonal.velocity.x, diagonal.velocity.z) - 4.317) < .001);
  assert.ok(Math.abs(Math.hypot(sprint.velocity.x, sprint.velocity.z) - 5.612) < .001);
  assert.ok(sprint.position.distanceTo(new Vector3(.5, 1, .5)) > walk.position.distanceTo(new Vector3(.5, 1, .5)) * 1.25);
});

test('walls stop motion even with a long frame and high existing velocity', () => {
  const wall = { getBlock: (x, y, _z) => y < 1 || (x === 1 && y < 4) ? B.STONE : B.AIR };
  const p = new PlayerPhysics(new Vector3(.5, 1.01, .5));
  p.grounded = true;
  p.velocity.x = 30;
  p.update(.1, new Set(['KeyD']), 0, wall, 'survival');
  assert.ok(p.position.x <= .7002);
  assert.equal(collides(wall, p.position), false);
});

test('jump rises above one block, returns to the ground and respects a low ceiling', () => {
  const p = new PlayerPhysics(new Vector3(.5, 1.01, .5));
  simulate(p, 5);
  let max = p.position.y;
  const takeoff = p.update(dt, new Set(['Space']), 0, flat, 'survival');
  assert.equal(takeoff.jumped, true, 'takeoff is reported for audio and exhaustion');
  for (let i = 0; i < 90; i++) { p.update(dt, new Set(), 0, flat, 'survival'); max = Math.max(max, p.position.y); }
  assert.ok(max > 2.01 && max < 2.35, `jump apex ${max}`);
  assert.equal(p.grounded, true);
  assert.ok(Math.abs(p.position.y - 1) < .001);
  const ceiling = { getBlock: (_x, y, _z) => y < 1 || y === 3 ? B.STONE : B.AIR };
  const low = new PlayerPhysics(new Vector3(.5, 1.01, .5));
  simulate(low, 5, new Set(), ceiling);
  low.update(dt, new Set(['Space']), 0, ceiling, 'survival');
  assert.ok(low.position.y <= 1.2001);
  assert.equal(collides(ceiling, low.position), false);
});

test('long falls report damage once, while short falls remain harmless', () => {
  const falling = new PlayerPhysics(new Vector3(.5, 12, .5));
  const damage = [];
  simulate(falling, 300, new Set(), flat, value => damage.push(value));
  assert.equal(damage.length, 1);
  assert.ok(damage[0] >= 7 && damage[0] <= 9, `fall damage ${damage}`);
  const short = new PlayerPhysics(new Vector3(.5, 3.5, .5));
  const shortDamage = [];
  simulate(short, 150, new Set(), flat, value => shortDamage.push(value));
  assert.deepEqual(shortDamage, []);
});

test('water supports swimming, detects eye submersion and cancels fall damage', () => {
  const water = { getBlock: (_x, y, _z) => y < 1 ? B.STONE : y < 8 ? B.WATER : B.AIR };
  const p = new PlayerPhysics(new Vector3(.5, 2, .5));
  const damage = [];
  simulate(p, 60, new Set(['Space', 'KeyW']), water, value => damage.push(value));
  assert.equal(p.inWater, true);
  assert.equal(p.underWater, true);
  assert.ok(p.position.y > 3);
  assert.ok(Math.hypot(p.velocity.x, p.velocity.z) < 2.4);
  assert.deepEqual(damage, []);
  const diver = new PlayerPhysics(new Vector3(.5, 15, .5));
  simulate(diver, 300, new Set(), water, value => damage.push(value));
  assert.deepEqual(damage, []);
});

test('sneaking retains support at a cliff edge while normal movement falls', () => {
  const cliff = { getBlock: (x, y, z) => x === 0 && z === 0 && y === 0 ? B.STONE : B.AIR };
  const sneaking = new PlayerPhysics(new Vector3(.5, 1.01, .5));
  const walking = new PlayerPhysics(new Vector3(.5, 1.01, .5));
  simulate(sneaking, 5, new Set(), cliff);
  simulate(walking, 5, new Set(), cliff);
  simulate(sneaking, 180, new Set(['KeyD', 'ShiftLeft']), cliff);
  simulate(walking, 90, new Set(['KeyD']), cliff);
  assert.ok(sneaking.position.x < 1.301 && sneaking.position.x > 1.1);
  assert.ok(Math.abs(sneaking.position.y - 1) < .002);
  assert.ok(walking.position.y < -5);
});

test('animals spawn on loaded land only, including cows, and survive save/load', () => {
  // Canvas drawing is mocked; this test exercises spawning and simulation without a GPU.
  const context = { fillRect() {}, createRadialGradient() { return { addColorStop() {} }; } };
  const oldDocument = globalThis.document;
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return context; } }; } };
  let outsideQueries = 0;
  const chunks = new Map([['0,0', {}]]);
  const world = {
    seed: 241108, renderDistance: 2, chunks,
    getBlock(x, y, z) {
      if (x < 0 || x >= 16 || z < 0 || z >= 16) { outsideQueries++; return B.AIR; }
      return y < 5 ? B.GRASS : B.AIR;
    },
    raycast() { return null; }, setBlock() { return true; },
  };
  let manager;
  try {
    const scene = { add() {}, remove() {} };
    manager = new EntityManager(scene, world);
    assert.equal(manager.surface(80, 80), null);
    assert.equal(outsideQueries, 0, 'unloaded coordinates should be rejected before sampling terrain');
    const spawned = manager.spawnAround(new Vector3(8, 5, 8), 12, false, 3, 9);
    assert.ok(spawned >= 8, `animals spawned ${spawned}`);
    assert.ok(manager.entities.some(e => e.type === 'cow'));
    for (const e of manager.entities) assert.ok(e.position.x >= .45 && e.position.x < 15.55 && e.position.z >= .45 && e.position.z < 15.55);
    const data = manager.serialize(); manager.load(data);
    assert.equal(manager.entities.length, data.length);
    for (let i = 0; i < 300; i++) manager.update(dt, { position: new Vector3(8, 5, 8) }, { daylight: 1, mode: 'creative' });
    for (const e of manager.entities) assert.ok(e.position.y >= 4.99 && e.position.x >= .28 && e.position.x < 15.72 && e.position.z >= .28 && e.position.z < 15.72);
    chunks.clear(); manager.update(dt, { position: new Vector3(8, 5, 8) }, { daylight: 1 });
    assert.equal(manager.entities.length, 0, 'mobs in unloaded chunks are retired');
  } finally { manager?.dispose(); globalThis.document = oldDocument; }
});

test('hostiles damage the root physics player, spare creative players, and creepers explode', () => {
  const context = { fillRect() {}, createRadialGradient() { return { addColorStop() {} }; } };
  const oldDocument = globalThis.document;
  globalThis.document = { createElement() { return { getContext() { return context; } }; } };
  const damage = [], edits = [];
  const world = { seed: 42, renderDistance: 4, getBlock: (_x, y, _z) => y < 5 ? B.STONE : B.AIR, raycast: () => null, setBlock: (...args) => edits.push(args) };
  const player = new PlayerPhysics(new Vector3(0, 5, 1.1));
  let manager;
  try {
    manager = new EntityManager({ add() {}, remove() {} }, world, { onDamage: (...args) => damage.push(args) });
    manager.spawnAt('zombie', new Vector3(0, 5, 0));
    for (let i = 0; i < 80; i++) manager.update(dt, player, { daylight: 0, mode: 'creative' });
    assert.deepEqual(damage, []);
    const zombie = manager.entities.find(e => e.type === 'zombie'); zombie.position.set(0, 5, 0);
    for (let i = 0; i < 80; i++) manager.update(dt, player, { daylight: 0, mode: 'survival' });
    assert.ok(damage.some(([amount, source]) => amount === 3 && source === '僵尸'));
    assert.ok(Math.hypot(player.velocity.x, player.velocity.z) > 0, 'melee applies player knockback');
    for (const entity of [...manager.entities]) manager.remove(entity);
    manager.spawnAt('creeper', new Vector3(0, 5, 0));
    for (let i = 0; i < 120; i++) manager.update(dt, player, { daylight: 0, mode: 'survival' });
    assert.ok(damage.some(([_amount, source]) => source === '苦力怕爆炸'));
    assert.ok(edits.length > 0);
    assert.equal(manager.entities.some(e => e.type === 'creeper'), false);
  } finally { manager?.dispose(); globalThis.document = oldDocument; }
});

test('skeleton arrows follow ballistics, hit players and remain stuck in block collisions', () => {
  const context = { fillRect() {}, createRadialGradient() { return { addColorStop() {} }; } };
  const oldDocument = globalThis.document;
  globalThis.document = { createElement() { return { getContext() { return context; } }; } };
  const damage = [];
  const world = { seed: 42, renderDistance: 4, getBlock: (_x, y, _z) => y < 5 ? B.STONE : B.AIR, raycast: () => null };
  const player = new PlayerPhysics(new Vector3(0, 5, 10));
  let manager;
  try {
    manager = new EntityManager(new Scene(), world, { onDamage: (...args) => damage.push(args) });
    const skeleton = manager.spawnAt('skeleton', new Vector3(0, 5, 0));
    for (let i = 0; i < 120; i++) manager.update(dt, player, { daylight: 0, mode: 'survival' });
    assert.ok(damage.some(([amount, source]) => amount === 4 && source === '骷髅射手'));
    assert.equal(manager.serialize()[0].type, 'skeleton');
    const previousDamage = damage.length;
    manager.projectiles.forEach(arrow => manager.group.remove(arrow.group)); manager.projectiles = [];
    manager.shootArrow(skeleton, player);
    world.raycast = () => ({ distance: .15 });
    manager.updateArrows(dt, player, true);
    assert.equal(manager.projectiles.length, 1);
    assert.equal(manager.projectiles[0].stuck, true);
    const stuck = manager.projectiles[0].group.position.clone();
    manager.updateArrows(1, player, true);
    assert.deepEqual(manager.projectiles[0].group.position.toArray(), stuck.toArray());
    assert.equal(damage.length, previousDamage);
  } finally { manager?.dispose(); globalThis.document = oldDocument; }
});

test('daylight cycle advances at Minecraft tick rate, wraps days and honors pause/speed', () => {
  const oldDocument = globalThis.document;
  globalThis.document = { createElement() { return { getContext() { return { fillRect() {} }; } }; } };
  try {
    const env = new Environment(new Scene(), {});
    const pos = new Vector3(0, 30, 0);
    const settings = { autoTime: true, timeSpeed: 1 };
    env.time = 1000; env.update(1, pos, settings);
    assert.equal(env.time, 1020);
    env.time = 23990; env.update(1, pos, settings);
    assert.equal(env.time, 10); assert.equal(env.day, 2);
    settings.timeSpeed = 10; env.update(1, pos, settings);
    assert.equal(env.time, 210);
    env.update(10, pos, settings, true); assert.equal(env.time, 210);
    settings.autoTime = false; env.update(10, pos, settings); assert.equal(env.time, 210);
    env.setTime(6000); env.update(0, pos, settings);
    assert.equal(env.daylight, 1); assert.equal(env.sun.visible, true); assert.equal(env.moon.visible, false);
    env.setTime(18000); env.update(0, pos, settings);
    assert.equal(env.daylight, 0); assert.equal(env.moon.visible, true); assert.ok(env.stars.material.opacity > .8);
    env.setTime(-1000); assert.equal(env.time, 23000);
  } finally { globalThis.document = oldDocument; }
});

test('mob collision respects opened door space and settles on fractional farmland', () => {
  const context = { fillRect() {}, createRadialGradient() { return { addColorStop() {} }; } };
  const oldDocument = globalThis.document;
  const ids = [30, 34, 35, 36, 37], originals = ids.map(id => BLOCKS[id]);
  // Keep this independent of terrain generation: every fixture is a solid block with the declared ID.
  for (const id of ids) if (!BLOCKS[id]) BLOCKS[id] = { id, solid: true };
  globalThis.document = { createElement() { return { getContext() { return context; } }; } };
  let manager;
  try {
    let doorId = 34;
    const world = { seed: 42, getBlock: (x, y, z) => x === 0 && z === 0 && (y === 1 || y === 2) ? doorId : B.AIR };
    manager = new EntityManager(new Scene(), world);
    assert.equal(manager.blocked(new Vector3(.6, 1, .3), .27, 1.9), true, 'closed door panel blocks traversal');
    doorId = 36;
    assert.equal(manager.blocked(new Vector3(.6, 1, .5), .27, 1.9), false, 'open door leaves the interior of its cell passable');
    assert.equal(manager.blocked(new Vector3(.3, 1, .5), .27, 1.9), true, 'open door still blocks its narrow side panel');
    world.getBlock = (_x, y, _z) => y === 0 ? 30 : B.AIR;
    assert.equal(manager.blocked(new Vector3(.5, .9375, .5), .35, 1.12), false);
    assert.equal(manager.blocked(new Vector3(.5, .936, .5), .35, 1.12), true);
    const pig = manager.spawnAt('pig', new Vector3(.5, 1.1, .5));
    pig.walk = false; pig.moveTimer = 100;
    for (let i = 0; i < 120; i++) manager.update(dt, { position: new Vector3(4, 1, 4) }, { daylight: 1, mode: 'creative' });
    assert.ok(Math.abs(pig.position.y - .9375) < .001, `pig farmland landing ${pig.position.y}`);
    assert.equal(pig.grounded, true);
    assert.equal(manager.spawnAt('cow', new Vector3(NaN, 1, 0)), null, 'invalid summon positions cannot poison scene matrices');
  } finally {
    manager?.dispose(); globalThis.document = oldDocument;
    ids.forEach((id, i) => { if (originals[i]) BLOCKS[id] = originals[i]; else delete BLOCKS[id]; });
  }
});
