import * as THREE from 'three';
import { B, isSolid } from './blocks.js';

const TAU = Math.PI * 2;
const HEIGHT = 96;
const SPECIES = {
  sheep: { health: 8, radius: .34, height: 1.3, speed: 1.2, hostile: false },
  pig: { health: 10, radius: .35, height: 1.12, speed: 1.25, hostile: false },
  cow: { health: 10, radius: .4, height: 1.57, speed: 1.1, hostile: false },
  zombie: { health: 20, radius: .29, height: 1.9, speed: 2.0, hostile: true },
  skeleton: { health: 20, radius: .27, height: 1.9, speed: 2.2, hostile: true },
  creeper: { health: 20, radius: .3, height: 1.85, speed: 1.75, hostile: true },
};
const NAMES = { sheep: '羊', pig: '猪', cow: '牛', zombie: '僵尸', skeleton: '骷髅', creeper: '苦力怕' };
const _v = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _ray = new THREE.Ray();
const _box = new THREE.Box3();
const _hit = new THREE.Vector3();
const FULL_BOUNDS = [0, 1, 0, 1, 0, 1];
const CACTUS_BOUNDS = [.0625, .9375, 0, 1, .0625, .9375];
const CHEST_BOUNDS = [.0625, .9375, 0, .875, .0625, .9375];
const BED_BOUNDS = [0, 1, 0, .5625, 0, 1];
const FARMLAND_BOUNDS = [0, 1, 0, .9375, 0, 1];
const CLOSED_DOOR_BOUNDS = [0, 1, 0, 1, 0, .1875];
const OPEN_DOOR_BOUNDS = [0, .1875, 0, 1, 0, 1];
function blockBounds(id) {
  if (id === 30) return FARMLAND_BOUNDS;
  if (id === 34 || id === 35) return CLOSED_DOOR_BOUNDS;
  if (id === 36 || id === 37) return OPEN_DOOR_BOUNDS;
  if (id === B.CACTUS) return CACTUS_BOUNDS;
  if (id === B.CHEST) return CHEST_BOUNDS;
  if (id === B.BED) return BED_BOUNDS;
  return FULL_BOUNDS;
}

function normalizeAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
function hash(x, y, seed) {
  let n = Math.imul(x + seed, 374761393) ^ Math.imul(y + seed, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

export class EntityManager {
  constructor(scene, world, { onDamage = () => {}, onDrop = () => {}, sound } = {}) {
    this.scene = scene;
    this.world = world;
    this.onDamage = onDamage;
    this.onDrop = onDrop;
    this.sound = sound;
    this.group = new THREE.Group();
    this.group.name = 'creatures';
    scene.add(this.group);
    this.entities = [];
    this.particles = [];
    this.projectiles = [];
    this.geometries = new Map();
    this.textures = new Map();
    this.nextId = 1;
    this.seed = (Number(world.seed) ^ 0x739a2c13) >>> 0;
    this.spawnTimer = 0;
    this.balanceTimer = 0;
    this.elapsed = 0;
    this.lastPlayer = null;
    this.lastMode = 'survival';
    this.shadowTexture = this.createShadowTexture();
    this.particleGeometry = new THREE.BoxGeometry(.12, .12, .12);
    this.arrowMaterials = [new THREE.MeshLambertMaterial({ color: '#8e7050' }), new THREE.MeshLambertMaterial({ color: '#d4d4ca' }), new THREE.MeshLambertMaterial({ color: '#d7d3bc' })];
    this.arrowTipGeometry = new THREE.ConeGeometry(.057, .16, 4);
  }

  random() {
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5;
    return (this.seed >>> 0) / 4294967296;
  }

  createShadowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, 'rgba(0,0,0,0.36)');
    gradient.addColorStop(.5, 'rgba(0,0,0,0.22)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  }

  texture(kind, color) {
    if (this.textures.has(kind)) return this.textures.get(kind);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d');
    const base = new THREE.Color(color);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const n = hash(x, y, kind.length * 181);
        let variation = .86 + n * .24;
        let c = base.clone().multiplyScalar(variation);
        if (kind === 'cow' && hash(Math.floor(x / 3), Math.floor(y / 3), 541) > .58) c.set('#dedbcf').multiplyScalar(.9 + n * .1);
        if (kind === 'creeper' && n > .79) c.set('#305524');
        if (kind === 'creeper' && n < .19) c.set('#93bd65');
        if (kind === 'wool' && x % 4 === 0 && y % 3 === 0) c.multiplyScalar(.89);
        ctx.fillStyle = `#${c.getHexString()}`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    this.textures.set(kind, texture);
    return texture;
  }

  geometry(w, h, d) {
    const key = `${w},${h},${d}`;
    if (!this.geometries.has(key)) this.geometries.set(key, new THREE.BoxGeometry(w, h, d));
    return this.geometries.get(key);
  }

  createModel(type) {
    const group = new THREE.Group();
    const materials = new Map();
    const limbs = [];
    const material = (name, color, texture = false) => {
      if (!materials.has(name)) materials.set(name, new THREE.MeshLambertMaterial({
        color: texture ? 0xffffff : color,
        map: texture ? this.texture(name, color) : null,
      }));
      return materials.get(name);
    };
    const box = (parent, size, position, mat) => {
      const mesh = new THREE.Mesh(this.geometry(...size), mat);
      mesh.position.set(...position);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const leg = (x, z, length, width, mat, hoofMat) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, length, z);
      group.add(pivot);
      box(pivot, [width, length, width], [0, -length / 2, 0], mat);
      if (hoofMat) box(pivot, [width + .012, .12, width + .012], [0, -length + .06, 0], hoofMat);
      limbs.push({ pivot, phase: (x * z > 0 ? 0 : Math.PI), base: 0 });
      return pivot;
    };
    const eye = (parent, x, y, z, size = .055) => {
      box(parent, [size * 1.75, size * 1.4, .012], [x, y, z], material('eyeWhite', '#eeede7'));
      box(parent, [size * .75, size * 1.2, .014], [x + Math.sign(x) * .016, y, z + .008], material('black', '#171814'));
    };
    let head;
    if (type === 'sheep') {
      const wool = material('wool', '#e7e4da', true);
      const face = material('sheepSkin', '#b7a48b', true);
      const hoof = material('hoof', '#554c43');
      box(group, [.8, .65, 1.18], [0, .81, -.02], wool);
      for (const x of [-.25, .25]) for (const z of [-.38, .38]) leg(x, z, .49, .17, face, hoof);
      head = new THREE.Group(); head.position.set(0, 1.01, .65); group.add(head);
      box(head, [.5, .51, .48], [0, 0, 0], wool);
      box(head, [.38, .36, .12], [0, -.04, .28], face);
      eye(head, -.126, .048, .348, .053); eye(head, .126, .048, .348, .053);
      box(head, [.15, .068, .018], [0, -.127, .355], material('mouth', '#6a5650'));
      box(head, [.28, .18, .25], [0, -.13, -.04], wool);
    } else if (type === 'pig') {
      const skin = material('pig', '#e6a2a4', true);
      const snout = material('pigSnout', '#d77f88', true);
      const hoof = material('pigHoof', '#b46c73');
      box(group, [.75, .57, 1.08], [0, .69, -.03], skin);
      for (const x of [-.25, .25]) for (const z of [-.34, .34]) leg(x, z, .42, .19, skin, hoof);
      head = new THREE.Group(); head.position.set(0, .78, .65); group.add(head);
      box(head, [.5, .51, .48], [0, 0, 0], skin);
      box(head, [.31, .23, .1], [0, -.07, .29], snout);
      eye(head, -.155, .088, .247, .052); eye(head, .155, .088, .247, .052);
      for (const x of [-.087, .087]) box(head, [.056, .067, .013], [x, -.062, .35], material('nostril', '#69383f'));
      box(head, [.16, .16, .08], [-.22, .22, -.11], snout);
      box(head, [.16, .16, .08], [.22, .22, -.11], snout);
      box(group, [.07, .08, .15], [0, .78, -.635], snout);
    } else if (type === 'cow') {
      const hide = material('cow', '#5d4434', true);
      const muzzle = material('cowMuzzle', '#b6a39a', true);
      const hoof = material('cowHoof', '#2f2928');
      box(group, [.88, .75, 1.28], [0, 1.01, -.08], hide);
      for (const x of [-.29, .29]) for (const z of [-.44, .38]) leg(x, z, .66, .21, hide, hoof);
      box(group, [.37, .18, .44], [0, .65, -.13], material('udder', '#bf8d8e'));
      head = new THREE.Group(); head.position.set(0, 1.2, .71); group.add(head);
      box(head, [.59, .61, .52], [0, 0, 0], hide);
      box(head, [.48, .26, .12], [0, -.175, .313], muzzle);
      eye(head, -.18, .085, .268, .056); eye(head, .18, .085, .268, .056);
      for (const x of [-.154, .154]) box(head, [.062, .038, .012], [x, -.142, .38], material('nostril', '#473636'));
      for (const x of [-.23, .23]) box(head, [.085, .22, .085], [x, .36, -.12], material('horn', '#d7cbbb'));
      box(head, [.2, .14, .12], [-.36, .15, -.07], hide);
      box(head, [.2, .14, .12], [.36, .15, -.07], hide);
      box(group, [.07, .57, .08], [0, .92, -.76], hide);
      box(group, [.11, .16, .13], [0, .62, -.76], hoof);
    } else if (type === 'zombie') {
      const skin = material('zombieSkin', '#65924d', true);
      const shirt = material('zombieShirt', '#319597', true);
      const pants = material('zombiePants', '#434475', true);
      box(group, [.51, .72, .29], [0, 1.04, 0], shirt);
      for (const x of [-.132, .132]) leg(x, 0, .68, .235, pants, material('zombieShoe', '#4a4d48'));
      head = new THREE.Group(); head.position.set(0, 1.64, 0); group.add(head);
      box(head, [.48, .48, .48], [0, 0, 0], skin);
      box(head, [.49, .075, .49], [0, .211, 0], material('zombieHair', '#304a2b', true));
      for (const x of [-.132, .132]) box(head, [.1, .059, .014], [x, .041, .25], material('black', '#142318'));
      box(head, [.17, .054, .016], [0, -.124, .253], material('zombieMouth', '#334330'));
      for (const x of [-.36, .36]) {
        const arm = new THREE.Group(); arm.position.set(x, 1.31, 0); group.add(arm);
        box(arm, [.22, .22, .28], [0, 0, .14], shirt);
        box(arm, [.22, .22, .45], [0, 0, .5], skin);
        limbs.push({ pivot: arm, phase: x < 0 ? 0 : Math.PI, arm: true, base: 0 });
      }
    } else if (type === 'skeleton') {
      const bone = material('bone', '#c8c6b7', true);
      const joint = material('boneJoint', '#9c9b8e');
      const dark = material('skeletonFace', '#34352f');
      for (const x of [-.13, .13]) leg(x, 0, .7, .105, bone, joint);
      box(group, [.4, .13, .19], [0, .7, 0], bone);
      box(group, [.115, .64, .115], [0, 1.05, -.05], bone);
      box(group, [.48, .11, .2], [0, 1.38, 0], bone);
      for (const y of [.94, 1.085, 1.23]) {
        box(group, [.43, .065, .17], [0, y, .005], bone);
        box(group, [.07, .145, .14], [-.177, y + .05, -.055], bone);
        box(group, [.07, .145, .14], [.177, y + .05, -.055], bone);
      }
      head = new THREE.Group(); head.position.set(0, 1.65, 0); group.add(head);
      box(head, [.49, .49, .49], [0, 0, 0], bone);
      for (const x of [-.13, .13]) box(head, [.123, .128, .014], [x, .035, .252], dark);
      box(head, [.047, .093, .015], [0, -.047, .253], joint);
      box(head, [.24, .066, .014], [0, -.145, .253], dark);
      for (const x of [-.077, .077]) box(head, [.034, .05, .017], [x, -.142, .263], bone);
      for (const x of [-.29, .29]) {
        const arm = new THREE.Group(); arm.position.set(x, 1.33, 0); group.add(arm);
        box(arm, [.115, .115, .68], [0, 0, .34], bone);
        box(arm, [.145, .145, .13], [0, 0, .66], joint);
        limbs.push({ pivot: arm, phase: x < 0 ? 0 : Math.PI, arm: true, base: 0 });
        if (x < 0) {
          const bow = new THREE.Group(); bow.position.set(0, 0, .73); arm.add(bow);
          const wood = material('bowWood', '#775432', true);
          box(bow, [.065, .25, .075], [0, 0, .145], wood);
          box(bow, [.06, .21, .065], [0, .215, .084], wood).rotation.x = -.43;
          box(bow, [.06, .21, .065], [0, -.215, .084], wood).rotation.x = .43;
          box(bow, [.051, .17, .055], [0, .367, .017], wood).rotation.x = -.38;
          box(bow, [.051, .17, .055], [0, -.367, .017], wood).rotation.x = .38;
          box(bow, [.012, .81, .012], [0, 0, -.017], material('bowString', '#d7c8a5'));
        }
      }
    } else {
      const green = material('creeper', '#70a94a', true);
      const black = material('creeperFace', '#152815');
      box(group, [.47, .73, .34], [0, .89, 0], green);
      for (const x of [-.18, .18]) for (const z of [-.185, .185]) leg(x, z, .39, .235, green);
      head = new THREE.Group(); head.position.set(0, 1.56, 0); group.add(head);
      box(head, [.59, .59, .59], [0, 0, 0], green);
      for (const x of [-.148, .148]) box(head, [.147, .148, .014], [x, .074, .302], black);
      box(head, [.074, .146, .014], [0, -.036, .302], black);
      box(head, [.222, .149, .014], [0, -.11, .302], black);
      for (const x of [-.111, .111]) box(head, [.074, .147, .014], [x, -.183, .302], black);
    }
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.45), new THREE.MeshBasicMaterial({
      map: this.shadowTexture, transparent: true, depthWrite: false, opacity: .74,
    }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = .017;
    shadow.renderOrder = 1;
    group.add(shadow);
    return { group, limbs, head, materials, shadow };
  }

  spawnAt(type, position, data = {}) {
    if (!SPECIES[type] || this.entities.length >= 44) return null;
    const spec = SPECIES[type];
    const p = position.isVector3 ? position.clone() : new THREE.Vector3(position.x, position.y, position.z);
    if (![p.x, p.y, p.z].every(Number.isFinite)) return null;
    const model = this.createModel(type);
    const entity = {
      id: data.id || this.nextId++, type, spec, position: p, velocity: new THREE.Vector3(), model,
      health: Math.min(spec.health, data.health ?? spec.health), heading: data.heading ?? this.random() * TAU,
      targetHeading: data.heading ?? this.random() * TAU, moveTimer: 1 + this.random() * 4,
      walk: this.random() > .35, grounded: false, gait: this.random() * TAU,
      age: 0, hitTimer: 0, attackTimer: 0, fleeTimer: 0, fuse: 0,
      burnTimer: 0, ambientTimer: 7 + this.random() * 19, lastSkyCheck: 0, exposed: false,
    };
    this.nextId = Math.max(this.nextId, entity.id + 1);
    model.group.position.copy(p);
    model.group.rotation.y = entity.heading;
    this.group.add(model.group);
    this.entities.push(entity);
    return entity;
  }

  surface(x, z) {
    if (!this.isLoaded(x - .45, z - .45) || !this.isLoaded(x + .45, z + .45)) return null;
    const bx = Math.floor(x), bz = Math.floor(z);
    for (let y = HEIGHT - 2; y >= 2; y--) {
      const id = this.world.getBlock(bx, y, bz);
      if (id === B.WATER || id === B.LAVA || id === B.LEAVES || id === B.LOG) return null;
      if (isSolid(id)) {
        if (this.world.getBlock(bx, y + 1, bz) !== B.AIR || this.world.getBlock(bx, y + 2, bz) !== B.AIR) return null;
        return { x, y: y + 1.015, z, ground: id };
      }
    }
    return null;
  }

  isLoaded(x, z) {
    if (!(this.world.chunks instanceof Map)) return true;
    return this.world.chunks.has(`${Math.floor(x / 16)},${Math.floor(z / 16)}`);
  }

  spawnAround(pos, count = 10, hostile = false, near = 13, far = 34) {
    let spawned = 0;
    const p = pos.position || pos;
    for (let tries = 0; tries < count * 18 && spawned < count; tries++) {
      const angle = this.random() * TAU;
      const distance = near + this.random() * (far - near);
      const x = p.x + Math.sin(angle) * distance;
      const z = p.z + Math.cos(angle) * distance;
      const position = this.surface(x, z);
      if (!position || Math.abs(position.y - p.y) > 22) continue;
      if (this.entities.some(e => e.position.distanceToSquared(position) < 7)) continue;
      const type = hostile ? ['zombie', 'zombie', 'skeleton', 'creeper'][Math.floor(this.random() * 4)] : ['sheep', 'pig', 'cow'][Math.floor(this.random() * 3)];
      const entity = this.spawnAt(type, position);
      if (entity) spawned++;
    }
    return spawned;
  }

  blocked(pos, radius, height) {
    const eps = .0001;
    const minX = Math.floor(pos.x - radius + eps), maxX = Math.floor(pos.x + radius - eps);
    const minZ = Math.floor(pos.z - radius + eps), maxZ = Math.floor(pos.z + radius - eps);
    const minY = Math.floor(pos.y + eps), maxY = Math.floor(pos.y + height - eps);
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) for (let y = minY; y <= maxY; y++) {
      const id = this.world.getBlock(x, y, z);
      if (!isSolid(id)) continue;
      const bounds = blockBounds(id);
      if (pos.x + radius > x + bounds[0] + eps && pos.x - radius < x + bounds[1] - eps &&
          pos.y + height > y + bounds[2] + eps && pos.y < y + bounds[3] - eps &&
          pos.z + radius > z + bounds[4] + eps && pos.z - radius < z + bounds[5] - eps) return true;
    }
    return false;
  }

  lineOfSight(entity, player) {
    _eye.copy(entity.position).y += entity.spec.height * .82;
    _v.copy(player.position).y += 1.3;
    _v.sub(_eye);
    const length = _v.length();
    if (length < .01) return true;
    _v.multiplyScalar(1 / length);
    const hit = this.world.raycast?.(_eye, _v, length);
    return !hit || hit.distance >= length - .35;
  }

  exposedToSky(entity) {
    const x = Math.floor(entity.position.x), z = Math.floor(entity.position.z);
    for (let y = Math.ceil(entity.position.y + entity.spec.height); y < HEIGHT; y++) {
      const block = this.world.getBlock(x, y, z);
      if (isSolid(block) || block === B.LEAVES) return false;
    }
    return true;
  }

  update(dt, player, { daylight = 1, time = 0, mode = 'survival', paused = false } = {}) {
    if (paused || !player?.position) return;
    dt = Math.min(.06, Math.max(0, dt));
    this.elapsed += dt;
    this.lastPlayer = player;
    this.lastMode = mode;
    const night = daylight < .19;
    const damageable = mode !== 'creative' && (player.health === undefined || player.health > 0);
    this.spawnTimer += dt;
    this.balanceTimer += dt;
    if (this.spawnTimer > 5.5) {
      this.spawnTimer = 0;
      if (night && this.entities.filter(e => e.spec.hostile).length < 7) this.spawnAround(player.position, 2, true, 21, 37);
    }
    if (this.balanceTimer > 13) {
      this.balanceTimer = 0;
      if (this.entities.filter(e => !e.spec.hostile).length < 10) this.spawnAround(player.position, 2, false, 24, 41);
    }
    for (const e of [...this.entities]) {
      e.age += dt;
      e.moveTimer -= dt;
      e.attackTimer -= dt;
      e.hitTimer = Math.max(0, e.hitTimer - dt);
      e.fleeTimer = Math.max(0, e.fleeTimer - dt);
      e.ambientTimer -= dt;
      const distance = e.position.distanceTo(player.position);
      const despawnDistance = Math.max(46, Math.min(105, (this.world.renderDistance || 4) * 16 + 14));
      if (distance > despawnDistance || e.position.y < -5 || !this.isLoaded(e.position.x, e.position.z)) { this.remove(e); continue; }
      let speed = 0;
      const chase = e.spec.hostile && damageable && distance < 25;
      if (chase) {
        e.targetHeading = Math.atan2(player.position.x - e.position.x, player.position.z - e.position.z);
        e.walk = true;
        speed = e.spec.speed;
      } else {
        if (e.moveTimer <= 0) {
          e.moveTimer = 2.5 + this.random() * 5;
          e.walk = this.random() < .64;
          e.targetHeading = e.heading + (this.random() - .5) * 3.5;
        }
        speed = e.walk ? e.spec.speed * .72 : 0;
      }
      if (e.fleeTimer > 0) { speed = 3.1; e.walk = true; }
      e.heading += normalizeAngle(e.targetHeading - e.heading) * Math.min(1, dt * (chase ? 7 : 3.8));
      if (e.type === 'zombie' && chase && distance < 1.6 && e.attackTimer <= 0 && this.lineOfSight(e, player)) {
        this.onDamage(3, '僵尸');
        this.knockPlayer(player, e.position, 3.3);
        e.attackTimer = 1.05;
        this.sound?.play('zombie_attack');
      }
      if (e.type === 'skeleton' && chase && distance < 22 && this.lineOfSight(e, player)) {
        if (distance < 12) speed = distance < 3 ? -.8 : 0;
        if (e.attackTimer <= 0) { this.shootArrow(e, player); e.attackTimer = 2.1 + this.random() * .45; }
      }
      if (e.type === 'creeper') {
        const armed = chase && distance < 2.8 && this.lineOfSight(e, player);
        if (armed || (e.fuse > 0 && chase && distance < 4.8)) {
          if (e.fuse === 0) this.sound?.play('creeper_fuse');
          e.fuse += dt;
          speed *= .08;
          if (e.fuse > 1.7) { this.explode(e, player, damageable); continue; }
        } else e.fuse = Math.max(0, e.fuse - dt * 2.5);
      }
      if (e.type === 'zombie' || e.type === 'skeleton') {
        e.lastSkyCheck -= dt;
        if (e.lastSkyCheck <= 0) { e.exposed = this.exposedToSky(e); e.lastSkyCheck = 1.2; }
        const wet = this.world.getBlock(Math.floor(e.position.x), Math.floor(e.position.y + .3), Math.floor(e.position.z)) === B.WATER;
        if (daylight > .65 && e.exposed && !wet) {
          e.burnTimer += dt;
          if (e.burnTimer > 1.25) {
            e.burnTimer = 0;
            this.damage(e, 2, null, false);
            if (e.health <= 0) continue;
          }
          if (this.random() < dt * 5) this.emitParticles(e.position.clone().add(new THREE.Vector3(0, .85, 0)), '#ef872b', 1, .7);
        } else e.burnTimer = 0;
      }
      if (e.ambientTimer <= 0 && distance < 19 && !e.fuse) {
        this.sound?.play(e.type);
        e.ambientTimer = 10 + this.random() * 25;
      }
      this.move(e, dt, speed);
      e.gait += speed * dt * 7;
      for (const limb of e.model.limbs) {
        const amplitude = limb.arm ? .055 : .58;
        limb.pivot.rotation.x = Math.sin(e.gait + limb.phase) * Math.min(1, speed) * amplitude;
      }
      e.model.group.position.copy(e.position);
      e.model.group.rotation.y = e.heading;
      const pulse = e.fuse > 0 ? (Math.sin(e.fuse * e.fuse * 20) > 0 ? .44 : 0) : 0;
      for (const material of e.model.materials.values()) {
        material.emissive.setRGB(e.hitTimer > 0 ? .5 : pulse, e.hitTimer > 0 ? .035 : pulse, e.hitTimer > 0 ? .015 : pulse);
      }
      const scale = e.fuse > 0 ? 1 + .05 * Math.sin(e.fuse * 16) : 1;
      e.model.group.scale.set(1, scale, 1);
      e.model.shadow.visible = e.grounded;
      e.model.shadow.material.opacity = .48 + daylight * .27;
    }
    this.updateParticles(dt);
    this.updateArrows(dt, player, damageable);
  }

  shootArrow(entity, player) {
    if (this.projectiles.length >= 64) return;
    const origin = entity.position.clone().add(new THREE.Vector3(Math.sin(entity.heading) * .7, 1.33, Math.cos(entity.heading) * .7));
    const aim = player.position.clone().add(new THREE.Vector3(0, 1.03, 0)).sub(origin);
    const distance = aim.length();
    aim.normalize().multiplyScalar(17);
    aim.y += distance * 12 / 34;
    aim.x += (this.random() - .5) * .5;
    aim.z += (this.random() - .5) * .5;
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(this.geometry(.027, .027, .74), this.arrowMaterials[0]); group.add(shaft);
    const tip = new THREE.Mesh(this.arrowTipGeometry, this.arrowMaterials[1]);
    tip.rotation.x = Math.PI / 2; tip.position.z = .43; group.add(tip);
    const feather1 = new THREE.Mesh(this.geometry(.14, .012, .16), this.arrowMaterials[2]); feather1.position.z = -.3; group.add(feather1);
    const feather2 = new THREE.Mesh(this.geometry(.012, .14, .16), this.arrowMaterials[2]); feather2.position.z = -.3; group.add(feather2);
    group.position.copy(origin); this.group.add(group);
    this.projectiles.push({ group, velocity: aim, age: 0, stuck: false });
    this.sound?.play('bow');
  }

  updateArrows(dt, player, damageable) {
    const forward = new THREE.Vector3(0, 0, 1);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const arrow = this.projectiles[i]; arrow.age += dt;
      if (arrow.age > (arrow.stuck ? 32 : 8) || arrow.group.position.distanceToSquared(player.position) > 110 * 110) {
        this.group.remove(arrow.group); this.projectiles.splice(i, 1); continue;
      }
      if (arrow.stuck) continue;
      arrow.velocity.y -= 12 * dt;
      const direction = arrow.velocity.clone().normalize();
      const length = arrow.velocity.length() * dt;
      _ray.set(arrow.group.position, direction);
      let worldHit = this.world.raycast?.(arrow.group.position, direction, length + .1);
      let hitPlayer = false;
      if (damageable) {
        _box.min.copy(player.position).add(new THREE.Vector3(-.3, 0, -.3));
        _box.max.copy(player.position).add(new THREE.Vector3(.3, 1.8, .3));
        if (_ray.intersectBox(_box, _hit)) {
          const d = arrow.group.position.distanceTo(_hit);
          hitPlayer = d <= length + .1 && (!worldHit || d < worldHit.distance);
        }
      }
      arrow.group.quaternion.setFromUnitVectors(forward, direction);
      if (hitPlayer) {
        this.onDamage(4, '骷髅射手');
        this.knockPlayer(player, arrow.group.position, 1.5);
        this.sound?.play('arrow_hit');
        this.group.remove(arrow.group); this.projectiles.splice(i, 1);
      } else if (worldHit) {
        arrow.group.position.addScaledVector(direction, Math.max(0, worldHit.distance - .23));
        arrow.stuck = true; arrow.age = 0; this.sound?.play('arrow_hit');
      } else arrow.group.position.addScaledVector(arrow.velocity, dt);
    }
  }

  move(e, dt, speed) {
    const p = e.position;
    const radius = e.spec.radius;
    const height = e.spec.height;
    const water = this.world.getBlock(Math.floor(p.x), Math.floor(p.y + .5), Math.floor(p.z)) === B.WATER;
    if (water) {
      e.velocity.y += 11 * dt;
      e.velocity.y *= Math.pow(.86, dt * 20);
      speed *= .6;
    } else e.velocity.y -= 23 * dt;
    e.velocity.y = Math.max(-26, e.velocity.y);
    const dx = (Math.sin(e.heading) * speed + e.velocity.x) * dt;
    const dz = (Math.cos(e.heading) * speed + e.velocity.z) * dt;
    let obstructed = false;
    p.x += dx;
    if (!this.isLoaded(p.x - radius, p.z - radius) || !this.isLoaded(p.x + radius, p.z + radius) || this.blocked(p, radius, height)) { p.x -= dx; obstructed = true; e.velocity.x = 0; }
    p.z += dz;
    if (!this.isLoaded(p.x - radius, p.z - radius) || !this.isLoaded(p.x + radius, p.z + radius) || this.blocked(p, radius, height)) { p.z -= dz; obstructed = true; e.velocity.z = 0; }
    if (obstructed && e.grounded && speed > .1) {
      e.velocity.y = 7.2;
      if (!e.spec.hostile) e.targetHeading += (this.random() - .5) * 1.5;
    }
    const dy = e.velocity.y * dt;
    e.grounded = false;
    const steps = Math.max(1, Math.ceil(Math.abs(dy) / .18));
    for (let step = 0; step < steps; step++) {
      const oldY = p.y;
      const delta = dy / steps;
      p.y += delta;
      if (this.blocked(p, radius, height)) {
        let low = 0, high = 1;
        for (let i = 0; i < 10; i++) {
          const middle = (low + high) / 2;
          p.y = oldY + delta * middle;
          if (this.blocked(p, radius, height)) high = middle; else low = middle;
        }
        p.y = oldY + delta * low;
        e.grounded = dy < 0;
        e.velocity.y = 0;
        break;
      }
    }
    const friction = Math.pow(e.grounded ? .04 : .35, dt);
    e.velocity.x *= friction;
    e.velocity.z *= friction;
    const b = this.world.getBlock(Math.floor(p.x), Math.floor(p.y + .2), Math.floor(p.z));
    if (b === B.LAVA && e.hitTimer === 0) this.damage(e, 4, null, false);
  }

  attack(origin, direction, range = 3.2, damage = 3) {
    _ray.set(origin, _v.copy(direction).normalize());
    let best = null, nearest = range;
    const obstruction = this.world.raycast?.(origin, direction, range);
    if (obstruction) nearest = Math.min(nearest, obstruction.distance + .02);
    for (const e of this.entities) {
      _box.min.set(e.position.x - e.spec.radius, e.position.y, e.position.z - e.spec.radius - .18);
      _box.max.set(e.position.x + e.spec.radius, e.position.y + e.spec.height, e.position.z + e.spec.radius + .18);
      if (_ray.intersectBox(_box, _hit)) {
        const distance = origin.distanceTo(_hit);
        if (distance < nearest) { nearest = distance; best = e; }
      }
    }
    if (!best) return null;
    const point = _ray.at(nearest, new THREE.Vector3());
    this.damage(best, damage, origin);
    return { id: best.id, type: best.type, name: NAMES[best.type], entity: best, position: point, distance: nearest, killed: best.health <= 0 };
  }

  damage(entity, amount, from, sounds = true) {
    if (!this.entities.includes(entity) || entity.health <= 0) return;
    entity.health -= amount;
    entity.hitTimer = .24;
    entity.fleeTimer = entity.spec.hostile ? 0 : 3.5;
    if (from) {
      const away = entity.position.clone().sub(from); away.y = 0; away.normalize();
      entity.velocity.x = away.x * 5;
      entity.velocity.z = away.z * 5;
      entity.velocity.y = 4;
      entity.targetHeading = Math.atan2(away.x, away.z);
    }
    if (sounds) this.sound?.play('mob_hurt', entity.type);
    if (entity.health <= 0) {
      const pos = entity.position.clone().add(new THREE.Vector3(0, .5, 0));
      if (entity.type === 'sheep') { this.onDrop(B.WOOL, 1, pos); this.onDrop(106, 1 + Math.floor(this.random() * 2), pos); }
      if (entity.type === 'pig' || entity.type === 'cow') this.onDrop(106, 1 + Math.floor(this.random() * 3), pos);
      if (entity.type === 'zombie') this.onDrop(106, 1, pos);
      this.emitParticles(pos, '#e5e0d1', 12, .8);
      this.sound?.play('mob_death', entity.type);
      this.remove(entity);
    }
  }

  explode(entity, player, damageable) {
    const center = entity.position.clone().add(new THREE.Vector3(0, .65, 0));
    this.sound?.play('explosion');
    this.emitParticles(center, '#d6cabc', 32, 2.8);
    const distance = center.distanceTo(player.position.clone().add(new THREE.Vector3(0, .9, 0)));
    if (damageable && distance < 5.5) {
      this.onDamage(Math.max(1, Math.ceil(20 * (1 - distance / 5.5))), '苦力怕爆炸');
      this.knockPlayer(player, center, 9 * (1 - distance / 5.5));
    }
    for (const other of [...this.entities]) {
      if (other === entity) continue;
      const distance = center.distanceTo(other.position);
      if (distance < 4.5) this.damage(other, Math.ceil(18 * (1 - distance / 4.5)), center);
    }
    const ox = Math.floor(center.x), oy = Math.floor(center.y), oz = Math.floor(center.z);
    const submerged = this.world.getBlock(ox, oy, oz) === B.WATER;
    if (!submerged) for (let x = ox - 3; x <= ox + 3; x++) for (let y = oy - 3; y <= oy + 3; y++) for (let z = oz - 3; z <= oz + 3; z++) {
      const d2 = (x + .5 - center.x) ** 2 + (y + .5 - center.y) ** 2 + (z + .5 - center.z) ** 2;
      if (d2 > 7.8 || y <= 0) continue;
      const id = this.world.getBlock(x, y, z);
      if (id !== B.BEDROCK && id !== B.OBSIDIAN && id !== B.WATER && id !== B.LAVA && id !== B.AIR) this.world.setBlock(x, y, z, B.AIR);
    }
    this.remove(entity);
  }

  knockPlayer(player, origin, strength) {
    if (!player.velocity) return;
    const away = player.position.clone().sub(origin);
    away.y = 0;
    if (away.lengthSq() < .0001) away.set(1, 0, 0);
    away.normalize();
    player.velocity.x += away.x * strength;
    player.velocity.z += away.z * strength;
    player.velocity.y = Math.max(player.velocity.y, Math.min(7, strength * .6));
  }

  emitParticles(pos, color, count = 8, force = 1) {
    for (let i = 0; i < count && this.particles.length < 100; i++) {
      const material = new THREE.MeshLambertMaterial({ color, transparent: true });
      const mesh = new THREE.Mesh(this.particleGeometry, material);
      mesh.position.copy(pos).add(new THREE.Vector3((this.random() - .5) * .4, this.random() * .35, (this.random() - .5) * .4));
      mesh.rotation.set(this.random() * 3, this.random() * 3, this.random() * 3);
      const size = .5 + this.random(); mesh.scale.setScalar(size);
      this.group.add(mesh);
      this.particles.push({ mesh, velocity: new THREE.Vector3((this.random() - .5) * force * 4, (this.random() * 3 + 1) * force, (this.random() - .5) * force * 4), life: .65 + this.random() * .4, age: 0 });
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt; p.velocity.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * 3; p.mesh.rotation.z += dt * 2;
      p.mesh.material.opacity = Math.max(0, 1 - p.age / p.life);
      if (p.age > p.life) { this.group.remove(p.mesh); p.mesh.material.dispose(); this.particles.splice(i, 1); }
    }
  }

  remove(entity) {
    const index = this.entities.indexOf(entity);
    if (index < 0) return;
    this.entities.splice(index, 1);
    this.group.remove(entity.model.group);
    for (const material of entity.model.materials.values()) material.dispose();
    entity.model.shadow.geometry.dispose();
    entity.model.shadow.material.dispose();
  }

  serialize() {
    return this.entities.map(e => ({ id: e.id, type: e.type, x: e.position.x, y: e.position.y, z: e.position.z, heading: e.heading, health: e.health }));
  }

  load(data) {
    for (const entity of [...this.entities]) this.remove(entity);
    for (const arrow of this.projectiles) this.group.remove(arrow.group);
    this.projectiles = [];
    if (!Array.isArray(data)) return;
    for (const entry of data.slice(0, 44)) {
      if (!SPECIES[entry.type] || ![entry.x, entry.y, entry.z].every(Number.isFinite) || entry.health <= 0) continue;
      this.spawnAt(entry.type, entry, entry);
    }
  }

  dispose() {
    for (const entity of [...this.entities]) this.remove(entity);
    for (const p of this.particles) { this.group.remove(p.mesh); p.mesh.material.dispose(); }
    this.particles = [];
    for (const arrow of this.projectiles) this.group.remove(arrow.group);
    this.projectiles = [];
    for (const texture of this.textures.values()) texture.dispose();
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.shadowTexture.dispose();
    this.particleGeometry.dispose();
    this.arrowTipGeometry.dispose();
    for (const material of this.arrowMaterials) material.dispose();
    this.scene.remove(this.group);
  }
}
