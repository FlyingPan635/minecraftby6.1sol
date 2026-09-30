import * as THREE from 'three';

const clamp=THREE.MathUtils.clamp;
export class Environment {
  constructor(scene,renderer){
    this.scene=scene;this.renderer=renderer;this.time=1000;this.day=1;this.weather='clear';this.weatherTimer=160;
    this.daylight=1;this.rainAmount=0;this.elapsed=0;
    this.skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color('#3585d6')},horizon:{value:new THREE.Color('#bedee9')},sunDir:{value:new THREE.Vector3(.5,.6,.1)},sunset:{value:0}},vertexShader:`varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`varying vec3 vDirection;uniform vec3 top;uniform vec3 horizon;uniform vec3 sunDir;uniform float sunset;void main(){vec3 d=normalize(vDirection);float h=pow(max(d.y,0.0),.58);vec3 c=mix(horizon,top,h);float glow=pow(max(dot(d,sunDir),0.0),10.0)*sunset*(1.0-h);c=mix(c,vec3(1.0,.44,.16),glow*.7);gl_FragColor=vec4(c,1.0);}`});
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(380,32,20),this.skyMaterial);this.sky.renderOrder=-100;scene.add(this.sky);
    this.ambient=new THREE.HemisphereLight(0xd4e8ff,0x65734d,2.0);scene.add(this.ambient);
    this.sunLight=new THREE.DirectionalLight(0xfff5db,2.6);this.sunLight.castShadow=true;
    const sh=this.sunLight.shadow;sh.mapSize.set(2048,2048);sh.camera.left=-55;sh.camera.right=55;sh.camera.top=55;sh.camera.bottom=-55;sh.camera.near=.5;sh.camera.far=240;sh.normalBias=.035;sh.bias=-.00012;sh.radius=3;
    scene.add(this.sunLight,this.sunLight.target);
    const sunMat=new THREE.MeshBasicMaterial({color:0xfff7dc,depthWrite:false,fog:false});
    this.sun=new THREE.Mesh(new THREE.PlaneGeometry(19,19),sunMat);scene.add(this.sun);
    const c=document.createElement('canvas');c.width=c.height=16;const ctx=c.getContext('2d');ctx.fillStyle='#e7e9e9';ctx.fillRect(0,0,16,16);ctx.fillStyle='#b3bcc3';for(const [x,y,w,h]of [[2,3,4,3],[9,2,3,3],[7,10,5,4],[2,11,2,3]])ctx.fillRect(x,y,w,h);
    const mt=new THREE.CanvasTexture(c);mt.magFilter=THREE.NearestFilter;
    this.moon=new THREE.Mesh(new THREE.PlaneGeometry(13,13),new THREE.MeshBasicMaterial({map:mt,depthWrite:false,fog:false}));scene.add(this.moon);
    const starGeo=new THREE.BufferGeometry(),arr=[];
    for(let i=0;i<1100;i++){const a=i*2.39996,z=(i/1100)*2-1,r=Math.sqrt(1-z*z);arr.push(Math.cos(a)*r*360,z*360,Math.sin(a)*r*360);}
    starGeo.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));this.stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xdfeaff,size:1.05,sizeAttenuation:true,transparent:true,opacity:0,depthWrite:false,fog:false}));scene.add(this.stars);
    this.clouds=new THREE.Group();this.cloudMat=new THREE.MeshLambertMaterial({color:0xffffff,transparent:true,opacity:.88});
    const geom=new THREE.BoxGeometry(1,1,1);
    for(let i=0;i<50;i++){const cloud=new THREE.Group();const x=((i*97.37)%360)-180,z=((i*57.8)%360)-180;cloud.position.set(x,78+(i%3)*2,z);for(let j=0;j<3;j++){const m=new THREE.Mesh(geom,this.cloudMat);m.scale.set(12+(i%4)*4,2.4,8+(j%2)*4);m.position.set(j*8,0,(j%2)*5);cloud.add(m);}this.clouds.add(cloud);}scene.add(this.clouds);
    const rainGeo=new THREE.BufferGeometry();this.rainPositions=new Float32Array(2400*3);for(let i=0;i<2400;i++){this.rainPositions[i*3]=(Math.random()-.5)*65;this.rainPositions[i*3+1]=Math.random()*40;this.rainPositions[i*3+2]=(Math.random()-.5)*65;}
    rainGeo.setAttribute('position',new THREE.BufferAttribute(this.rainPositions,3));this.rain=new THREE.Points(rainGeo,new THREE.PointsMaterial({color:0xa5c4dd,size:.09,transparent:true,opacity:0,depthWrite:false}));scene.add(this.rain);
    scene.fog=new THREE.FogExp2(0xbedee9,.009);
  }
  update(dt,player,settings,menu=false){
    this.elapsed+=dt;
    if(settings.autoTime&&!menu){this.time+=dt*20*(settings.timeSpeed||1);if(this.time>=24000){this.day+=Math.floor(this.time/24000);this.time%=24000;}}
    this.weatherTimer-=menu?0:dt;
    if(this.weatherTimer<0){this.weather=this.weather==='clear'&&Math.random()<.3?'rain':'clear';this.weatherTimer=180+Math.random()*360;}
    this.rainAmount+=(this.weather==='rain'?1-this.rainAmount:-this.rainAmount)*Math.min(1,dt*.2);
    const angle=(this.time/24000)*Math.PI*2;
    const dir=new THREE.Vector3(-Math.cos(angle),Math.sin(angle),-.23).normalize();
    this.daylight=clamp((dir.y+.13)/.42,0,1);
    const dusk=1-Math.abs(this.daylight-.5)*2;
    const top=new THREE.Color('#071225').lerp(new THREE.Color('#438fde'),this.daylight).lerp(new THREE.Color('#526273'),this.rainAmount*.5);
    const horizon=new THREE.Color('#102134').lerp(new THREE.Color('#bddbec'),this.daylight).lerp(new THREE.Color('#b79b90'),dusk*.42).lerp(new THREE.Color('#727f8a'),this.rainAmount*.58);
    this.sky.position.copy(player);this.skyMaterial.uniforms.top.value.copy(top);this.skyMaterial.uniforms.horizon.value.copy(horizon);this.skyMaterial.uniforms.sunDir.value.copy(dir);this.skyMaterial.uniforms.sunset.value=dusk;
    this.scene.fog.color.copy(horizon);
    this.ambient.intensity=(.22+this.daylight*1.6)*(1-this.rainAmount*.2);
    this.ambient.color.set(this.daylight>.5?0xd2e7ff:0x6f8fb9);this.ambient.groundColor.set(this.daylight>.5?0x6f734d:0x283443);
    this.sunLight.position.copy(player).addScaledVector(dir,110);this.sunLight.target.position.copy(player);
    this.sunLight.intensity=Math.max(0,dir.y*1.2+.5)*2.35*(1-this.rainAmount*.7);
    this.sunLight.color.set(dusk>.45?0xffbc81:0xfff7de);
    this.sun.position.copy(player).addScaledVector(dir,340);this.sun.lookAt(player);this.sun.visible=dir.y>-.1;
    this.moon.position.copy(player).addScaledVector(dir,-330);this.moon.lookAt(player);this.moon.visible=dir.y<.1;
    this.stars.position.copy(player);this.stars.material.opacity=(1-this.daylight)*.85*(1-this.rainAmount);
    this.clouds.position.set(Math.floor(player.x/100)*100+this.elapsed*.18,0,Math.floor(player.z/100)*100);this.cloudMat.color.set(0x283549).lerp(new THREE.Color(0xffffff),this.daylight);this.cloudMat.opacity=.8;
    this.rain.position.copy(player);this.rain.visible=this.rainAmount>.02;this.rain.material.opacity=this.rainAmount*.5;
    if(this.rain.visible){for(let i=0;i<2400;i++){this.rainPositions[i*3+1]-=dt*23;if(this.rainPositions[i*3+1]<0)this.rainPositions[i*3+1]+=40;}this.rain.geometry.attributes.position.needsUpdate=true;}
    this.renderer.toneMappingExposure=.8+this.daylight*.28;
  }
  setTime(time){this.time=((time%24000)+24000)%24000;}
  setWeather(weather){this.weather=weather;this.weatherTimer=300;}
}
