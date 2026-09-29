export type ReceiptWidth="58"|"80";export type PaymentBridge="manual"|"stone_tef";
export type PosTerminalSettings={terminalName:string;receiptWidth:ReceiptWidth;autoPrint:boolean;scannerEnabled:boolean;scannerSuffix:"enter";paymentBridge:PaymentBridge};
const KEY="saidera:pdv:terminal:v1";
export const DEFAULT_POS_SETTINGS:PosTerminalSettings={terminalName:"Caixa 1",receiptWidth:"80",autoPrint:false,scannerEnabled:true,scannerSuffix:"enter",paymentBridge:"manual"};
export function loadPosSettings():PosTerminalSettings{if(typeof window==="undefined")return DEFAULT_POS_SETTINGS;try{return{...DEFAULT_POS_SETTINGS,...JSON.parse(localStorage.getItem(KEY)??"{}")}}catch{return DEFAULT_POS_SETTINGS}}
export function savePosSettings(v:PosTerminalSettings){localStorage.setItem(KEY,JSON.stringify(v));window.dispatchEvent(new CustomEvent("saidera:pos-settings",{detail:v}))}
