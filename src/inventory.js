const STACK = 64;
export const TOOL_DURABILITY = {110:59,111:131,112:250,113:1561,114:59,115:131,116:250,117:59,118:131,119:250,125:59,126:131,127:250};
export const maxStack = id => TOOL_DURABILITY[id] || id === 123 || id === 124 ? 1 : STACK;
const fresh = (id,count) => ({id,count,...(TOOL_DURABILITY[id] ? {durability:TOOL_DURABILITY[id]} : {})});
const validStack = s => s && Number.isInteger(s.id) && s.id > 0 && Number.isFinite(s.count) && s.count > 0 ? {...s,count:Math.min(maxStack(s.id),Math.floor(s.count))} : null;

export class Inventory {
  constructor(mode='survival') {
    this.mode = mode;
    this.slots = Array(36).fill(null);
    this.selected = 0;
    this.storage = {};
    this.pending = [];
    if (mode === 'creative') [1,3,8,6,10,9,21,19,20].forEach((id,i) => this.slots[i]=fresh(id,64));
    else this.add(105,2);
  }
  get selectedItem() { return this.slots[this.selected]; }
  setSelected(n) { this.selected = ((Math.trunc(n)%9)+9)%9; }
  add(id,count=1,properties=null) {
    if (!Number.isInteger(id) || id <= 0 || count <= 0) return Math.max(0,count);
    let left = Math.floor(count);
    const max = maxStack(id);
    for (const s of this.slots) if (s && s.id===id && s.count<max && !TOOL_DURABILITY[id]) {
      const amount=Math.min(max-s.count,left); s.count+=amount; left-=amount;
      if (!left) return 0;
    }
    for (let i=0;i<this.slots.length && left;i++) if (!this.slots[i]) {
      const amount=Math.min(max,left); this.slots[i]={...fresh(id,amount),...(TOOL_DURABILITY[id]&&properties?.durability!==undefined?{durability:properties.durability}:{})}; left-=amount;
    }
    return left;
  }
  count(id) { return this.slots.reduce((n,s)=>n+(s?.id===id?s.count:0),0); }
  remove(id,count=1) {
    if (this.count(id)<count || count<0) return false;
    let left=count;
    for(let i=0;i<this.slots.length && left;i++) {
      const s=this.slots[i]; if(s?.id!==id) continue;
      const amount=Math.min(left,s.count); s.count-=amount; left-=amount;
      if(!s.count) this.slots[i]=null;
    }
    return true;
  }
  consumeSelected(n=1) {
    if(this.mode==='creative') return true;
    const s=this.selectedItem;
    if(!s || s.count<n) return false;
    s.count-=n; if(!s.count) this.slots[this.selected]=null;
    return true;
  }
  damageTool(amount=1) {
    const s=this.selectedItem;
    if(this.mode==='creative' || !s || !TOOL_DURABILITY[s.id]) return false;
    s.durability=(s.durability??TOOL_DURABILITY[s.id])-amount;
    if(s.durability<=0) { this.slots[this.selected]=null; return true; }
    return false;
  }
  serialize() { return {mode:this.mode,selected:this.selected,slots:this.slots.map(s=>s?{...s}:null),storage:this.storage,pending:this.pending}; }
  load(data) {
    if(!data || !Array.isArray(data.slots)) return;
    this.mode=data.mode==='creative'?'creative':'survival';
    this.slots=Array.from({length:36},(_,i)=>validStack(data.slots[i]));
    this.setSelected(data.selected||0);
    this.storage=data.storage && typeof data.storage==='object' ? data.storage : {};
    this.pending=Array.isArray(data.pending)?data.pending.map(validStack).filter(Boolean):[];
  }
  restorePending() {this.pending=this.pending.map(s=>({...s,count:this.add(s.id,s.count,s)})).filter(s=>s.count>0);}
}

