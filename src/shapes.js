/** Local bounds shared by player collision, selection, and voxel ray targeting. */
export function blockBounds(id){
  if(id===30)return [[0,1],[0,.9375],[0,1]];
  if(id===34||id===35)return [[0,1],[0,1],[0,.1875]];
  if(id===36||id===37)return [[0,.1875],[0,1],[0,1]];
  if(id===18)return [[.0625,.9375],[0,1],[.0625,.9375]];
  if(id===28)return [[.0625,.9375],[0,.875],[.0625,.9375]];
  if(id===29)return [[0,1],[0,.5625],[0,1]];
  if(id===21)return [[.40625,.59375],[0,.8],[.40625,.59375]];
  if([23,24,31,32,33].includes(id))return [[.12,.88],[0,.9],[.12,.88]];
  return [[0,1],[0,1],[0,1]];
}
export function intersectBlock(origin,direction,x,y,z,id,maxDistance){
  const bounds=blockBounds(id),base=[x,y,z],axes=['x','y','z'];let entry=0,exit=maxDistance,normal={x:0,y:0,z:0};
  for(let i=0;i<3;i++){
    const axis=axes[i],d=direction[axis],o=origin[axis],min=base[i]+bounds[i][0],max=base[i]+bounds[i][1];
    if(Math.abs(d)<1e-10){if(o<min||o>max)return null;continue;}
    let near=(min-o)/d,far=(max-o)/d;if(near>far)[near,far]=[far,near];
    if(near>entry){entry=near;normal={x:0,y:0,z:0};normal[axis]=-Math.sign(d);}
    exit=Math.min(exit,far);if(entry>exit)return null;
  }
  return exit>=0&&entry<=maxDistance?{distance:entry,normal}:null;
}
