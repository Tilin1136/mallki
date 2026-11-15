import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Info, Search, Star, Minus, Plus, ArrowLeft } from 'lucide-react';
import { api, type Account, type Catalog, type Offer } from './api';
import { Boton, Etiqueta, Tarjeta } from './ui/piezas';
import { categories, Feedback, Loading, normalize, PageTitle, shortDate, Status, useAction, useLoad, Validity } from './ui/common';
import { formatearSoles as money } from './shared/dinero';
import { AVISO_CAMBIO_CRITERIOS_H, MAX_OFERTAS_POR_SKU, VIGENCIA_DIAS } from './shared/reglas';

export function Compare({account}: {account:Account|null}) {
  const {data,error} = useLoad<Catalog>('/catalog');
  const [params,setParams] = useSearchParams();
  const [query,setQuery] = useState('');
  const [category,setCategory] = useState('');
  const [eco,setEco] = useState(false);
  if (!data) return <Loading error={error} />;
  const selected = data.products.find(product => product.id === Number(params.get('producto')));
  if (selected) return <ProductCompare key={selected.id} id={selected.id} data={data} account={account} />;
  const visible = data.products.filter(product =>
    normalize(`${product.name} ${product.pack}`).includes(normalize(query))
    && (!category || product.category===category) && (!eco || !!product.eco));
  return <>
    <PageTitle title="Comparar precios">Abarrotes secos y envases y empaques · Lima Centro</PageTitle>
    <Tarjeta className="panel filters">
      <label className="search"><Search size={20} aria-hidden /><input type="search" aria-label="Buscar producto" placeholder="Busca aceite, arroz, envases…" value={query} onChange={e=>setQuery(e.target.value)} /></label>
      <label className="field"><span>Categoría</span><select value={category} onChange={e=>setCategory(e.target.value)}>
        <option value="">Todas las categorías</option>
        {Object.entries(categories).map(([value,name])=><option key={value} value={value}>{name}</option>)}
      </select></label>
      <label className="check"><input type="checkbox" checked={eco} onChange={e=>setEco(e.target.checked)} /> Opciones ecológicas sin tecnopor</label>
    </Tarjeta>
    <div className="row wrap list-heading"><h2>Productos del piloto</h2><Link className="text-link" to="/alertas">Ver alertas de precio</Link></div>
    {visible.length===0 && <p className="muted">No se encontraron productos. Prueba otra búsqueda.</p>}
    <ul className="product-grid">{visible.map(product => {
      const offers = data.offers.filter(offer => offer.product_id===product.id);
      return <li key={product.id}><Tarjeta className="panel product-card">
        <div><h3>{product.name}</h3><p className="muted">{product.pack}</p>
        {product.eco===1 && <Etiqueta tono="mallki">Opción ecológica</Etiqueta>}</div>
        <div className="row wrap small">
          <Status count={offers.length} />
          {offers[0] && <strong>Desde {money(offers[0].price)}</strong>}
        </div>
        <Boton variante="secundario" onClick={()=>setParams({producto:String(product.id)})}>Ver ofertas</Boton>
      </Tarjeta></li>;
    })}</ul>
  </>;
}

