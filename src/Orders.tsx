import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PackageCheck, ShoppingCart } from 'lucide-react';
import { api, type Cart, type CartItem, type Group, type Order } from './api';
import { Boton, Etiqueta, Tarjeta } from './ui/piezas';
import { dateTime, Feedback, Field, Loading, number, PageTitle, statuses, Submit, submitData, useAction, useLoad } from './ui/common';
import { formatearSoles as money } from './shared/dinero';

export function ShoppingCartView() {
  const [refresh,setRefresh] = useState(0);
  const {data,error} = useLoad<Cart>('/buyer/cart',refresh);
  const action = useAction();
  const groups = new Map<string,CartItem[]>();
  for (const item of data?.items ?? []) {
    if (!groups.has(item.supplier_id)) groups.set(item.supplier_id,[]);
    groups.get(item.supplier_id)!.push(item);
  }
  const total = (data?.items ?? []).reduce((sum,item)=>sum+item.seen_price*item.quantity,0);
  const needsReview = (data?.items ?? []).some(item=>!item.available || item.seen_price!==item.price || item.seen_delivery!==item.delivery_hours);
  function update(item:CartItem,quantity:number) {
    void action.run(async()=>{
      await api('/buyer/cart',{id:item.id,quantity,price:item.price,delivery_hours:item.delivery_hours});
      setRefresh(n=>n+1);
    },quantity===0?'Producto retirado.':'Carrito actualizado.');
  }
  return <>
    <PageTitle title="Carrito">Un pedido agrupado. Cada proveedor hace su despacho.</PageTitle>
    <div className="row wrap list-heading">
      <Link className="text-link" to="/comparar">Seguir comparando</Link>
      {data?.items.length===0 && <Boton variante="secundario" disabled={action.busy} onClick={()=>void action.run(async()=>{
        await api('/buyer/example',{}); setRefresh(n=>n+1);
      },'Ejemplo agregado al carrito.')}>Cargar ejemplo de feria</Boton>}
    </div>
    <Feedback data={action.feedback} />
    {!data && <Loading error={error} />}
    {data?.items.length===0 && <Tarjeta className="panel empty"><ShoppingCart aria-hidden /><h2>Tu carrito está vacío</h2><p>Agrega productos desde el comparador o carga el ejemplo de la feria.</p></Tarjeta>}
    <div className="stack">{Array.from(groups,([supplier,items])=><Tarjeta className="panel stack" key={supplier}>
      <h2>{items[0].supplier}</h2>
      {items.map(item=>{
        const changed = item.seen_price!==item.price || item.seen_delivery!==item.delivery_hours;
        return <div key={item.id} className="cart-line">
          <div><h3>{item.product}</h3><p className="muted small">{item.pack} · {money(item.seen_price)} por unidad</p>
            {!item.available ? <Etiqueta tono="rojo">Oferta vencida o pausada</Etiqueta> : changed && <p className="small">Oferta actualizada · {money(item.price)} · entrega en {item.delivery_hours} h</p>}
          </div>
          <label className="field quantity-field"><span>Cantidad</span>
            <input type="number" inputMode="numeric" required min={1} max={99} defaultValue={item.quantity}
              disabled={!item.available || action.busy} onBlur={event=>{
                if (event.currentTarget.checkValidity() && Number(event.currentTarget.value)!==item.quantity) update(item,Number(event.currentTarget.value));
              }} /></label>
          <strong>{money(item.seen_price*item.quantity)}</strong>
          <div className="row wrap">
            {item.available===1 && changed && <Boton variante="secundario" disabled={action.busy} onClick={()=>update(item,item.quantity)}>Aceptar oferta actual</Boton>}
            <Boton variante="texto" disabled={action.busy} onClick={()=>update(item,0)}>Retirar</Boton>
          </div>
        </div>;
      })}
    </Tarjeta>)}</div>
    {!!data?.items.length && <Tarjeta className="panel row wrap between summary">
      <div><p className="muted">Total del comprador</p><strong>{money(total)}</strong></div>
      {needsReview ? <p className="small">Actualiza o retira las ofertas que cambiaron.</p> :
        <Boton a="/confirmar">Revisar pedido</Boton>}
    </Tarjeta>}
  </>;
}

export function Checkout() {
  const {data,error} = useLoad<Cart>('/buyer/cart');
  const action = useAction();
  const [key] = useState(()=>crypto.randomUUID());
  const navigate = useNavigate();
  if (!data) return <Loading error={error} />;
  const total = data.items.reduce((sum,item)=>sum+item.quantity*item.seen_price,0);
  const blocked = !data.items.length || data.items.some(item=>!item.available || item.price!==item.seen_price || item.delivery_hours!==item.seen_delivery);
  return <div className="narrow">
    <PageTitle title="Confirmar pedido">Revisa los precios y las cantidades antes del pago de prueba.</PageTitle>
    <Tarjeta className="panel stack">
      <ul className="split-list">{data.items.map(item=><li key={item.id}>
        <span>{item.quantity} × {item.product}<br/><span className="muted small">{item.supplier} · {item.seen_delivery} h</span></span>
        <strong>{money(item.quantity*item.seen_price)}</strong>
      </li>)}</ul>
      <div className="row between summary"><span>Total</span><strong>{money(total)}</strong></div>
      {blocked && <p role="alert">Vuelve al carrito para revisar los cambios.</p>}
      <Boton disabled={blocked || action.busy} onClick={()=>void action.run(async()=>{
        const order = await api<{id:number}>('/buyer/checkout',{key,version:data.version});
        navigate(`/pago/${order.id}`,{replace:true});
      })}>Confirmar pedido</Boton>
      <Feedback data={action.feedback} />
      <Link className="text-link" to="/carrito">Volver al carrito</Link>
    </Tarjeta>
  </div>;
}

