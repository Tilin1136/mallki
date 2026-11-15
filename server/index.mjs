import { cookie, consumeAuthAttempt, createSession, digest, getAccount, passwordHash, passwordMatches, publicAccount, sessionToken } from './auth.mjs';
import { all, cart, catalog, dashboard, freshness, orders, valid } from './store.mjs';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const need = (condition, status, message) => {
  if (!condition) throw new HttpError(status, message);
};
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const json = (data, status = 200, session = null) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(session ? {'Set-Cookie':session} : {}) },
});
const requireRole = (account, role) => {
  need(account, 401, 'Inicia sesión para continuar.');
  need(account.role === role, 403, 'Esta acción requiere otro rol.');
};
const record = (db, sql, ...params) => db.prepare(sql).bind(...params);

async function authenticate(db, request, env, path, body, now) {
  need(await consumeAuthAttempt(db,request,now),429,'Hay varios intentos recientes. Vuelve a intentar en unos minutos.');
  const email = text(body.email, 180).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  need(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && password.length >= 8 && password.length <= 128,
    400, 'Ingresa un correo válido y una contraseña de 8 a 128 caracteres.');
  let account = await record(db,'SELECT * FROM accounts WHERE email=?',email).first();
  if (path === '/register') {
    need(!account,409,'Este correo ya tiene una cuenta.');
    const name = text(body.name, 80);
    const business = text(body.business, 100);
    need(name.length >= 2 && business.length >= 2,400,'Completa el nombre y el negocio.');
    account = { id: crypto.randomUUID(), name, business, role:'buyer', assistance: body.assistance === true ? 1 : 0 };
    const hash = await passwordHash(password,env.AUTH_PEPPER);
    const result = await record(db,`INSERT INTO accounts(id,email,name,business,role,password_hash,assistance)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING`,account.id,email,name,business,'buyer',hash,account.assistance).run();
    need(result.meta.changes,409,'Este correo ya tiene una cuenta.');
  } else {
    const fakeHash = `${'0'.repeat(32)}:${'0'.repeat(64)}`;
    const matches = await passwordMatches(password,env.AUTH_PEPPER,account?.password_hash ?? fakeHash);
    need(account && matches,401,'El correo o la contraseña son incorrectos.');
  }
  return json({ account: publicAccount(account) },200,await createSession(db,request,account,now));
}

