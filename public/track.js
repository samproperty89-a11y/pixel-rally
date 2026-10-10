export const TRACK_SCALE=2;
function makeTrack(id,name,coordinates){
 const points=coordinates.map(([x,y])=>[x*TRACK_SCALE,y*TRACK_SCALE]);
 const segments=points.map((p,i)=>{let q=points[(i+1)%points.length];return Math.hypot(q[0]-p[0],q[1]-p[1])});
 const length=segments.reduce((a,b)=>a+b,0),cutStart=segments.slice(0,9).reduce((a,b)=>a+b,0),cutEnd=segments.slice(0,12).reduce((a,b)=>a+b,0),cutRatio=(cutEnd-cutStart)/Math.hypot(points[12][0]-points[9][0],points[12][1]-points[9][1]);
 function position(distance,lane=0){let d=((distance%length)+length)%length;for(let i=0;i<segments.length;i++){if(d<=segments[i]){let a=points[i],b=points[(i+1)%points.length],t=d/segments[i],angle=Math.atan2(b[1]-a[1],b[0]-a[0]);return{x:a[0]+(b[0]-a[0])*t-Math.sin(angle)*lane,y:a[1]+(b[1]-a[1])*t+Math.cos(angle)*lane,angle,segment:i}}d-=segments[i]}return position(0,lane)}
 function racePosition(distance,lane=0,shortcut=false){let d=((distance%length)+length)%length;if(shortcut&&d>=cutStart&&d<cutEnd){let a=points[9],b=points[12],t=(d-cutStart)/(cutEnd-cutStart),angle=Math.atan2(b[1]-a[1],b[0]-a[0]);return{x:a[0]+(b[0]-a[0])*t-Math.sin(angle)*lane,y:a[1]+(b[1]-a[1])*t+Math.cos(angle)*lane,angle,segment:9}}return position(distance,lane)}
 return{id,name,points,segments,length,cutStart,cutEnd,cutRatio,position,racePosition};
}
export const tracks=[makeTrack('palm','PALM ISLAND GP',[[220,620],[440,620],[690,620],[900,570],[1030,430],[990,250],[820,160],[650,200],[730,310],[850,350],[780,430],[610,410],[500,300],[370,200],[210,210],[120,340],[210,420],[380,430],[440,510],[320,540],[160,510],[110,570]]),makeTrack('alpine','ALPINE NIGHT RUN',[[210,625],[460,625],[710,625],[970,590],[1040,460],[1030,270],[930,120],[750,100],[680,210],[840,260],[820,370],[670,410],[540,350],[570,185],[440,100],[260,115],[130,240],[150,375],[330,365],[410,465],[300,515],[135,510]])];
export const {points,segments,length,cutStart,cutEnd,cutRatio,position,racePosition}=tracks[0];
