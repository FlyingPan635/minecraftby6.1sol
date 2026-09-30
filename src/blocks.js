export const B = Object.freeze({ AIR:0, GRASS:1, DIRT:2, STONE:3, SAND:4, WATER:5, LOG:6, LEAVES:7, PLANKS:8, COBBLE:9, GLASS:10, BRICKS:11, BEDROCK:12, COAL_ORE:13, IRON_ORE:14, GOLD_ORE:15, DIAMOND_ORE:16, SNOW:17, CACTUS:18, CRAFTING:19, FURNACE:20, TORCH:21, WOOL:22, FLOWER:23, TALL_GRASS:24, GRAVEL:25, OBSIDIAN:26, LAVA:27, CHEST:28, BED:29, FARMLAND:30, CROP_YOUNG:31, CROP_MATURE:32, SAPLING:33, DOOR:34, DOOR_TOP:35, DOOR_OPEN:36, DOOR_OPEN_TOP:37, STICK:100, COAL:101, IRON:102, GOLD:103, DIAMOND:104, APPLE:105, RAW_MEAT:106, COOKED_MEAT:107, WOOD_PICK:110, STONE_PICK:111, IRON_PICK:112, DIAMOND_PICK:113, WOOD_AXE:114, STONE_AXE:115, IRON_AXE:116, WOOD_SWORD:117, STONE_SWORD:118, IRON_SWORD:119, BREAD:120, WHEAT:121, SEEDS:122, BUCKET:123, WATER_BUCKET:124, WOOD_HOE:125, STONE_HOE:126, IRON_HOE:127 });

