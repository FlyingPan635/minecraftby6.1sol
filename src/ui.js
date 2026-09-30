import { ITEMS, getItem } from './blocks.js';
import { itemIcon } from './textures.js';
import { RECIPES, FUELS, TOOL_DURABILITY, maxStack, matchRecipe } from './inventory.js';
import './ui.css';

const $ = (tag,className,text) => {const el=document.createElement(tag); if(className) el.className=className; if(text!==undefined) el.textContent=text; return el;};
const nameOf = id => getItem(id)?.name || ITEMS[id]?.name || `物品 ${id}`;
const iconCache=new Map();
const iconOf = id => { if(!iconCache.has(id)) iconCache.set(id,itemIcon(id)); return iconCache.get(id); };
const copy = s => s?{...s}:null;
const ALL_IDS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,33,34,100,101,102,103,104,105,106,107,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127];
const CATEGORY = {
  building:[1,2,3,4,8,9,10,11,12,17,22,25,26],
  nature:[5,6,7,13,14,15,16,18,23,24,27,30,33,105,106,107,120,121,122],
  functional:[19,20,21,28,29,34,100,101,102,103,104,123,124],
  equipment:[110,111,112,113,114,115,116,117,118,119,125,126,127],
};

export class UI {
  constructor(inventory,callbacks={}) {
    this.inventory=inventory; this.callbacks=callbacks; this.currentScreen=null; this.state={health:20,hunger:20,air:10,xp:0,mode:inventory.mode,saveAvailable:!!localStorage.getItem('voxel-save-v1')};
    this.settings={fov:75,sensitivity:.6,renderDistance:5,shadows:true,autoTime:true,timeSpeed:1,volume:.5};
    try {Object.assign(this.settings,JSON.parse(localStorage.getItem('voxel-settings')||'{}'));} catch {}
    this.cursor=null; this.grid=[]; this.station='hand'; this.recipeBookOpen=true; this.creativeCategory='building'; this.mouse={x:0,y:0}; this.toastTimer=0;
    this.root=$('div','mc-ui'); document.body.append(this.root);
    this.hud=$('div','mc-hud'); this.root.append(this.hud);
    this.crosshair=$('div','mc-crosshair'); this.hud.append(this.crosshair);
    this.status=$('div','mc-status'); this.hud.append(this.status);
    this.hotbar=$('div','mc-hotbar'); this.hud.append(this.hotbar);
    this.hotbarSlots=Array.from({length:9},(_,i)=>{const s=this.slot(this.inventory.slots,i,false);s.classList.add('mc-hotbar-slot');this.hotbar.append(s);return s;});
    this.itemLabel=$('div','mc-item-label'); this.hud.append(this.itemLabel);
    this.debug=$('div','mc-debug'); this.hud.append(this.debug);
    this.hints=$('div','mc-control-hint','E 物品栏   ·   Esc 菜单'); this.hud.append(this.hints);
    this.panel=$('div','mc-screen'); this.root.append(this.panel);
    this.panel.onpointerdown=e=>{if(this.currentScreen==='inventory'&&e.target===this.panel&&this.cursor){e.preventDefault();this.dropCursor(e.button===2?1:this.cursor.count);}};
    this.tooltip=$('div','mc-tooltip'); this.root.append(this.tooltip);
    this.cursorEl=$('div','mc-item-cursor'); this.root.append(this.cursorEl);
    this.toastEl=$('div','mc-toast'); this.root.append(this.toastEl);
    this.pointerHandler=e=>{this.mouse={x:e.clientX,y:e.clientY};this.positionFloaters();}; document.addEventListener('pointermove',this.pointerHandler);
    this.contextHandler=e=>{if(this.currentScreen==='inventory')e.preventDefault();}; this.root.addEventListener('contextmenu',this.contextHandler);
    this.inventoryKeyHandler=e=>{if(this.currentScreen!=='inventory'||['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)||!this.hovered)return;const {slots,index}=this.hovered;const s=slots[index];if(/^Digit[1-9]$/.test(e.code)){const hotbar=Number(e.code.slice(-1))-1;if(slots===this.furnace?.slots&&index===2&&this.inventory.slots[hotbar])return;const swap=this.inventory.slots[hotbar];this.inventory.slots[hotbar]=s;slots[index]=swap;e.preventDefault();e.stopPropagation();this.changed();this.renderInventory();}else if(e.code==='KeyQ'&&s){const n=e.ctrlKey?s.count:1;if(this.callbacks.dropItem)this.callbacks.dropItem(s.id,n,s);else this.inventory.pending.push({...s,count:n});s.count-=n;if(!s.count)slots[index]=null;e.preventDefault();e.stopPropagation();this.changed();this.renderInventory();}};
    document.addEventListener('keydown',this.inventoryKeyHandler);
    this.furnaceTimer=setInterval(()=>this.tickFurnace(),250);
    this.setScreen('title');
  }
  get isOpen() { return this.currentScreen!==null; }
  close() { this.setScreen(null); }
  setInventory(inventory) { this.inventory=inventory;this.lastHud=''; }
  setScreen(screen) {
    if(this.currentScreen==='inventory' && screen!=='inventory') this.returnTransientItems();
    this.currentScreen=screen;this.tooltip.style.display='none';this.panel.replaceChildren();
    this.root.classList.toggle('mc-menu-open',screen!==null);
    this.root.classList.toggle('mc-title-screen',screen==='title'||screen==='loading');
    this.panel.style.display=screen===null?'none':'flex';
    if(screen==='title')this.title();
    if(screen==='loading')this.loading();
    if(screen==='pause')this.pause();
    if(screen==='settings')this.options();
    if(screen==='death')this.death();
    if(screen==='inventory'){if(!this.grid.length)this.grid=Array(this.station==='crafting'?9:4).fill(null);this.renderInventory();}
    if(screen==='command')this.commandInput();
    this.renderCursor();
  }
  button(text,handler,cls='') {const b=$('button',`mc-button ${cls}`,text);b.type='button';b.onclick=handler;return b;}
  menu(title) {const wrap=$('div','mc-menu');if(title)wrap.append($('h2','mc-menu-heading',title));this.panel.append(wrap);return wrap;}
  title() {
    this.panel.className='mc-screen mc-main-title';
    const logo=$('div','mc-logo','MINECRAFT');this.panel.append(logo);
    const splash=$('div','mc-splash','无限世界，无限可能！');this.panel.append(splash);
    const menu=this.menu();
    const resume=this.button('继续上次的世界',()=>this.callbacks.start?.({load:true}));resume.disabled=!this.state.saveAvailable;menu.append(resume);
    menu.append(this.button('单人游戏',()=>this.worldSetup()));
    menu.append(this.button('选项…',()=>{this.settingsReturn='title';this.setScreen('settings');}));
    const bottom=$('div','mc-title-bottom');bottom.append($('span','','MagiC 1.0 · 经典方块生存'),$('span','','原创像素素材 · 世界保存于本机'));this.panel.append(bottom);
  }
  worldSetup() {
    this.panel.className='mc-screen mc-dirt-screen';this.panel.replaceChildren();
    const menu=this.menu('创建新的世界');menu.classList.add('mc-world-setup');
    const seedLabel=$('label','mc-label','世界生成器的种子');const seed=$('input','mc-input');seed.placeholder='留空以随机生成';seed.autocomplete='off';seedLabel.append(seed);menu.append(seedLabel);
    menu.append($('p','mc-muted','相同种子会生成相同的世界。文字种子同样可用。'));
    let mode='survival',type='normal';
    const modeButton=this.button('游戏模式：生存',()=>{mode=mode==='survival'?'creative':'survival';modeButton.textContent=`游戏模式：${mode==='survival'?'生存':'创造'}`;modeHint.textContent=mode==='survival'?'搜集资源、合成工具，与夜晚的怪物作战。':'无限资源、自由飞行，随心建造。';});menu.append(modeButton);
    const modeHint=$('p','mc-muted','搜集资源、合成工具，与夜晚的怪物作战。');menu.append(modeHint);
    const types=['normal','amplified','floating'],names=['默认','放大化','浮空群岛'];
    const typeButton=this.button('世界类型：默认',()=>{type=types[(types.indexOf(type)+1)%types.length];typeButton.textContent=`世界类型：${names[types.indexOf(type)]}`;typeHint.textContent=type==='normal'?'山川、森林、沙漠与海洋。':type==='amplified'?'陡峭山峰与深邃峡谷，适合探索。':'云海之上的奇异岛屿，小心脚下的虚空。';});menu.append(typeButton);
    const typeHint=$('p','mc-muted','山川、森林、沙漠与海洋。');menu.append(typeHint);
    const row=$('div','mc-button-row');row.append(this.button('创建新的世界',()=>{let value=seed.value.trim();let numeric=value?Number(value):Math.floor(Math.random()*2147483647);if(!Number.isFinite(numeric)){numeric=2166136261;for(const char of value)numeric=Math.imul(numeric^char.charCodeAt(0),16777619);numeric>>>=0;}this.callbacks.start?.({seed:numeric,type,mode,renderDistance:this.settings.renderDistance});}),this.button('取消',()=>this.setScreen('title')));menu.append(row);
    requestAnimationFrame(()=>seed.focus());
  }
  loading() {
    this.panel.className='mc-screen mc-dirt-screen';const menu=this.menu('正在准备世界');this.loadingText=$('p','mc-load-text','生成地形…');menu.append(this.loadingText);
    const track=$('div','mc-load-track');this.loadBar=$('div','mc-load-bar');track.append(this.loadBar);menu.append(track);this.loadPercent=$('p','mc-load-percent','0%');menu.append(this.loadPercent);
  }
  setLoading(progress,text) {if(this.currentScreen!=='loading')this.setScreen('loading');this.loadBar.style.width=`${Math.max(0,Math.min(1,progress))*100}%`;this.loadPercent.textContent=`${Math.round(progress*100)}%`;if(text)this.loadingText.textContent=text;}
  pause() {
    this.panel.className='mc-screen mc-dim-screen';const menu=this.menu('游戏菜单');
    menu.append(this.button('返回游戏',()=>{this.close();this.callbacks.resume?.();}));
    menu.append(this.button('选项…',()=>{this.settingsReturn='pause';this.setScreen('settings');}));
    menu.append(this.button('保存世界',()=>{this.callbacks.save?.();this.toast('世界已保存');}));
    menu.append(this.button('保存并退出到标题画面',()=>{this.callbacks.exit?.();this.state.saveAvailable=!!localStorage.getItem('voxel-save-v1');this.setScreen('title');}));
    menu.append($('p','mc-muted mc-controls','W A S D 移动 · 空格 跳跃 · Shift 潜行\nCtrl 疾跑 · 左键 挖掘 / 攻击 · 右键 放置 / 使用\nE 物品栏 · 1–9 选择物品 · F3 调试信息\nT 指令 · 创造模式双击空格 飞行'));
  }
  options() {
    this.panel.className='mc-screen mc-dim-screen';const menu=this.menu('选项');menu.classList.add('mc-settings');
    const range=(name,key,min,max,step,format)=>{const row=$('label','mc-setting-row');const label=$('span','',`${name}：${format(this.settings[key])}`);const input=$('input','mc-range');input.type='range';input.min=min;input.max=max;input.step=step;input.value=this.settings[key];input.oninput=()=>{this.settings[key]=Number(input.value);label.textContent=`${name}：${format(this.settings[key])}`;this.applySettings();};row.append(label,input);menu.append(row);};
    range('视野','fov',50,110,1,v=>v===75?'正常':v+'°');
    range('鼠标灵敏度','sensitivity',.2,2.5,.05,v=>Math.round(v*100)+'%');
    range('渲染距离','renderDistance',2,8,1,v=>v+' 区块');
    range('主音量','volume',0,1,.05,v=>v===0?'关闭':Math.round(v*100)+'%');
    range('时间流逝速度','timeSpeed',.25,16,.25,v=>v+'×');
    const toggle=(name,key)=>{const b=this.button(`${name}：${this.settings[key]?'开启':'关闭'}`,()=>{this.settings[key]=!this.settings[key];b.textContent=`${name}：${this.settings[key]?'开启':'关闭'}`;this.applySettings();});menu.append(b);};
    toggle('实体阴影与动态光影','shadows');toggle('自动昼夜循环','autoTime');
    const timeRow=$('div','mc-button-row');timeRow.append(this.button('日出',()=>this.callbacks.command?.('/time set 0')),this.button('正午',()=>this.callbacks.command?.('/time set 6000')),this.button('夜晚',()=>this.callbacks.command?.('/time set 18000')));menu.append(timeRow);
    menu.append(this.button('完成',()=>this.setScreen(this.settingsReturn||'pause')));
  }
  applySettings() {try{localStorage.setItem('voxel-settings',JSON.stringify(this.settings));}catch{}this.callbacks.settings?.({...this.settings});}
  death() {
    this.panel.className='mc-screen mc-death-screen';const menu=this.menu('你死了！');menu.append($('p','mc-death-score',`分数：${Math.floor(this.state.xp||0)}`));
    menu.append(this.button('重生',()=>{this.close();this.callbacks.respawn?.();}));menu.append(this.button('返回标题画面',()=>{this.callbacks.save?.();this.callbacks.exit?.();this.setScreen('title');}));
  }
  showCommand() {this.setScreen('command');}
  commandInput() {
    this.panel.className='mc-screen mc-command-screen';const box=$('div','mc-command-box');box.append($('div','mc-command-help','/time set day  ·  /weather clear  ·  /gamemode creative  ·  /give 物品ID 数量  ·  /tp x y z'));
    const input=$('input','mc-command-input');input.placeholder='输入指令…';input.value='/';input.maxLength=256;input.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'){this.callbacks.command?.(input.value.trim());if(this.currentScreen==='command'){this.close();this.callbacks.resume?.();}}if(e.key==='Escape'){this.close();this.callbacks.resume?.();}};box.append(input);this.panel.append(box);setTimeout(()=>{input.focus();input.setSelectionRange(input.value.length,input.value.length);},0);
  }
  showInventory(station='hand',storageKey='default') {
    if(this.currentScreen==='inventory')this.returnTransientItems();
    this.station=station;this.storageKey=typeof storageKey==='string'?storageKey:JSON.stringify(storageKey??'default');
    this.grid=Array(station==='crafting'?9:4).fill(null);this.currentScreen='inventory';this.root.classList.add('mc-menu-open');this.panel.style.display='flex';
    if(station==='chest') {if(this.inventory.storage[this.storageKey]?.type!=='chest')this.inventory.storage[this.storageKey]={type:'chest',slots:Array(27).fill(null)};this.chest=this.inventory.storage[this.storageKey].slots;}
    if(station==='furnace') {if(this.inventory.storage[this.storageKey]?.type!=='furnace')this.inventory.storage[this.storageKey]={type:'furnace',slots:Array(3).fill(null),burn:0,burnMax:0,progress:0};this.furnace=this.inventory.storage[this.storageKey];}
    this.renderInventory();
  }
  returnTransientItems() {
    for(const s of [...this.grid,this.cursor]) if(s) {
      const rest=this.inventory.add(s.id,s.count,s);
      if(rest) {if(this.callbacks.dropItem)this.callbacks.dropItem(s.id,rest);else this.inventory.pending.push({...s,count:rest});}
    }
    this.grid=[];this.cursor=null;this.renderCursor();this.changed();
  }
  changed() {this.lastHud='';this.callbacks.inventoryChanged?.();}
  dropCursor(count) {if(!this.cursor)return;if(this.callbacks.dropItem)this.callbacks.dropItem(this.cursor.id,count,this.cursor);else this.inventory.pending.push({...this.cursor,count});this.cursor.count-=count;if(!this.cursor.count)this.cursor=null;this.changed();this.renderCursor();}
  slot(slots,index,interactive=true,extra='') {
    const cell=$('button',`mc-slot ${extra}`);cell.type='button';cell.dataset.slot=index;cell.tabIndex=-1;
    const draw=()=>{cell.replaceChildren();const s=slots[index];cell.setAttribute('aria-label',`槽位 ${index+1}：${s?nameOf(s.id)+' ×'+s.count:'空'}`);if(!s)return;const img=$('img','mc-item-icon');img.src=iconOf(s.id);img.draggable=false;cell.append(img);if(s.count>1)cell.append($('span','mc-stack-count',s.count));if(TOOL_DURABILITY[s.id] && s.durability<TOOL_DURABILITY[s.id]){const bar=$('span','mc-durability');bar.style.width=Math.max(0,s.durability/TOOL_DURABILITY[s.id]*80)+'%';bar.style.background=`hsl(${Math.max(0,s.durability/TOOL_DURABILITY[s.id]*120)},85%,45%)`;cell.append(bar);}};
    draw();cell.draw=draw;
    if(interactive) {
      cell.onpointerdown=e=>{e.preventDefault();this.moveStack(slots,index,e.button===2,e.shiftKey);this.renderInventory();this.renderCursor();this.changed();};
      cell.onmouseenter=()=>{this.hovered={slots,index};const s=slots[index];if(s)this.showTooltip(nameOf(s.id),TOOL_DURABILITY[s.id]?`耐久：${s.durability??TOOL_DURABILITY[s.id]} / ${TOOL_DURABILITY[s.id]}`:'');};
      cell.onmouseleave=()=>{this.hovered=null;this.tooltip.style.display='none';};
    }
    return cell;
  }
  moveStack(slots,index,right=false,shift=false) {
    let s=slots[index];
    if(shift && s) {
      if(slots===this.inventory.slots) {
        if(this.station==='chest') this.transfer(s,this.chest);
        else if(this.station==='furnace') {const target=FUELS[s.id]?1:0;this.transfer(s,this.furnace.slots,[target]);}
        else {const order=index<9?Array.from({length:27},(_,i)=>i+9):Array.from({length:9},(_,i)=>i);this.transfer(s,this.inventory.slots,order);}
      } else this.transfer(s,this.inventory.slots);
      if(s.count<=0)slots[index]=null;return;
    }
    if(!this.cursor) {if(!s)return;const amount=right?Math.ceil(s.count/2):s.count;this.cursor={...s,count:amount};s.count-=amount;if(!s.count)slots[index]=null;return;}
    const amount=right?1:this.cursor.count;
    if(!s) {const moved=Math.min(amount,maxStack(this.cursor.id));slots[index]={...this.cursor,count:moved};this.cursor.count-=moved;}
    else if(s.id===this.cursor.id && !TOOL_DURABILITY[s.id]) {const moved=Math.min(amount,maxStack(s.id)-s.count);s.count+=moved;this.cursor.count-=moved;}
    else if(!right) {slots[index]=this.cursor;this.cursor=s;}
    if(this.cursor?.count<=0)this.cursor=null;
  }
  transfer(stack,target,indices=null) {
    const order=indices||target.map((_,i)=>i);
    for(const i of order) if(target[i]?.id===stack.id && !TOOL_DURABILITY[stack.id]) {const n=Math.min(stack.count,maxStack(stack.id)-target[i].count);target[i].count+=n;stack.count-=n;}
    for(const i of order) if(!target[i] && stack.count) {const n=Math.min(stack.count,maxStack(stack.id));target[i]={...stack,count:n};stack.count-=n;}
  }
  renderInventory() {
    this.hovered=null;
    this.inventory.restorePending();
    this.panel.className='mc-screen mc-inventory-screen';this.panel.replaceChildren();this.tooltip.style.display='none';
    const layout=$('div','mc-inventory-layout');const window=$('div','mc-inventory-window');this.panel.append(layout);layout.append(window);
    const heading=$('div','mc-inventory-heading',this.station==='crafting'?'工作台':this.station==='chest'?'箱子':this.station==='furnace'?'熔炉':this.inventory.mode==='creative'?'创造模式物品栏':'物品栏');
    const close=$('button','mc-window-close','×');close.title='关闭 (E / Esc)';close.onclick=()=>{this.close();this.callbacks.resume?.();};heading.append(close);window.append(heading);
    if(this.station==='chest') {const chestGrid=$('div','mc-slots-grid mc-chest-grid');this.chest.forEach((_,i)=>chestGrid.append(this.slot(this.chest,i)));window.append(chestGrid);}
    else if(this.station==='furnace')window.append(this.furnacePanel());
    else if(this.inventory.mode==='creative' && this.station==='hand')window.append(this.creativePanel());
    else window.append(this.craftingPanel());
    window.append($('div','mc-section-label','物品栏'));
    const backpack=$('div','mc-slots-grid');for(let i=9;i<36;i++)backpack.append(this.slot(this.inventory.slots,i));window.append(backpack);
    const hotbar=$('div','mc-slots-grid mc-inventory-hotbar');for(let i=0;i<9;i++)hotbar.append(this.slot(this.inventory.slots,i,true,this.inventory.selected===i?'mc-inventory-selected':''));window.append(hotbar);
    window.append($('div','mc-inventory-help','左键：拾取 / 放置　右键：分半 / 单个　Shift：快速移动'));
    if(this.recipeBookOpen && this.station!=='chest' && !(this.inventory.mode==='creative' && this.station==='hand'))layout.prepend(this.recipeBook());
  }
  craftingPanel() {
    const row=$('div','mc-crafting-area');
    const toggle=$('button','mc-book-button','▤');toggle.title='显示 / 隐藏配方书';toggle.onclick=()=>{this.recipeBookOpen=!this.recipeBookOpen;this.renderInventory();};row.append(toggle);
    if(this.station==='hand') {
      const portrait=$('div','mc-player-portrait');portrait.innerHTML='<div class="mc-steve-head"></div><div class="mc-steve-body"></div><div class="mc-steve-arm a"></div><div class="mc-steve-arm b"></div><div class="mc-steve-leg a"></div><div class="mc-steve-leg b"></div>';
      row.append(portrait);const armor=$('div','mc-armor-slots');['♙','▣','▥','▰'].forEach((s,i)=>{const slot=$('div','mc-slot mc-armor-placeholder',s);slot.title=['头盔','胸甲','护腿','靴子'][i];armor.append(slot);});row.prepend(armor);
    }
    const group=$('div','mc-craft-group');group.append($('div','mc-section-label','合成'));const grid=$('div',`mc-crafting-grid mc-grid-${this.station==='crafting'?3:2}`);this.grid.forEach((_,i)=>grid.append(this.slot(this.grid,i)));group.append(grid);row.append(group);
    row.append($('span','mc-craft-arrow','➜'));const output=$('div','mc-craft-output');const found=matchRecipe(this.grid,this.station==='crafting'?3:2);const out=found?[copy(found.result)]:[null];const cell=this.slot(out,0,false,'mc-output-slot');cell.onclick=e=>this.takeCraftResult(e.shiftKey);cell.onmouseenter=()=>found&&this.showTooltip(nameOf(found.result.id),'点击合成 · Shift 连续合成');cell.onmouseleave=()=>this.tooltip.style.display='none';output.append(cell);row.append(output);
    return row;
  }
  takeCraftResult(multiple=false) {
    let crafts=0,resultId=0;
    do {
      const found=matchRecipe(this.grid,this.station==='crafting'?3:2);if(!found)break;
      const out=found.result;resultId=out.id;
      if(multiple) {const snapshot=this.inventory.slots.map(copy);if(this.inventory.add(out.id,out.count)>0){this.inventory.slots=snapshot;break;}}
      else {
        if(this.cursor && (this.cursor.id!==out.id || this.cursor.count+out.count>maxStack(out.id)))break;
        if(!this.cursor)this.cursor={...out,...(TOOL_DURABILITY[out.id]?{durability:TOOL_DURABILITY[out.id]}:{})};else this.cursor.count+=out.count;
      }
      this.grid=this.grid.map(s=>{if(!s)return null;s.count--;return s.count?s:null;});crafts++;
    } while(multiple && crafts<64);
    if(crafts){this.toast(`已合成 ${nameOf(resultId)}`);this.changed();this.renderInventory();this.renderCursor();}
  }
  recipeBook() {
    const book=$('div','mc-recipe-book');book.append($('div','mc-book-heading','配方书'));
    const search=$('input','mc-input mc-recipe-search');search.placeholder='搜索…';search.value=this.recipeSearch||'';search.oninput=()=>{this.recipeSearch=search.value;this.updateRecipeList(list);};book.append(search);
    const filter=this.button(this.onlyCraftable?'显示可合成':'显示全部配方',()=>{this.onlyCraftable=!this.onlyCraftable;this.renderInventory();},'mc-small-button');book.append(filter);
    const list=$('div','mc-recipe-list');book.append(list);this.updateRecipeList(list);book.append($('p','mc-book-tip','点击配方自动摆放材料。\n红色背景表示材料不足。'));return book;
  }
  updateRecipeList(list) {
    list.replaceChildren();
    const station=this.station;
    for(const r of RECIPES) {
      if(station==='furnace'?r.station!=='furnace':r.station==='furnace'||r.station==='crafting'&&station!=='crafting')continue;
      if(this.recipeSearch && !r.name.includes(this.recipeSearch))continue;
      const ready=r.ingredients.every(a=>this.inventory.count(a.id)+this.grid.reduce((n,s)=>n+(s?.id===a.id?s.count:0),0)>=a.count);
      if(this.onlyCraftable&&!ready)continue;
      const cell=$('button',`mc-recipe-cell ${ready?'mc-recipe-ready':'mc-recipe-missing'}`);cell.setAttribute('aria-label',`配方：${r.name} ×${r.result.count}${ready?'':'（材料不足）'}`);const img=$('img','mc-item-icon');img.src=iconOf(r.result.id);cell.append(img);if(r.result.count>1)cell.append($('span','mc-stack-count',r.result.count));
      cell.onmouseenter=()=>this.showTooltip(r.name,r.ingredients.map(a=>`${nameOf(a.id)} × ${a.count}`).join('\n'));
      cell.onmouseleave=()=>this.tooltip.style.display='none';cell.onclick=()=>this.fillRecipe(r);list.append(cell);
    }
  }
  fillRecipe(r) {
    if(this.station==='furnace') {
      const ing=r.ingredients[0];if(this.inventory.count(ing.id)<ing.count){this.toast('材料不足');return;}
      if(this.furnace.slots[0] && this.furnace.slots[0].id!==ing.id){this.toast('请先取出熔炉中的材料');return;}
      if((this.furnace.slots[0]?.count||0)>=64)return;
      this.inventory.remove(ing.id,1);if(this.furnace.slots[0])this.furnace.slots[0].count++;else this.furnace.slots[0]={id:ing.id,count:1};
      if(!this.furnace.slots[1]) {const fuel=Object.keys(FUELS).map(Number).find(id=>this.inventory.count(id)>0);if(fuel){this.inventory.remove(fuel,1);this.furnace.slots[1]={id:fuel,count:1};}}
      this.changed();this.renderInventory();return;
    }
    const originalSlots=this.inventory.slots.map(copy),originalGrid=this.grid.map(copy);
    for(const s of this.grid)if(s && this.inventory.add(s.id,s.count,s)>0){this.inventory.slots=originalSlots;this.grid=originalGrid;this.toast('请先腾出物品栏空间');this.renderInventory();return;}
    this.grid.fill(null);
    if(!r.ingredients.every(a=>this.inventory.count(a.id)>=a.count)){this.toast('材料不足');this.renderInventory();return;}
    const size=this.station==='crafting'?3:2;
    r.pattern.forEach((row,y)=>row.forEach((id,x)=>{if(id){this.inventory.remove(id,1);this.grid[y*size+x]={id,count:1};}}));
    this.changed();this.renderInventory();
  }
  creativePanel() {
    const panel=$('div','mc-creative-panel');const tabs=$('div','mc-creative-tabs');const labels={building:'建筑',nature:'自然',functional:'功能',equipment:'工具',all:'全部'};
    for(const key of Object.keys(labels)){const tab=this.button(labels[key],()=>{this.creativeCategory=key;this.renderInventory();},`mc-creative-tab ${this.creativeCategory===key?'active':''}`);tabs.append(tab);}panel.append(tabs);
    const search=$('input','mc-input mc-creative-search');search.placeholder='搜索物品';search.value=this.creativeSearch||'';panel.append(search);
    const list=$('div','mc-creative-list');panel.append(list);
    const draw=()=>{list.replaceChildren();for(const id of this.creativeSearch?ALL_IDS:this.creativeCategory==='all'?ALL_IDS:CATEGORY[this.creativeCategory]) {
      if(this.creativeSearch&&!nameOf(id).includes(this.creativeSearch))continue;
      const c=this.slot([{id,count:1}],0,false);c.onpointerdown=e=>{e.preventDefault();const stack={id,count:e.button===2?1:maxStack(id),...(TOOL_DURABILITY[id]?{durability:TOOL_DURABILITY[id]}:{})};if(e.shiftKey)this.inventory.slots[this.inventory.selected]=stack;else this.cursor=stack;this.changed();this.renderCursor();this.renderInventory();};c.onmouseenter=()=>this.showTooltip(nameOf(id),'左键 1 组 · 右键 1 个 · Shift 放入选中快捷栏');c.onmouseleave=()=>this.tooltip.style.display='none';list.append(c);
    }};search.oninput=()=>{this.creativeSearch=search.value;draw();};draw();return panel;
  }
  furnacePanel() {
    const row=$('div','mc-furnace-area');const input=$('div','mc-furnace-input');input.append(this.slot(this.furnace.slots,0));
    this.flame=$('div','mc-furnace-flame',this.furnace.burn>0?'♨':'♧');input.append(this.flame,this.slot(this.furnace.slots,1));row.append(input);
    const arrow=$('div','mc-smelt-arrow','➜');this.smeltFill=$('div','mc-smelt-fill','➜');this.smeltFill.style.width=this.furnace.progress*100+'%';arrow.append(this.smeltFill);row.append(arrow);
    const out=this.slot(this.furnace.slots,2,true,'mc-output-slot');out.onpointerdown=e=>{e.preventDefault();const result=this.furnace.slots[2];if(!result)return;if(e.shiftKey){this.transfer(result,this.inventory.slots);if(!result.count)this.furnace.slots[2]=null;}else if(!this.cursor){this.cursor={...result};this.furnace.slots[2]=null;}else if(this.cursor.id===result.id){const amount=Math.min(maxStack(result.id)-this.cursor.count,result.count);this.cursor.count+=amount;result.count-=amount;if(!result.count)this.furnace.slots[2]=null;}this.changed();this.renderInventory();this.renderCursor();};row.append(out);row.append($('div','mc-smelt-label','燃料\n煤炭 / 木材 / 木棍'));return row;
  }
  tickFurnace() {
    if(this.currentScreen==='pause'||this.currentScreen==='settings'||this.currentScreen==='title'||this.currentScreen==='loading'||this.currentScreen==='death')return;
    for(const store of Object.values(this.inventory.storage)) {
      if(store.type!=='furnace')continue;
      const [input,fuel,output]=store.slots;const r=input&&RECIPES.find(r=>r.station==='furnace'&&r.ingredients[0].id===input.id);
      const can=r && (!output || output.id===r.result.id && output.count<maxStack(output.id));
      if(store.burn>0)store.burn=Math.max(0,store.burn-.25);
      if(can && store.burn<=0 && fuel && FUELS[fuel.id]) {store.burn=FUELS[fuel.id]*8;store.burnMax=store.burn;fuel.count--;if(!fuel.count)store.slots[1]=null;this.changed();if(this.currentScreen==='inventory'&&this.station==='furnace')this.renderInventory();}
      if(can && store.burn>0){store.progress=(store.progress||0)+.25/8;if(store.progress>=1){input.count--;if(!input.count)store.slots[0]=null;if(store.slots[2])store.slots[2].count++;else store.slots[2]={...r.result};store.progress=0;this.changed();if(this.currentScreen==='inventory'&&this.station==='furnace')this.renderInventory();}}
      else store.progress=Math.max(0,(store.progress||0)-.05);
      if(store===this.furnace && this.currentScreen==='inventory' && this.station==='furnace') {if(this.smeltFill)this.smeltFill.style.width=store.progress*100+'%';if(this.flame){this.flame.textContent=store.burn>0?'♨':'♧';this.flame.classList.toggle('burning',store.burn>0);}}
    }
  }
  showTooltip(name,detail='') {this.tooltip.replaceChildren($('strong','',name));if(detail)this.tooltip.append($('div','mc-tooltip-detail',detail));this.tooltip.style.display='block';this.positionFloaters();}
  positionFloaters() {const x=this.mouse.x,y=this.mouse.y;this.cursorEl.style.left=x+'px';this.cursorEl.style.top=y+'px';this.tooltip.style.left=Math.min(x+18,innerWidth-this.tooltip.offsetWidth-12)+'px';this.tooltip.style.top=Math.min(y-18,innerHeight-this.tooltip.offsetHeight-8)+'px';}
  renderCursor() {this.cursorEl.replaceChildren();if(this.cursor && this.currentScreen==='inventory'){const img=$('img','mc-item-icon');img.src=iconOf(this.cursor.id);this.cursorEl.append(img);if(this.cursor.count>1)this.cursorEl.append($('span','mc-stack-count',this.cursor.count));this.cursorEl.style.display='block';}else this.cursorEl.style.display='none';this.positionFloaters();}
  toast(text,duration=2800) {this.toastEl.textContent=text;this.toastEl.classList.add('visible');clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>this.toastEl.classList.remove('visible'),duration);}
  update(state) {
    const previous=this.state;this.state={...this.state,...state};
    if(this.currentScreen==='title' && previous.saveAvailable!==this.state.saveAvailable){const first=this.panel.querySelector('.mc-menu .mc-button');if(first)first.disabled=!this.state.saveAvailable;}
    const signature=JSON.stringify([this.inventory.slots.slice(0,9),this.inventory.selected,this.state.health,this.state.hunger,this.state.air,this.state.xp,this.state.mode]);
    if(this.lastHud!==signature) {
      this.lastHud=signature;
      for(let i=0;i<9;i++) {const c=this.hotbarSlots[i];c.replaceChildren();const s=this.inventory.slots[i];c.setAttribute('aria-label',`快捷栏 ${i+1}：${s?nameOf(s.id)+' ×'+s.count:'空'}`);if(s){const img=$('img','mc-item-icon');img.src=iconOf(s.id);c.append(img);if(s.count>1)c.append($('span','mc-stack-count',s.count));if(TOOL_DURABILITY[s.id]&&s.durability<TOOL_DURABILITY[s.id]){const bar=$('span','mc-durability');bar.style.width=Math.max(0,s.durability/TOOL_DURABILITY[s.id]*80)+'%';bar.style.background=`hsl(${s.durability/TOOL_DURABILITY[s.id]*120},85%,45%)`;c.append(bar);}}c.classList.toggle('selected',this.inventory.selected===i);}
      this.renderStatus();
    }
    const selected=`${this.inventory.selected}:${this.inventory.selectedItem?.id||0}`;
    if(this.lastSelected!==selected){this.lastSelected=selected;this.itemLabel.textContent=this.inventory.selectedItem?nameOf(this.inventory.selectedItem.id):'';this.itemLabel.classList.add('visible');clearTimeout(this.itemLabelTimer);this.itemLabelTimer=setTimeout(()=>this.itemLabel.classList.remove('visible'),2200);}
    this.debug.style.display=this.state.debug?'block':'none';
    if(this.state.debug && (!this.debugUpdated || performance.now()-this.debugUpdated>200)){this.debugUpdated=performance.now();const p=this.state.position||{};this.debug.textContent=`MagiC · Java 风格方块世界\n${Math.round(this.state.fps||0)} fps · 渲染距离 ${this.settings.renderDistance} 区块\nXYZ: ${(p.x||0).toFixed(3)} / ${(p.y||0).toFixed(3)} / ${(p.z||0).toFixed(3)}\n区块: ${Math.floor((p.x||0)/16)}, ${Math.floor((p.z||0)/16)}\n群系: ${this.state.biome||'平原'}\n时间: ${Math.floor(this.state.time||0)} · 第 ${this.state.day||0} 天\n模式: ${this.inventory.mode==='creative'?'创造':'生存'}${this.state.flying?' · 飞行中':''}\n${this.state.targetName?'目标: '+this.state.targetName:''}`;}
  }
  renderStatus() {
    this.status.replaceChildren();if(this.inventory.mode==='creative')return;
    const stats=$('div','mc-survival-stats');const hearts=$('div','mc-hearts');const hunger=$('div','mc-hunger');
    for(let i=0;i<10;i++){const heart=$('span','mc-heart');const hp=Math.max(0,Math.min(2,(this.state.health??20)-i*2));heart.dataset.fill=hp>=2?'full':hp>=1?'half':'empty';hearts.append(heart);const food=$('span','mc-food');const n=Math.max(0,Math.min(2,(this.state.hunger??20)-(9-i)*2));food.dataset.fill=n>=2?'full':n>=1?'half':'empty';hunger.append(food);}stats.append(hearts,hunger);this.status.append(stats);
    if((this.state.air??10)<10){const air=$('div','mc-air');for(let i=0;i<Math.ceil(this.state.air);i++)air.append($('span','mc-bubble'));this.status.append(air);}
    const xp=$('div','mc-xp-track');const fill=$('div','mc-xp-fill');const amount=this.state.xp||0;const level=Math.floor(amount/10);fill.style.width=((amount%10)*10)+'%';xp.append(fill);if(level)xp.append($('span','mc-xp-level',level));this.status.append(xp);
  }
  dispose() {clearInterval(this.furnaceTimer);clearTimeout(this.toastTimer);clearTimeout(this.itemLabelTimer);document.removeEventListener('pointermove',this.pointerHandler);document.removeEventListener('keydown',this.inventoryKeyHandler);this.root.remove();}
}
