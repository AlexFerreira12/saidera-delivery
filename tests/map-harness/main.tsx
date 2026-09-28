import React,{useState} from "react";
import{createRoot}from"react-dom/client";
import{DeliveryMapPicker,type MapLocation}from"../../src/components/DeliveryMapPicker";
import"./test.css";
const polygon=[{latitude:-21.365,longitude:-48.25},{latitude:-21.345,longitude:-48.24},{latitude:-21.345,longitude:-48.22},{latitude:-21.365,longitude:-48.22}];
function Harness(){const[p,setP]=useState<MapLocation|null>({latitude:-21.36,longitude:-48.23});return <main><section data-testid="point"><DeliveryMapPicker value={p} onChange={setP}/></section><section data-testid="polygon"><DeliveryMapPicker value={polygon[0]} onChange={()=>{}} polygon={polygon} mode="polygon" recenterOnValueChange={false}/></section></main>}
createRoot(document.getElementById("root")!).render(<Harness/>);