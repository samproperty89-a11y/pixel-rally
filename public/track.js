export const TRACK_SCALE=2;
export const points=[[220,620],[440,620],[690,620],[900,570],[1030,430],[990,250],[820,160],[650,200],[730,310],[850,350],[780,430],[610,410],[500,300],[370,200],[210,210],[120,340],[210,420],[380,430],[440,510],[320,540],[160,510],[110,570]].map(([x,y])=>[x*TRACK_SCALE,y*TRACK_SCALE]);
export const segments=points.map((p,i)=>{let q=points[(i+1)%points.length];return Math.hypot(q[0]-p[0],q[1]-p[1])});
export const length=segments.reduce((a,b)=>a+b,0);
export const cutStart=segments.slice(0,9).reduce((a,b)=>a+b,0),cutEnd=segments.slice(0,12).reduce((a,b)=>a+b,0);
export const cutRatio=(cutEnd-cutStart)/Math.hypot(points[12][0]-points[9][0],points[12][1]-points[9][1]);
export function racePosition(distance,lane=0,shortcut=false){let d=((distance%length)+length)%length;if(shortcut&&d>=cutStart&&d<cutEnd){let a=points[9],b=points[12],t=(d-cutStart)/(cutEnd-cutStart),angle=Math.atan2(b[1]-a[1],b[0]-a[0]);return{x:a[0]+(b[0]-a[0])*t-Math.sin(angle)*lane,y:a[1]+(b[1]-a[1])*t+Math.cos(angle)*lane,angle,segment:9}}return position(distance,lane)}
export function position(distance,lane=0){let d=((distance%length)+length)%length;for(let i=0;i<segments.length;i++){if(d<=segments[i]){let a=points[i],b=points[(i+1)%points.length],t=d/segments[i],angle=Math.atan2(b[1]-a[1],b[0]-a[0]);return{x:a[0]+(b[0]-a[0])*t-Math.sin(angle)*lane,y:a[1]+(b[1]-a[1])*t+Math.cos(angle)*lane,angle,segment:i}}d-=segments[i]}return position(0,lane)}
