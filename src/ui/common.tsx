import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, type Product } from '../api';
import { Etiqueta } from './piezas';
import { Semaforo } from './Semaforo';

export const categories = { abarrotes:'Abarrotes secos', envases:'Envases y empaques' };
export const statuses = ['Preparando','Listo para despacho','En camino','Entregado'];
export const day = 86400;
export const number = (id: number) => String(id).padStart(4,'0');
export const shortDate = (t: number) => new Intl.DateTimeFormat('es-PE', {
  day:'2-digit', month:'2-digit', timeZone:'America/Lima',
}).format(t*1000);
export const dateTime = (t: number) => new Intl.DateTimeFormat('es-PE', {
  dateStyle:'short', timeStyle:'short', timeZone:'America/Lima',
}).format(t*1000);
export const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();
export const message = (error: unknown) => error instanceof Error ? error.message : 'Vuelve a intentar.';

export function useLoad<T>(path: string, refresh = 0): {data?:T;error?:string} {
  const [state, setState] = useState<{path:string; refresh:number; data?:T; error?:string}>();
  useEffect(() => {
    const controller = new AbortController();
    api<T>(path, undefined, controller.signal)
      .then(data => setState({path,refresh,data}))
      .catch(error => { if (!controller.signal.aborted) setState({path,refresh,error:message(error)}); });
    return () => controller.abort();
  }, [path,refresh]);
  return state?.path === path && state.refresh === refresh ? state : {};
}

export function useAction() {
  const [busy,setBusy] = useState(false);
  const [feedback,setFeedback] = useState<{text:string; failed:boolean}>();
  async function run(action: () => Promise<void>, success?: string) {
    setBusy(true);
    setFeedback(undefined);
    try {
      await action();
      if (success) setFeedback({text:success,failed:false});
    } catch (error) {
      setFeedback({text:message(error),failed:true});
    } finally { setBusy(false); }
  }
  return {busy,feedback,run};
}

export function Feedback({data}: {data?: {text:string; failed:boolean}}) {
  if (!data) return null;
  return <p role={data.failed ? 'alert' : 'status'} className={data.failed ? 'feedback error' : 'feedback'}>{data.text}</p>;
}

export function Loading({error}: {error?:string}) {
  return <p role={error ? 'alert' : 'status'} className={error ? 'feedback error' : 'muted'}>{error || 'Cargando…'}</p>;
}

export function PageTitle({title,children}: {title:string; children?:ReactNode}) {
  return <div className="page-title"><h1>{title}</h1>{children && <p className="muted">{children}</p>}</div>;
}

export function Field({label,children}: {label:string; children:ReactNode}) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function Submit({children,disabled}: {children:ReactNode;disabled?:boolean}) {
  return <button className="solid" type="submit" disabled={disabled}>{children}</button>;
}

export function submitData(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return new FormData(event.currentTarget);
}

export function Status({count}: {count:number}) {
  return <Semaforo color={count>=3?'verde':count===2?'ambar':'rojo'} etiqueta={`${count} ${count===1?'oferta':'ofertas'}`} />;
}

export function Validity({offer,now}: {offer:{confirmed_at:number|null;enabled:number};now:number}) {
  if (!offer.enabled) return <Etiqueta>Pausada</Etiqueta>;
  const remaining = offer.confirmed_at === null ? 0 : offer.confirmed_at + 7*day-now;
  if (remaining <= 0) return <Etiqueta tono="rojo">No disponible</Etiqueta>;
  if (remaining <= day) return <Etiqueta tono="ambar">vence mañana</Etiqueta>;
  return <Etiqueta tono="mallki">Vigente</Etiqueta>;
}

export function ProductOptions({products}: {products:Product[]}) {
  return <>{products.map(product => <option value={product.id} key={product.id}>{product.name} · {product.pack}</option>)}</>;
}
