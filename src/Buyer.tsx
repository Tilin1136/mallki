import { Link, useNavigate } from 'react-router-dom';
import { Search, ClipboardList, MessageCircle, ShoppingBasket } from 'lucide-react';
import { api, type Account, type Order } from './api';
import { Boton, Etiqueta, Tarjeta } from './ui/piezas';
import { Feedback, Field, Loading, PageTitle, Submit, number, submitData, useAction, useLoad } from './ui/common';
import { formatearSoles as money } from './shared/dinero';

export function Access({register,onLogin}: {register?:boolean;onLogin:(account:Account)=>void}) {
  const action = useAction();
  const navigate = useNavigate();
  return <div className="narrow">
    <PageTitle title={register?'Registra tu negocio':'Inicia sesión'}>Mallki · Proyecto académico de la Universidad Nacional de Ingeniería</PageTitle>
    <Tarjeta className="panel">
      <form className="stack" onSubmit={event => {
        const data = submitData(event);
        void action.run(async () => {
          const result = await api<{account:Account}>(register?'/register':'/login',{
            name:data.get('name'),business:data.get('business'),email:data.get('email'),password:data.get('password'),
            assistance:data.get('assistance')==='on',
          });
          onLogin(result.account);
          navigate(result.account.role==='supplier'?'/proveedor':result.account.role==='admin'?'/tablero':'/inicio',{replace:true});
        });
      }}>
        {register && <>
          <Field label="Tu nombre"><input name="name" required maxLength={80} autoComplete="name" /></Field>
          <Field label="Nombre del negocio"><input name="business" required maxLength={100} autoComplete="organization" /></Field>
        </>}
        <Field label="Correo"><input type="email" name="email" required maxLength={180} autoComplete="username" /></Field>
        <Field label="Contraseña"><input type="password" name="password" required minLength={8} maxLength={128} autoComplete={register?'new-password':'current-password'} /></Field>
        {register && <label className="check"><input type="checkbox" name="assistance" /> Prefiero que me ayuden por WhatsApp</label>}
        <Submit disabled={action.busy}>{register?'Crear cuenta de comprador':'Iniciar sesión'}</Submit>
        <Feedback data={action.feedback} />
      </form>
    </Tarjeta>
    <p className="access-link">{register?<Link to="/acceso">Ya tengo una cuenta</Link>:<Link to="/registro">Registrar un negocio comprador</Link>}</p>
    {register && <p className="muted small">Usa datos ficticios. La opción de WhatsApp guarda una preferencia para la demostración.</p>}
  </div>;
}

export function BuyerHome({account,onAccount}: {account:Account;onAccount:(account:Account)=>void}) {
  const {data,error} = useLoad<Order[]>('/buyer/orders');
  const action = useAction();
  return <>
    <section className="hero">
      <div><p>{account.business}</p><h1>Hola, {account.name.split(' ')[0]}</h1>
        <p>Encuentra abarrotes secos y envases para tu negocio en Lima Centro.</p>
        <Link className="hero-button" to="/comparar"><Search size={19} aria-hidden /> Comparar precios</Link>
      </div>
      <ShoppingBasket className="hero-icon" aria-hidden />
    </section>
    <div className="grid-two">
      <Tarjeta className="panel stack">
        <div className="row"><ClipboardList size={20} aria-hidden /><h2>Último pedido</h2></div>
        {data?.[0] ? <><p><strong>Pedido N.° {number(data[0].id)}</strong> · {money(data[0].total)}</p><Etiqueta>{data[0].paid_at?'Pagado · prueba':'Pendiente de pago'}</Etiqueta></> :
          data ? <p className="muted">Tus pedidos aparecerán aquí después de confirmar el carrito.</p> : <Loading error={error} />}
        <Boton a="/pedidos" variante="secundario">Mis pedidos y reclamos</Boton>
      </Tarjeta>
      <Tarjeta className="panel stack">
        <div className="row"><MessageCircle size={20} aria-hidden /><h2>Ayuda por WhatsApp</h2></div>
        <p className="muted">Preferencia de acompañamiento para el piloto. En la demo se registra en tu cuenta.</p>
        <Boton variante="secundario" disabled={action.busy} onClick={() => void action.run(async () => {
          await api('/buyer/assistance',{assistance:!account.assistance});
          onAccount({...account,assistance:!account.assistance});
        },'Preferencia guardada.')}>{account.assistance?'Quitar preferencia de ayuda':'Prefiero que me ayuden por WhatsApp'}</Boton>
        <Feedback data={action.feedback} />
      </Tarjeta>
    </div>
  </>;
}