const recipe = (id,name,result,ingredients,station='hand',pattern=null) => ({id,name,result:{id:result[0],count:result[1]},ingredients:ingredients.map(([id,count])=>({id,count})),station,pattern});
export const RECIPES = [
  recipe('planks','橡木木板',[8,4],[[6,1]],'hand',[['L']]),
  recipe('sticks','木棍',[100,4],[[8,2]],'hand',[['P'],['P']]),
  recipe('crafting','工作台',[19,1],[[8,4]],'hand',[['P','P'],['P','P']]),
  recipe('torch','火把',[21,4],[[101,1],[100,1]],'hand',[['C'],['S']]),
  recipe('wood_pick','木镐',[110,1],[[8,3],[100,2]],'crafting',[['P','P','P'],[null,'S',null],[null,'S',null]]),
  recipe('stone_pick','石镐',[111,1],[[9,3],[100,2]],'crafting',[['R','R','R'],[null,'S',null],[null,'S',null]]),
  recipe('iron_pick','铁镐',[112,1],[[102,3],[100,2]],'crafting',[['I','I','I'],[null,'S',null],[null,'S',null]]),
  recipe('diamond_pick','钻石镐',[113,1],[[104,3],[100,2]],'crafting',[['D','D','D'],[null,'S',null],[null,'S',null]]),
  recipe('wood_axe','木斧',[114,1],[[8,3],[100,2]],'crafting',[['P','P'],['P','S'],[null,'S']]),
  recipe('stone_axe','石斧',[115,1],[[9,3],[100,2]],'crafting',[['R','R'],['R','S'],[null,'S']]),
  recipe('iron_axe','铁斧',[116,1],[[102,3],[100,2]],'crafting',[['I','I'],['I','S'],[null,'S']]),
  recipe('wood_sword','木剑',[117,1],[[8,2],[100,1]],'crafting',[['P'],['P'],['S']]),
  recipe('stone_sword','石剑',[118,1],[[9,2],[100,1]],'crafting',[['R'],['R'],['S']]),
  recipe('iron_sword','铁剑',[119,1],[[102,2],[100,1]],'crafting',[['I'],['I'],['S']]),
  recipe('wood_hoe','木锄',[125,1],[[8,2],[100,2]],'crafting',[['P','P'],[null,'S'],[null,'S']]),
  recipe('stone_hoe','石锄',[126,1],[[9,2],[100,2]],'crafting',[['R','R'],[null,'S'],[null,'S']]),
  recipe('iron_hoe','铁锄',[127,1],[[102,2],[100,2]],'crafting',[['I','I'],[null,'S'],[null,'S']]),
  recipe('door','橡木门',[34,3],[[8,6]],'crafting',[['P','P'],['P','P'],['P','P']]),
  recipe('furnace','熔炉',[20,1],[[9,8]],'crafting',[['R','R','R'],['R',null,'R'],['R','R','R']]),
  recipe('chest','箱子',[28,1],[[8,8]],'crafting',[['P','P','P'],['P',null,'P'],['P','P','P']]),
  recipe('bed','床',[29,1],[[22,3],[8,3]],'crafting',[['W','W','W'],['P','P','P']]),
  recipe('bread','面包',[120,1],[[121,3]],'crafting',[['H','H','H']]),
  recipe('bucket','铁桶',[123,1],[[102,3]],'crafting',[['I',null,'I'],[null,'I',null]]),
  recipe('glass','玻璃',[10,1],[[4,1]],'furnace'),
  recipe('iron','铁锭',[102,1],[[14,1]],'furnace'),
  recipe('gold','金锭',[103,1],[[15,1]],'furnace'),
  recipe('stone','石头',[3,1],[[9,1]],'furnace'),
  recipe('charcoal','木炭',[101,1],[[6,1]],'furnace'),
  recipe('meat','熟肉',[107,1],[[106,1]],'furnace'),
];
const SYMBOLS={P:8,L:6,C:101,S:100,R:9,I:102,D:104,W:22,H:121};
for(const r of RECIPES) if(r.pattern) r.pattern=r.pattern.map(row=>row.map(v=>v ? SYMBOLS[v] : null));
export const FUELS={101:8,8:1.5,6:1.5,100:.5,110:1,114:1,117:1};
export function craft(recipeId,inventory,station='hand') {
  const r=RECIPES.find(r=>r.id===recipeId);
  if(!r || r.station==='crafting' && station!=='crafting' || r.station==='furnace' && station!=='furnace') return false;
  if(r.station!=='furnace' && station==='furnace') return false;
  if(!r.ingredients.every(ing=>inventory.count(ing.id)>=ing.count)) return false;
  const fuel=r.station==='furnace' ? Object.keys(FUELS).map(Number).find(id=>inventory.count(id)>(r.ingredients.find(a=>a.id===id)?.count||0)) : null;
  if(r.station==='furnace' && !fuel) return false;
  const copy=inventory.slots.map(s=>s?{...s}:null);
  for(const ing of r.ingredients) inventory.remove(ing.id,ing.count);
  if(fuel) inventory.remove(fuel,1);
  if(inventory.add(r.result.id,r.result.count)>0) { inventory.slots=copy; return false; }
  return true;
}
export function matchRecipe(grid,size=2) {
  const occupied=grid.map((s,i)=>s?i:-1).filter(i=>i>=0);
  if(!occupied.length) return null;
  const minX=Math.min(...occupied.map(i=>i%size)), maxX=Math.max(...occupied.map(i=>i%size));
  const minY=Math.min(...occupied.map(i=>Math.floor(i/size))), maxY=Math.max(...occupied.map(i=>Math.floor(i/size)));
  const pattern=Array.from({length:maxY-minY+1},(_,y)=>Array.from({length:maxX-minX+1},(_,x)=>grid[(y+minY)*size+x+minX]?.id||null));
  return RECIPES.find(r=>r.pattern && r.pattern.length===pattern.length && r.pattern[0].length===pattern[0].length && [false,true].some(mirror=>r.pattern.every((row,y)=>row.every((id,x)=>id===pattern[y][mirror?row.length-1-x:x]))));
}
