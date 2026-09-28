import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DeliveryMapPicker, type MapLocation } from "@/components/DeliveryMapPicker";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/area-entrega")({ component: DeliveryAreaPage });

type DeliveryArea = { id:number; name:string; polygon:MapLocation[]; is_active:boolean; updated_at:string };

function DeliveryAreaPage(){
  const qc=useQueryClient();
  const [points,setPoints]=useState<MapLocation[] | null>(null);
  const [saving,setSaving]=useState(false);
  const areas=useQuery({queryKey:["admin","delivery-areas"],queryFn:async()=>{
    const {data,error}=await supabase.from("delivery_areas" as never).select("id,name,polygon,is_active,updated_at").eq("is_active",true).order("updated_at",{ascending:false});
    if(error) throw error;
    return (data??[]) as DeliveryArea[];
  }});
  const current=areas.data?.[0];
  useEffect(()=>{ if(current && points===null) setPoints(current.polygon); },[current,points]);
  const draft=points??[];
  const add=(point:MapLocation)=>setPoints(currentPoints=>[...(currentPoints??[]),point]);
  const removeLast=()=>setPoints(currentPoints=>(currentPoints??[]).slice(0,-1));
  const clear=()=>setPoints([]);
  const save=async()=>{
    if(draft.length<3){toast.error("A área precisa de pelo menos 3 pontos.");return;}
    if(!confirm("Salvar esta área de cobertura? Endereços dentro dela poderão ser liberados automaticamente."))return;
    setSaving(true);
    try{
      const {error}=await supabase.rpc("admin_save_delivery_area" as never,{p_id:current?.id??null,p_name:current?.name??"Área urbana de Guariba",p_polygon:draft} as never);if(error)throw error;
      setPoints(null);await qc.invalidateQueries({queryKey:["admin","delivery-areas"]});toast.success("Área de cobertura salva.");
    }catch{toast.error("Não foi possível salvar. A migração de área de entrega precisa estar implantada.");}finally{setSaving(false);}
  };
  return <main className="space-y-4 p-4">
    <div><h1 className="text-xl font-bold">Área de entrega</h1><p className="text-sm text-muted-foreground">Monte o contorno da área urbana tocando no mapa em sequência. Não inclua zona rural. Para loteamentos novos, amplie o contorno quando necessário.</p></div>
    {areas.error&&<p className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">Configuração ainda não disponível no banco. Não execute alterações em produção até a migração ser revisada.</p>}
    <DeliveryMapPicker value={draft.at(-1)??null} onChange={add} polygon={draft} mode="polygon"/>
    <section className="surface-card space-y-2 p-4"><p className="text-sm font-semibold">Vértices: {draft.length}</p><p className="text-xs text-muted-foreground">{draft.length<3?"Adicione pelo menos 3 pontos para formar a área.":"O último ponto é ligado automaticamente ao primeiro no cálculo do servidor."}</p>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={removeLast} disabled={!draft.length} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">Remover último</button><button type="button" onClick={clear} disabled={!draft.length} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">Limpar desenho</button><button type="button" onClick={()=>void save()} disabled={saving||draft.length<3} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{saving?"Salvando...":"Salvar área"}</button></div>
    </section>
    {current&&<p className="text-xs text-muted-foreground">Existe uma área ativa salva. Ao adicionar um novo ponto, você começa a editar a configuração atual.</p>}
  </main>;
}