async function buyerRoute(db, account, method, path, body, now) {
  requireRole(account,'buyer');
  if (method === 'GET' && path === '/buyer/orders') return json(await orders(db,account));
  if (method === 'GET' && path === '/buyer/cart') return json(await cart(db,account.id,now));
  if (method === 'POST' && path === '/buyer/assistance') {
    await record(db,'UPDATE accounts SET assistance=? WHERE id=?',body.assistance === true ? 1 : 0,account.id).run();
    return json({ ok:true });
  }
  if (method === 'POST' && path === '/buyer/cart') {
    const offer = text(body.id, 100);
    const qty = body.quantity;
    need(offer && integer(qty,0,99),400,'Ingresa una cantidad entre 1 y 99.');
    if (qty === 0) {
      await record(db,'DELETE FROM cart_items WHERE buyer_id=? AND offer_id=?',account.id,offer).run();
    } else {
      const quantity = body.add === true ? 'MIN(cart_items.quantity+excluded.quantity,99)' : 'excluded.quantity';
      const result = await record(db,`INSERT INTO cart_items(buyer_id,offer_id,quantity,seen_price,seen_delivery)
        SELECT ?,o.id,?,o.price,o.delivery_hours FROM offers o JOIN suppliers s ON s.id=o.supplier_id
        WHERE o.id=? AND ${valid} AND o.price=? AND o.delivery_hours=?
        ON CONFLICT(buyer_id,offer_id) DO UPDATE SET quantity=${quantity},seen_price=excluded.seen_price,seen_delivery=excluded.seen_delivery`,
      account.id,qty,offer,...freshness(now),body.price ?? -1,body.delivery_hours ?? -1).run();
      need(result.meta.changes,409,'La oferta cambió o venció. Revisa el precio y el plazo actual.');
    }
    return json(await cart(db,account.id,now));
  }
  if (method === 'POST' && path === '/buyer/example') {
    const added = await record(db,`INSERT INTO cart_items(buyer_id,offer_id,quantity,seen_price,seen_delivery)
      SELECT ?,o.id,CASE o.id WHEN 'aceite-qhapaq' THEN 2 WHEN 'taper-pacha' THEN 4 ELSE 1 END,o.price,o.delivery_hours
      FROM offers o JOIN suppliers s ON s.id=o.supplier_id
      WHERE o.id IN ('aceite-qhapaq','arroz-inti','taper-pacha') AND ${valid}
      AND 3=(SELECT COUNT(*) FROM offers o JOIN suppliers s ON s.id=o.supplier_id
        WHERE o.id IN ('aceite-qhapaq','arroz-inti','taper-pacha') AND ${valid})
      ON CONFLICT(buyer_id,offer_id) DO UPDATE SET quantity=excluded.quantity,seen_price=excluded.seen_price,seen_delivery=excluded.seen_delivery
      RETURNING offer_id`,account.id,...freshness(now),...freshness(now)).all();
    need(added.results.length === 3,409,'Una oferta del ejemplo venció. Confirma el precio desde la cuenta del proveedor.');
    return json(await cart(db,account.id,now));
  }
  if (method === 'POST' && path === '/buyer/checkout') {
    const key = text(body.key, 80);
    need(key && integer(body.version,0,Number.MAX_SAFE_INTEGER),400,'El carrito necesita actualizarse.');
    const findOrder = () => record(db,'SELECT id FROM orders WHERE buyer_id=? AND checkout_key=?',account.id,key).first();
    const previous = await findOrder();
    if (previous) return json(previous);
    try {
      const order = await record(db,`INSERT INTO orders(buyer_id,created_at,checkout_key,cart_version)
        VALUES(?,?,?,?) RETURNING id`,account.id,now,key,body.version).first();
      return json(order,201);
    } catch (error) {
      const existing = await findOrder();
      if (existing) return json(existing);
      if (/cart_(offer|version)_changed|empty_cart/.test(error.message)) {
        throw new HttpError(409,'El carrito cambió. Revisa las ofertas y vuelve a confirmar.');
      }
      throw error;
    }
  }
  const action = path.match(/^\/buyer\/orders\/(\d+)\/(pay|claim)$/);
  if (method === 'POST' && action) {
    const id = Number(action[1]);
    const owned = await record(db,'SELECT id FROM orders WHERE id=? AND buyer_id=?',id,account.id).first();
    need(owned,404,'No se encontró ese pedido.');
    if (action[2] === 'pay') {
      await record(db,`INSERT INTO payments(order_id,amount,paid_at,reference)
        SELECT order_id,SUM(unit_price*quantity),?,? FROM order_items WHERE order_id=? GROUP BY order_id
        ON CONFLICT(order_id) DO NOTHING`,now,`DEMO-${id}-${crypto.randomUUID().slice(0,8)}`,id).run();
      return json(await record(db,'SELECT reference,amount,paid_at FROM payments WHERE order_id=?',id).first());
    }
    const description = text(body.description,500);
    need(description.length >= 5,400,'Describe el problema en al menos cinco caracteres.');
    const result = await record(db,`INSERT INTO claims(id,order_id,supplier_id,description,opened_at)
      SELECT ?,g.order_id,g.supplier_id,?,? FROM order_suppliers g JOIN payments p ON p.order_id=g.order_id
      WHERE g.order_id=? AND g.supplier_id=? ON CONFLICT(order_id,supplier_id) DO NOTHING`,
    crypto.randomUUID(),description,now,id,text(body.supplier,80)).run();
    need(result.meta.changes,409,'El reclamo ya existe o el pedido aún no está pagado.');
    return json({ ok:true });
  }
  throw new HttpError(404,'Ruta no disponible.');
}

