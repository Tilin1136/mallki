import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Search, ShoppingCart, Store, ClipboardList, Home } from 'lucide-react';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './styles.css';
import { api, type Account, type Role } from './api';
import { Access, BuyerHome } from './Buyer';
import { Compare, PriceAlerts } from './Compare';
import { Checkout, Orders, Pay, ShoppingCartView } from './Orders';
import { Settlements, SupplierCatalog } from './Supplier';
import { Dashboard } from './Dashboard';
import { Marca } from './ui/Marca';
import { Feedback, Loading, useAction, useLoad } from './ui/common';

const landing = { buyer:'/inicio', supplier:'/proveedor', admin:'/tablero' };
const nav = {
  buyer: [['/inicio','Inicio',Home],['/comparar','Comparador',Search],['/carrito','Carrito',ShoppingCart],['/pedidos','Mis pedidos',ClipboardList]],
  supplier: [['/proveedor','Catálogo',Store],['/liquidaciones','Liquidaciones',ClipboardList],['/comparar','Comparador',Search]],
  admin: [['/tablero','Tablero',LayoutDashboard],['/comparar','Comparador',Search]],
  guest: [['/comparar','Comparador',Search]],
} as const;

function Private({account,role,children}: {account:Account|null;role:Role;children:ReactNode}) {
  if (!account) return <Navigate to="/acceso" replace />;
  if (account.role!==role) return <Navigate to={landing[account.role]} replace />;
  return children;
}

function App() {
  const session = useLoad<{account:Account|null}>('/me');
  if (!session.data) return <main className="page"><Loading error={session.error}/></main>;
  return <Shell initialAccount={session.data.account} />;
}

function Shell({initialAccount}: {initialAccount:Account|null}) {
  const [account,setAccount] = useState(initialAccount);
  const action = useAction();
  const navigate = useNavigate();
  const location = useLocation();
  const home = account ? landing[account.role] : '/acceso';
  useEffect(()=>{ window.scrollTo(0,0); },[location.pathname,location.search]);
  return <div className="shell">
    <header className="site-header">
      <div className="topline">
        <Link className="brand" to={home}><Marca grande /><span>Abastecimiento gastronómico</span></Link>
        <div className="row top-actions">
          {account ? <>
            <span className="business">{account.business}</span>
            <button className="header-button" disabled={action.busy} onClick={()=>void action.run(async()=>{
              await api('/logout',{});setAccount(null);navigate('/acceso',{replace:true});
            })}>Cerrar sesión</button>
          </> : <Link className="header-button" to="/acceso">Iniciar sesión</Link>}
        </div>
      </div>
      <nav aria-label="Navegación principal" className="nav">
        {nav[account?.role ?? 'guest'].map(([path,label,Icon])=><NavLink key={path} to={path}>
          <Icon size={18} aria-hidden />{label}
        </NavLink>)}
      </nav>
    </header>
    <main className="page">
      <Feedback data={action.feedback} />
      <Routes>
        <Route path="/" element={<Navigate to={home} replace />} />
        <Route path="/acceso" element={account?<Navigate to={home} replace/>:<Access key="login" onLogin={setAccount} />} />
        <Route path="/registro" element={account?<Navigate to={home} replace/>:<Access key="register" register onLogin={setAccount} />} />
        <Route path="/inicio" element={<Private account={account} role="buyer">{account && <BuyerHome account={account} onAccount={setAccount} />}</Private>} />
        <Route path="/comparar" element={<Compare account={account}/>} />
        <Route path="/alertas" element={<PriceAlerts/>} />
        <Route path="/carrito" element={<Private account={account} role="buyer"><ShoppingCartView/></Private>} />
        <Route path="/confirmar" element={<Private account={account} role="buyer"><Checkout/></Private>} />
        <Route path="/pago/:id" element={<Private account={account} role="buyer"><Pay/></Private>} />
        <Route path="/pedidos" element={<Private account={account} role="buyer"><Orders/></Private>} />
        <Route path="/pedidos/:id" element={<Private account={account} role="buyer"><Orders/></Private>} />
        <Route path="/proveedor" element={<Private account={account} role="supplier"><SupplierCatalog/></Private>} />
        <Route path="/liquidaciones" element={<Private account={account} role="supplier"><Settlements/></Private>} />
        <Route path="/tablero" element={<Private account={account} role="admin"><Dashboard/></Private>} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </main>
    <footer className="site-footer">Prototipo Mallki · Datos ficticios · FIIS, Universidad Nacional de Ingeniería</footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(<HashRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><App/></HashRouter>);