const definitions = [
 [0,'空气','#ffffff',false,true,0,0,'air'],
 [1,'草方块','#789c49',true,false,.6,2,'grass'],
 [2,'泥土','#866044',true,false,.5,2,'dirt'],
 [3,'石头','#818181',true,false,1.5,9,'stone','pickaxe'],
 [4,'沙子','#d8ca8a',true,false,.5,4,'sand'],
 [5,'水','#397ddd',false,true,100,0,'water'],
 [6,'橡木原木','#77613c',true,false,2,6,'log','axe'],
 [7,'橡树树叶','#4d8334',true,true,.2,7,'leaves'],
 [8,'橡木木板','#ae8957',true,false,2,8,'planks','axe'],
 [9,'圆石','#797979',true,false,2,9,'cobble','pickaxe'],
 [10,'玻璃','#c4e3eb',true,true,.3,0,'glass'],
 [11,'红砖块','#ac5944',true,false,2,11,'bricks','pickaxe'],
 [12,'基岩','#444444',true,false,Infinity,0,'bedrock'],
 [13,'煤矿石','#646464',true,false,3,101,'coal_ore','pickaxe'],
 [14,'铁矿石','#aa9282',true,false,3,14,'iron_ore','pickaxe'],
 [15,'金矿石','#beac61',true,false,3,15,'gold_ore','pickaxe'],
 [16,'钻石矿石','#60bbb7',true,false,3,104,'diamond_ore','pickaxe'],
 [17,'雪块','#e8f1f4',true,false,.2,17,'snow'],
 [18,'仙人掌','#4e863b',true,false,.4,18,'cactus'],
 [19,'工作台','#98734b',true,false,2.5,19,'crafting','axe'],
 [20,'熔炉','#6e6e6e',true,false,3.5,20,'furnace','pickaxe'],
 [21,'火把','#e8b448',false,true,0,21,'torch'],
 [22,'白色羊毛','#e8e6de',true,false,.8,22,'wool'],
 [23,'虞美人','#d62c32',false,true,0,23,'flower'],
 [24,'草','#789d45',false,true,0,122,'tall_grass'],
 [25,'砂砾','#918881',true,false,.6,25,'gravel'],
 [26,'黑曜石','#352844',true,false,50,26,'obsidian','pickaxe'],
 [27,'熔岩','#eb651a',false,true,100,0,'lava'],
 [28,'箱子','#ab772f',true,false,2.5,28,'chest','axe'],
 [29,'红色床','#bf3e3e',true,true,.2,29,'bed','axe'],
 [30,'耕地','#765231',true,false,.6,2,'farmland'],
 [31,'生长中的小麦','#739c42',false,true,0,122,'crop_young'],
 [32,'成熟的小麦','#c3aa49',false,true,0,121,'crop_mature'],
 [33,'橡树树苗','#598537',false,true,0,33,'sapling'],
 [34,'橡木门','#af884a',true,true,3,34,'door_bottom','axe'],
 [35,'橡木门上部','#af884a',true,true,3,34,'door_top','axe'],
 [36,'打开的橡木门','#af884a',true,true,3,34,'door_bottom','axe'],
 [37,'打开的橡木门上部','#af884a',true,true,3,34,'door_top','axe'],
];
export const BLOCKS = Object.fromEntries(definitions.map(([id,name,color,solid,transparent,hardness,drop,tile,tool])=>[id,{id,name,color,solid,transparent,hardness,drop,tile,tool}]));
for(const id of [B.DOOR_TOP,B.DOOR_OPEN,B.DOOR_OPEN_TOP])BLOCKS[id].hidden=true;
const itemDefs = [
 [100,'木棍','#947347'],[101,'煤炭','#303034'],[102,'铁锭','#d2d2c9'],[103,'金锭','#f3ce45'],[104,'钻石','#4ae2d4'],[105,'苹果','#d3332d','food',4],
 [106,'生猪肉','#e58a89','food',3],[107,'熟猪排','#a66838','food',8],
 [110,'木镐','#a78953','pickaxe',59,2],[111,'石镐','#939393','pickaxe',131,4],[112,'铁镐','#d0d3cc','pickaxe',250,6],[113,'钻石镐','#43ddd5','pickaxe',1561,8],
 [114,'木斧','#a78953','axe',59,2],[115,'石斧','#939393','axe',131,4],[116,'铁斧','#d0d3cc','axe',250,6],
 [117,'木剑','#a78953','sword',59,4],[118,'石剑','#939393','sword',131,5],[119,'铁剑','#d0d3cc','sword',250,6],
 [120,'面包','#caa147','food',5],[121,'小麦','#cead42'],[122,'小麦种子','#76a244'],[123,'铁桶','#b1bdc3'],[124,'水桶','#4f8ac3'],
 [125,'木锄','#a78953','hoe',59,2],[126,'石锄','#939393','hoe',131,4],[127,'铁锄','#d0d3cc','hoe',250,6],
];
export const ITEMS = {...BLOCKS,...Object.fromEntries(itemDefs.map(([id,name,color,type,value,power])=>[id,{id,name,color,type,tool:['pickaxe','axe','sword','hoe'].includes(type)?type:undefined,durability:['pickaxe','axe','sword','hoe'].includes(type)?value:undefined,maxDurability:['pickaxe','axe','sword','hoe'].includes(type)?value:undefined,food:type==='food'?value:undefined,hunger:type==='food'?value:undefined,power:power??1,speed:type==='pickaxe'||type==='axe'?power:1,damage:type==='sword'?power:(type==='axe'?power:1),stackSize:['pickaxe','axe','sword','hoe'].includes(type)||id===123||id===124?1:64,maxStack:['pickaxe','axe','sword','hoe'].includes(type)||id===123||id===124?1:64}]))};
export const isSolid = id => !!BLOCKS[id]?.solid;
export const isTransparent = id => BLOCKS[id]?.transparent !== false;
export const getItem = id => ITEMS[id] || ITEMS[B.AIR];
export const isLiquid = id => id === B.WATER || id === B.LAVA;
export const tileForFace = (id,face) => {
 if(typeof face==='number')face=['px','nx','py','ny','pz','nz'][face]||'pz';
 if(id===B.GRASS) return face==='py'?'grass_top':face==='ny'?'dirt':'grass_side';
 if(id===B.LOG) return face==='py'||face==='ny'?'log_top':'log';
 if(id===B.CACTUS) return face==='py'||face==='ny'?'cactus_top':'cactus';
 if(id===B.CRAFTING) return face==='py'?'crafting_top':face==='ny'?'planks':face==='pz'?'crafting_front':'crafting_side';
 if(id===B.FURNACE) return face==='pz'?'furnace_front':'furnace';
 if(id===B.CHEST) return face==='py'?'chest_top':face==='pz'?'chest_front':'chest';
 if(id===B.BED) return face==='py'?'bed_top':'bed';
 if(id===B.FARMLAND) return face==='py'?'farmland':'dirt';
 if([B.DOOR,B.DOOR_TOP].includes(id))return face==='pz'||face==='nz'?BLOCKS[id].tile:'planks';
 if([B.DOOR_OPEN,B.DOOR_OPEN_TOP].includes(id))return face==='px'||face==='nx'?BLOCKS[id].tile:'planks';
 return BLOCKS[id]?.tile || 'stone';
};
export const getTile = tileForFace;
