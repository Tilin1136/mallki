import { useState } from 'react';
import { api, type Dashboard as Indicators } from './api';
import { Boton, Etiqueta, Tarjeta } from './ui/piezas';
import { categories, dateTime, day, Feedback, Loading, number, PageTitle, Status, useAction, useLoad } from './ui/common';
import { formatearSoles as money } from './shared/dinero';

export function Dashboard() {
  const [refresh,setRefresh] = useState(0);
  const {data,error} = useLoad<Indicators>('/admin/dashboard',refresh);
  const action = useAction();
  if (!data) return <Loading error={error}/>;
  const green = data.coverage.filter(row=>row.offers>=3).length;
  const total = data.coverage.length;
  const coverage = total ? 100*green/total : 0;
  return <>
    <PageTitle title="Tablero del piloto">Lima Centro · Metas a seis meses · Datos ficticios</PageTitle>
    <div className="metrics">
      <Metric title="Compradores activos" actual={String(data.buyers)} target="200" progress={data.buyers/200} definition="Con al menos un pedido registrado en los últimos 30 días." />
      <Metric title="Proveedores activos" actual={String(data.suppliers)} target="50" progress={data.suppliers/50} definition="Con catálogo vigente y al menos un pedido registrado en los últimos 30 días." />
      <Metric title="Cobertura del comparador" actual={`${Math.round(coverage)} %`} target="70 %" progress={coverage/70} definition={`${green} de ${total} productos ancla tienen tres o más ofertas vigentes de proveedores distintos.`} />
    </div>
    <div className="grid-two">
      <Tarjeta className="panel stack">
        <h2>Ventas del mes</h2><p className="metric-value">{money(data.sales)}</p>
        <p className="muted">Comisión del mes · {money(data.commission)}</p>
      </Tarjeta>
      <Tarjeta className="panel stack">
        <h2>Ofertas por vencer en 48 h</h2>
        {data.expiring.length ? <ul className="split-list">{data.expiring.map(offer=><li key={offer.id}><span>{offer.product}<br/><span className="muted small">{offer.supplier}</span></span><Etiqueta tono="ambar">{dateTime(offer.confirmed_at+7*day)}</Etiqueta></li>)}</ul> : <p className="muted">No hay ofertas próximas a vencer.</p>}
      </Tarjeta>
    </div>
    <Tarjeta className="panel stack">
      <h2>Semáforo de cobertura</h2>
      <p className="muted">{green} con al menos 3 ofertas · {data.coverage.filter(row=>row.offers===2).length} con 2 · {data.coverage.filter(row=>row.offers<2).length} con 0 o 1</p>
      <div className="grid-two">{Object.entries(categories).map(([category,title])=><section key={category} className="stack">
        <h3>{title}</h3><ul className="split-list">{data.coverage.filter(row=>row.category===category).map(row=>
          <li key={row.id}><span>{row.name}</span><Status count={row.offers}/></li>
        )}</ul>
      </section>)}</div>
    </Tarjeta>
    <Tarjeta className="panel stack">
      <h2>Reclamos</h2>
      <Feedback data={action.feedback}/>
      {!data.claims.length && <p className="muted">No hay reclamos registrados.</p>}
      {data.claims.map(claim=><div key={claim.id} className="claim stack">
        <div className="row wrap between"><strong>Pedido N.° {number(claim.order_id)} · {claim.supplier}</strong>
          <Etiqueta tono={claim.closed_at?'mallki':data.now-claim.opened_at>2*day?'rojo':'ambar'}>{claim.closed_at?'Cerrado':data.now-claim.opened_at>2*day?'Fuera de 48 h':'Abierto'}</Etiqueta>
        </div>
        <p>{claim.description}</p>
        {claim.response && <p>Descargo: {claim.response}</p>}
        {!claim.closed_at && <Boton variante="secundario" disabled={action.busy} onClick={()=>void action.run(async()=>{
          await api(`/admin/claims/${claim.id}/close`,{});setRefresh(n=>n+1);
        },'Reclamo cerrado.')}>Cerrar reclamo</Boton>}
      </div>)}
    </Tarjeta>
  </>;
}

function Metric({title,actual,target,progress,definition}: {title:string;actual:string;target:string;progress:number;definition:string}) {
  return <Tarjeta className="panel metric stack">
    <h2>{title}</h2><p className="metric-value">{actual}</p><p className="small"><strong>Meta {target}</strong></p>
    <progress aria-label={`Progreso de ${title.toLowerCase()}`} value={Math.min(progress,1)} max={1}/>
    <p className="muted small">{definition}</p>
  </Tarjeta>;
}
