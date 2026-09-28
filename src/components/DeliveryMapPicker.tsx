import { useEffect, useState } from "react";
export type MapLocation = { latitude:number; longitude:number };
const INITIAL:MapLocation={latitude:-21.360,longitude:-48.230};
const TILE=256;
function project(p:MapLocation,z:number){const n=2**z;const lat=Math.max(-85.05112878,Math.min(85.05112878,p.latitude))*Math.PI/180;return {x:(p.longitude+180)/360*n,y:(1-Math.asinh(Math.tan(lat))/Math.PI)/2*n};}
function unproject(x:number,y:number,z:number):MapLocation{const n=2**z;return {longitude:x/n*360-180,latitude:Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI};}
/** A lightweight, dependency-free OSM tile selector. Position must still be reviewed server-side. */
export function DeliveryMapPicker({value,onChange}:{value:MapLocation|null;onChange:(p:MapLocation)=>void}){
  const [center,setCenter]=useState<MapLocation>(value??INITIAL);const [zoom,setZoom]=useState(16);
  useEffect(() => {
    if (value) setCenter(value);
  }, [value?.latitude, value?.longitude]);
  const tile=project(center,zoom),size=2**zoom;
  const tiles=[] as {x:number;y:number;url:string;left:number;top:number}[];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const x=Math.floor(tile.x)+dx,y=Math.floor(tile.y)+dy;
    if(y<0||y>=size)continue;
    tiles.push({x,y,url:`https://tile.openstreetmap.org/${zoom}/${(x+size)%size}/${y}.png`,left:(x-tile.x)*TILE-TILE/2,top:(y-tile.y)*TILE-TILE/2});
  }
  const choose=(clientX:number,clientY:number,rect:DOMRect)=>{
    const x=tile.x+(clientX-rect.left-rect.width/2)/TILE;
    const y=tile.y+(clientY-rect.top-rect.height/2)/TILE;
    const p=unproject(x,y,zoom);onChange(p);setCenter(p);
  };
  const marker=value?project(value,zoom):null;
  const markerX=marker?(marker.x-tile.x)*TILE+TILE/2:null;
  const markerY=marker?(marker.y-tile.y)*TILE+TILE/2:null;
  return <div className="space-y-2"><div className="relative h-64 w-full overflow-hidden rounded-xl border bg-secondary" role="application" aria-label="Mapa para escolher o ponto de entrega" onClick={e=>{const rect=e.currentTarget.getBoundingClientRect();choose(e.clientX,e.clientY,rect);}}>
    {tiles.map(t=><img key={`${zoom}-${t.x}-${t.y}`} src={t.url} alt="" draggable={false} className="pointer-events-none absolute h-64 w-64 max-w-none select-none" style={{left:`calc(50% + ${t.left}px)`,top:`calc(50% + ${t.top}px)`}}/>)}
    {markerX!==null&&markerY!==null&&Math.abs(markerX)<1024&&Math.abs(markerY!)<1024&&<span className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full text-3xl drop-shadow" style={{left:`calc(50% + ${markerX-128}px)`,top:`calc(50% + ${markerY!-128}px)`}} aria-label="Ponto escolhido">📍</span>}
    <span className="pointer-events-none absolute bottom-1 right-1 bg-background/90 px-1 text-[10px]">© OpenStreetMap contributors</span>
  </div><div className="flex items-center gap-2"><button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setZoom(z=>Math.min(19,z+1))}>+ Zoom</button><button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setZoom(z=>Math.max(12,z-1))}>− Zoom</button><button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={()=>{setCenter(INITIAL);setZoom(16);}}>Guariba</button></div><p className="text-xs text-muted-foreground">Toque no mapa para escolher o ponto exato. Para deslocar a visualização, escolha outro ponto e ajuste o zoom. Confirme rua e número separadamente.</p></div>;
}
