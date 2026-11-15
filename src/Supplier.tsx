import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Catalog, type Offer, type Order } from './api';
import { Boton, Etiqueta, Tarjeta } from './ui/piezas';
import { dateTime, Feedback, Field, Loading, number, PageTitle, ProductOptions, statuses, Submit, submitData, useAction, useLoad, Validity } from './ui/common';
import { formatearSoles as money } from './shared/dinero';

export function SupplierCatalog() {
  const [refresh,setRefresh] = useState(0);
  const [edit,setEdit] = useState<Offer|null|undefined>(undefined);
  const {data,error} = useLoad<Catalog>('/supplier/catalog',refresh);
  const action = useAction();
  const reload = () => setRefresh(n=>n+1);
  if (!data) return <><PageTitle title="Catálogo y precios" /><Loading error={error} /></>;
  return <>
    <PageTitle title="Catálogo y precios">Cada confirmación renueva la vigencia de la oferta por 7 días.</PageTitle>
    <div className="row wrap list-heading">
      <Boton onClick={()=>setEdit(null)}>Publicar oferta</Boton>
      <Link className="text-link" to="/liquidaciones">Ver liquidaciones</Link>
    </div>
    <Feedback data={action.feedback} />
    {edit!==undefined && <Tarjeta className="panel">
      <form className="stack" key={edit?.id ?? 'new'} onSubmit={event=>{
        const form = submitData(event);
        void action.run(async()=>{
          const raw = String(form.get('price')).trim().replace(',','.');
          if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error('Ingresa un precio con hasta dos decimales.');
          await api('/supplier/catalog',{
            product_id:Number(form.get('product_id')),price:Math.round(Number(raw)*100),delivery_hours:Number(form.get('hours')),
          });
          setEdit(undefined); reload();
        },'Oferta publicada y confirmada por 7 días.');
      }}>
        <h2>{edit?'Editar oferta':'Publicar oferta'}</h2>
        {edit ? <p>{edit.product} · {edit.pack}<input type="hidden" name="product_id" value={edit.product_id} /></p> :
          <Field label="Producto"><select name="product_id" required defaultValue=""><option value="" disabled>Elige un producto</option><ProductOptions products={data.products}/></select></Field>}
        <div className="grid-two">
          <Field label="Precio con IGV (S/)"><input name="price" inputMode="decimal" required maxLength={10} defaultValue={edit ? (edit.price/100).toFixed(2) : ''} /></Field>
          <Field label="Plazo de entrega (horas)"><input name="hours" type="number" inputMode="numeric" min={1} max={336} required defaultValue={edit?.delivery_hours ?? 24} /></Field>
        </div>
        <div className="row wrap"><Submit disabled={action.busy}>Guardar y confirmar precio</Submit><Boton variante="texto" onClick={()=>setEdit(undefined)}>Cancelar</Boton></div>
      </form>
    </Tarjeta>}
    <ul className="stack supplier-list">
      {data.offers.map(offer=><li key={offer.id}>
        <Tarjeta className="panel supplier-row">
          <div><h2>{offer.product}</h2><p className="muted small">{offer.pack}</p></div>
          <div><strong>{money(offer.price)}</strong><p className="muted small">Entrega en {offer.delivery_hours} h</p></div>
          <div><Validity offer={offer} now={data.now}/>{offer.confirmed_at && <p className="muted small">Confirmado {dateTime(offer.confirmed_at)}</p>}</div>
          <div className="row wrap">
            <Boton variante="secundario" disabled={action.busy} onClick={()=>void action.run(async()=>{
              await api(`/supplier/catalog/${offer.id}/confirm`,{}); reload();
            },`Precio de ${offer.product} confirmado por 7 días.`)}>Confirmar precio</Boton>
            <Boton variante="texto" onClick={()=>{setEdit(offer);window.scrollTo({top:0});}}>Editar</Boton>
            {offer.enabled===1 && <Boton variante="texto" disabled={action.busy} onClick={()=>void action.run(async()=>{
              await api(`/supplier/catalog/${offer.id}/pause`,{}); reload();
            },'Oferta pausada.')}>Pausar</Boton>}
          </div>
        </Tarjeta>
      </li>)}
    </ul>
    {!data.offers.length && <p className="muted">Publica tu primera oferta para aparecer en el comparador.</p>}
  </>;
}

export function Settlements() {
  const [refresh,setRefresh] = useState(0);
  const {data,error} = useLoad<Order[]>('/supplier/settlements',refresh);
  const action = useAction();
  return <>
    <PageTitle title="Liquidaciones">Consulta tus ventas de prueba, la comisión de 2,5 % y el despacho a tu cargo.</PageTitle>
    <Feedback data={action.feedback}/>
    {!data ? <Loading error={error}/> : !data.length && <Tarjeta className="panel empty"><h2>Aún no hay ventas pagadas</h2><p>Las liquidaciones aparecerán al confirmar el pago de prueba.</p></Tarjeta>}
    <ul className="stack">{data?.map(order=>{
      const group = order.groups[0];
      return <li key={order.id}><Tarjeta className="panel stack">
        <div className="row wrap between"><div><h2>Pedido N.° {number(order.id)}</h2><p className="muted">{order.buyer}</p></div><Etiqueta tono="mallki">{statuses[group.status]}</Etiqueta></div>
        <ul className="split-list">{group.items.map(item=><li key={item.id}><span>{item.quantity} × {item.product}</span><strong>{money(item.quantity*item.price)}</strong></li>)}</ul>
        <dl className="amounts"><div><dt>Venta</dt><dd>{money(group.subtotal)}</dd></div><div><dt>Comisión · 2,5 %</dt><dd>{money(group.commission)}</dd></div><div><dt>Liquidación neta</dt><dd>{money(group.net)}</dd></div></dl>
        {group.claim && !group.claim.closed_at && <p><Etiqueta tono="ambar">Liquidación retenida por reclamo</Etiqueta></p>}
        {group.status<3 && <Boton variante="secundario" disabled={action.busy} onClick={()=>void action.run(async()=>{
          await api(`/supplier/orders/${order.id}/status`,{status:group.status+1});setRefresh(n=>n+1);
        },'Estado de despacho actualizado.')}>Marcar como {statuses[group.status+1].toLowerCase()}</Boton>}
        {group.claim && <div className="claim stack">
          <strong>{group.claim.closed_at?'Reclamo cerrado':'Reclamo abierto'}</strong><p>{group.claim.description}</p>
          {group.claim.response && <p>Respuesta: {group.claim.response}</p>}
          {!group.claim.closed_at && <form className="stack" onSubmit={event=>{
            const form = submitData(event);
            void action.run(async()=>{
              await api(`/supplier/orders/${order.id}/claim`,{response:form.get('response')});setRefresh(n=>n+1);
            },'Respuesta guardada.');
          }}>
            <Field label="Descargo del proveedor"><textarea name="response" required minLength={5} maxLength={500} defaultValue={group.claim.response??''} /></Field>
            <Submit disabled={action.busy}>Enviar descargo</Submit>
          </form>}
        </div>}
      </Tarjeta></li>;
    })}</ul>
  </>;
}