function ProductCompare({id,data,account}: {id:number;data:Catalog;account:Account|null}) {
  const product = data.products.find(item => item.id===id)!;
  const offers = data.offers.filter(offer => offer.product_id===id);
  const [quantity,setQuantity] = useState(1);
  const action = useAction();
  return <div className="comparison">
    <Link to="/comparar" className="back"><ArrowLeft size={18} aria-hidden /> Volver a productos</Link>
    <PageTitle title={product.name}>{product.pack}</PageTitle>
    <div className="row wrap comparison-meta"><Status count={offers.length} /><span className="muted">Precio de menor a mayor · con IGV</span></div>
    <details className="criteria">
      <summary><Info size={18} aria-hidden /> ¿Cómo ordenamos?</summary>
      <p>Ordenamos por precio. Si hay empate, primero va el menor plazo de entrega y luego la confirmación más reciente. El pago de un proveedor jamás altera el orden. Los cambios de criterio se avisan con {AVISO_CAMBIO_CRITERIOS_H} horas de anticipación.</p>
      <p>Mostramos hasta {MAX_OFERTAS_POR_SKU} ofertas confirmadas durante los últimos {VIGENCIA_DIAS} días.</p>
    </details>
    {account?.role==='buyer' && <Tarjeta className="panel row between qty">
      <strong>Cantidad</strong><span className="row">
        <button className="icon-button" aria-label="Menos" onClick={()=>setQuantity(n=>Math.max(1,n-1))}><Minus size={19} aria-hidden /></button>
        <output aria-live="polite">{quantity}</output>
        <button className="icon-button" aria-label="Más" onClick={()=>setQuantity(n=>Math.min(99,n+1))}><Plus size={19} aria-hidden /></button>
      </span>
    </Tarjeta>}
    {offers.length===0 && <p className="muted">Este producto aún no tiene ofertas vigentes.</p>}
    <Feedback data={action.feedback} />
    <ol className="stack">
      {offers.slice(0,MAX_OFERTAS_POR_SKU).map(offer => <li key={offer.id}>
        <OfferCard offer={offer} now={data.now}>
          {account?.role==='buyer' ? <Boton variante="secundario" disabled={action.busy} onClick={()=>void action.run(async()=>{
            await api('/buyer/cart',{id:offer.id,quantity,price:offer.price,delivery_hours:offer.delivery_hours,add:true});
          },'Oferta agregada al carrito.')}>Agregar al pedido</Boton> : !account && <Boton a="/acceso" variante="secundario">Inicia sesión para comprar</Boton>}
        </OfferCard>
      </li>)}
    </ol>
    {account?.role==='buyer' && <Link className="solid fit" to="/carrito">Ver carrito</Link>}
  </div>;
}

function OfferCard({offer,now,children}: {offer:Offer;now:number;children:React.ReactNode}) {
  return <Tarjeta className="panel offer">
    <div className="offer-info">
      <h3>{offer.supplier}</h3>
      <p className="row wrap muted small">Entrega en {offer.delivery_hours} h <span className="row"><Star size={15} aria-hidden /> {offer.rating/10}</span></p>
    </div>
    <strong className="offer-price">{money(offer.price)}</strong>
    <div className="row wrap muted small">
      {offer.confirmed_at && <span>Confirmado {shortDate(offer.confirmed_at)}</span>}
      <Validity offer={offer} now={now} />
    </div>
    <div className="offer-action">{children}</div>
  </Tarjeta>;
}

export function PriceAlerts() {
  const {data,error} = useLoad<Catalog>('/catalog');
  if (!data) return <Loading error={error} />;
  return <div className="comparison">
    <PageTitle title="Alertas de precio">Subidas registradas en ofertas vigentes y alternativas de otros proveedores.</PageTitle>
    {!data.changes.length && <p className="muted">No hay subidas en las ofertas vigentes.</p>}
    <div className="stack">{data.changes.map(change=>{
      const offer = data.offers.find(item=>item.id===change.offer_id)!;
      const alternatives = data.offers.filter(item=>item.product_id===offer.product_id && item.supplier_id!==offer.supplier_id);
      const variation = (change.new_price-change.old_price)*100/change.old_price;
      return <Tarjeta key={offer.id} className="panel stack">
        <div className="row wrap between"><h2>{offer.product}</h2><Etiqueta tono="ambar">Subió {new Intl.NumberFormat('es-PE',{maximumFractionDigits:1}).format(variation)} %</Etiqueta></div>
        <p>{offer.supplier} · {money(change.old_price)} → <strong>{money(change.new_price)}</strong></p>
        <h3>Alternativas vigentes</h3>
        {alternatives.length ? <ul className="split-list">{alternatives.map(item=><li key={item.id}><span>{item.supplier}</span><strong>{money(item.price)}</strong></li>)}</ul> : <p className="muted">Aún no hay otra oferta vigente.</p>}
        <Boton a={`/comparar?producto=${offer.product_id}`} variante="secundario">Comparar ofertas</Boton>
      </Tarjeta>;
    })}</div>
  </div>;
}