export function Pay() {
  const {id} = useParams();
  const {data,error} = useLoad<Order[]>('/buyer/orders');
  const action = useAction();
  const navigate = useNavigate();
  if (!data) return <Loading error={error} />;
  const order = data.find(item=>item.id===Number(id));
  if (!order) return <p role="alert">Pedido no encontrado.</p>;
  return <div className="narrow">
    <PageTitle title="Pago de prueba">Pedido N.° {number(order.id)} · {order.groups.length} proveedores · un solo pago</PageTitle>
    <Tarjeta className="panel stack">
      <Etiqueta tono="mallki">Pasarela simulada</Etiqueta>
      <div className="row between summary"><span>Total</span><strong>{money(order.total)}</strong></div>
      <p className="muted">El pago es ficticio. No se solicitan datos de tarjeta.</p>
      {order.paid_at ? <Boton a={`/pedidos/${order.id}`}>Ver seguimiento</Boton> :
        <Boton disabled={action.busy} onClick={()=>void action.run(async()=>{
          await api(`/buyer/orders/${order.id}/pay`,{});
          navigate(`/pedidos/${order.id}`,{replace:true});
        })}>Simular pago</Boton>}
      <Feedback data={action.feedback} />
    </Tarjeta>
  </div>;
}

export function Orders() {
  const {id} = useParams();
  const [refresh,setRefresh] = useState(0);
  const {data,error} = useLoad<Order[]>('/buyer/orders',refresh);
  if (!data) return <Loading error={error} />;
  const selected = id ? data.find(order=>order.id===Number(id)) : null;
  if (id && !selected) return <p role="alert">Pedido no encontrado.</p>;
  if (selected) return <Tracking order={selected} onChange={()=>setRefresh(n=>n+1)} />;
  return <>
    <PageTitle title="Mis pedidos y reclamos">Consulta el pago y el despacho de cada proveedor.</PageTitle>
    {!data.length && <Tarjeta className="panel empty"><PackageCheck aria-hidden /><h2>Aún no tienes pedidos</h2><Boton a="/comparar">Comparar precios</Boton></Tarjeta>}
    <ul className="stack">{data.map(order=><li key={order.id}>
      <Tarjeta className="panel row wrap between">
        <div><h2>Pedido N.° {number(order.id)}</h2><p className="muted">{dateTime(order.created_at)} · {order.groups.length} proveedores</p></div>
        <strong>{money(order.total)}</strong>
        <Boton variante="secundario" a={`/pedidos/${order.id}`}>Ver pedido {number(order.id)}</Boton>
      </Tarjeta>
    </li>)}</ul>
  </>;
}

function Tracking({order,onChange}: {order:Order;onChange:()=>void}) {
  return <>
    <Link className="back" to="/pedidos">← Volver a mis pedidos</Link>
    <PageTitle title={`Pedido N.° ${number(order.id)}`}>{order.paid_at?'Pago de prueba confirmado':'Pendiente de pago'} · {order.groups.length} proveedores</PageTitle>
    <div className="stack">
      {order.groups.map(group=><Tarjeta className="panel stack" key={group.id}>
        <div className="row wrap between"><h2>{group.name}</h2><Etiqueta tono="mallki">{order.paid_at?statuses[group.status]:'Pendiente de pago'}</Etiqueta></div>
        <p className="muted">Entrega a cargo del proveedor · hasta {group.delivery_hours} h</p>
        <ul className="split-list">{group.items.map(item=><li key={item.id}><span>{item.quantity} × {item.product}</span><strong>{money(item.price*item.quantity)}</strong></li>)}</ul>
        {order.paid_at && <BuyerClaim order={order.id} group={group} onChange={onChange}/>}
      </Tarjeta>)}
      <Tarjeta className="panel stack">
        <h2>Cómo se reparte tu pago</h2>
        <ul className="split-list">
          <li><span>Total del comprador</span><strong>{money(order.total)}</strong></li>
          <li><span>Comisión retenida a proveedores · 2,5 %</span><strong>{money(order.commission)}</strong></li>
          <li><span>Liquidación neta a proveedores</span><strong>{money(order.total-order.commission)}</strong></li>
        </ul>
        {order.reference ? <p className="muted small">Referencia {order.reference}</p> : <Boton a={`/pago/${order.id}`}>Ir al pago de prueba</Boton>}
      </Tarjeta>
    </div>
  </>;
}

function BuyerClaim({order,group,onChange}: {order:number;group:Group;onChange:()=>void}) {
  const action = useAction();
  if (group.claim) return <div className="claim">
    <strong>{group.claim.closed_at?'Reclamo cerrado':'Reclamo abierto'}</strong>
    <p>{group.claim.description}</p>
    {group.claim.response && <p>Respuesta del proveedor: {group.claim.response}</p>}
  </div>;
  return <details className="claim">
    <summary>Abrir reclamo</summary>
    <form className="stack" onSubmit={event=>{
      const data = submitData(event);
      void action.run(async()=>{
        await api(`/buyer/orders/${order}/claim`,{supplier:group.id,description:data.get('description')});
        onChange();
      });
    }}>
      <p className="small muted">Plazo de atención del piloto · 48 h</p>
      <Field label="Describe el problema"><textarea name="description" minLength={5} maxLength={500} required /></Field>
      <Submit disabled={action.busy}>Registrar reclamo</Submit>
      <Feedback data={action.feedback} />
    </form>
  </details>;
}