async function supplierRoute(db, account, method, path, body, now) {
  requireRole(account,'supplier');
  const supplier = await record(db,'SELECT * FROM suppliers WHERE account_id=? AND enabled=1',account.id).first();
  need(supplier,403,'El perfil del proveedor no está habilitado.');
  if (method === 'GET' && path === '/supplier/catalog') {
    const [products, offers] = await db.batch([
      record(db,'SELECT * FROM products WHERE category=? ORDER BY id',supplier.category),
      record(db,`SELECT o.*,p.name AS product,p.pack,p.eco FROM offers o
        JOIN products p ON p.id=o.product_id WHERE supplier_id=? ORDER BY product_id`,supplier.id),
    ]);
    return json({ products:products.results, offers:offers.results, now });
  }
  if (method === 'GET' && path === '/supplier/settlements') return json(await orders(db,account,supplier.id));
  if (method === 'POST' && path === '/supplier/catalog') {
    need(integer(body.product_id,1,24) && integer(body.price,1,10000000) && integer(body.delivery_hours,1,336),
      400,'Revisa el producto, el precio y el plazo de entrega.');
    const id = `producto-${body.product_id}-${supplier.id}`;
    const result = await record(db,`INSERT INTO offers(id,supplier_id,product_id,price,delivery_hours,confirmed_at,enabled)
      SELECT ?,?,id,?,?,?,1 FROM products WHERE id=? AND category=?
      ON CONFLICT(supplier_id,product_id) DO UPDATE SET price=excluded.price,delivery_hours=excluded.delivery_hours,
      confirmed_at=excluded.confirmed_at,enabled=1`,id,supplier.id,body.price,body.delivery_hours,now,body.product_id,supplier.category).run();
    need(result.meta.changes,400,'El producto no pertenece a la categoría del proveedor.');
    return json({ ok:true });
  }
  const offer = path.match(/^\/supplier\/catalog\/([\w-]+)\/(confirm|pause)$/);
  if (method === 'POST' && offer) {
    const result = offer[2] === 'confirm'
      ? await record(db,'UPDATE offers SET confirmed_at=?,enabled=1 WHERE id=? AND supplier_id=?',now,offer[1],supplier.id).run()
      : await record(db,'UPDATE offers SET enabled=0 WHERE id=? AND supplier_id=?',offer[1],supplier.id).run();
    need(result.meta.changes,404,'No se encontró esa oferta.');
    return json({ ok:true });
  }
  const group = path.match(/^\/supplier\/orders\/(\d+)\/(status|claim)$/);
  if (method === 'POST' && group) {
    const orderId = Number(group[1]);
    if (group[2] === 'status') {
      need(integer(body.status,1,3),400,'Estado de despacho no válido.');
      const result = await record(db,`UPDATE order_suppliers SET status=? WHERE order_id=? AND supplier_id=?
        AND status=? AND EXISTS(SELECT 1 FROM payments WHERE order_id=?)`,
      body.status,orderId,supplier.id,body.status-1,orderId).run();
      need(result.meta.changes,409,'El despacho cambió. Actualiza las liquidaciones.');
    } else {
      const response = text(body.response,500);
      need(response.length >= 5,400,'Escribe una respuesta de al menos cinco caracteres.');
      const result = await record(db,`UPDATE claims SET response=?,responded_at=?
        WHERE order_id=? AND supplier_id=? AND closed_at IS NULL`,response,now,orderId,supplier.id).run();
      need(result.meta.changes,404,'No se encontró un reclamo abierto.');
    }
    return json({ ok:true });
  }
  throw new HttpError(404,'Ruta no disponible.');
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname.slice('/api'.length);
      const method = request.method;
      const db = env.DB.withSession('first-primary');
      const now = Math.floor(Date.now()/1000);
      let body = {};
      if (method === 'POST') {
        need(request.headers.get('Origin') === url.origin,403,'La solicitud debe venir de Mallki.');
        need(request.headers.get('Content-Type')?.startsWith('application/json'),415,'Formato de solicitud no válido.');
        const raw = await request.text();
        need(raw.length <= 8192,413,'La solicitud es demasiado grande.');
        try { body = JSON.parse(raw); } catch { throw new HttpError(400,'Solicitud no válida.'); }
        need(body && typeof body === 'object' && !Array.isArray(body),400,'Solicitud no válida.');
      }
      if (method === 'POST' && ['/login','/register'].includes(path)) return await authenticate(db,request,env,path,body,now);
      if (method === 'POST' && path === '/logout') {
        const token = sessionToken(request);
        if (token) await record(db,'DELETE FROM sessions WHERE token_hash=?',await digest(token)).run();
        return json({ ok:true },200,cookie(request));
      }
      if (method === 'GET' && path === '/catalog') return json(await catalog(db,now));
      const account = await getAccount(db,request,now);
      if (method === 'GET' && path === '/me') return json({ account:account ? publicAccount(account) : null });
      if (path.startsWith('/buyer/')) return await buyerRoute(db,account,method,path,body,now);
      if (path.startsWith('/supplier/')) return await supplierRoute(db,account,method,path,body,now);
      if (path.startsWith('/admin/')) {
        requireRole(account,'admin');
        if (method === 'GET' && path === '/admin/dashboard') return json(await dashboard(db,now));
        if (method === 'POST' && /^\/admin\/claims\/[\w-]+\/close$/.test(path)) {
          const id = path.split('/')[3];
          const result = await record(db,'UPDATE claims SET closed_at=? WHERE id=? AND closed_at IS NULL',now,id).run();
          need(result.meta.changes,404,'No se encontró un reclamo abierto.');
          return json({ ok:true });
        }
      }
      throw new HttpError(404,'Ruta no disponible.');
    } catch (error) {
      if (error instanceof HttpError) return json({ error:error.message },error.status);
      console.error(error);
      return json({ error:'Mallki no pudo completar la operación. Vuelve a intentar.' },500);
    }
  },
};
