import { aplicarPuntosBasicos } from '../src/shared/dinero.ts';
import { COMISION_PB, VIGENCIA_DIAS } from '../src/shared/reglas.ts';

export const DAY = 86400;
export const valid = 'o.enabled=1 AND s.enabled=1 AND o.confirmed_at>? AND o.confirmed_at<=?';
const offerFields = `o.id,o.product_id,o.price,o.delivery_hours,o.confirmed_at,o.enabled,
  s.name AS supplier,s.id AS supplier_id,s.rating,p.name AS product,p.pack,p.eco`;
const offerJoin = 'offers o JOIN suppliers s ON s.id=o.supplier_id JOIN products p ON p.id=o.product_id';
export const all = async (query) => (await query.all()).results;
export const freshness = (now) => [now - VIGENCIA_DIAS * DAY, now];

export async function catalog(db, now) {
  const [products, offers, changes] = await db.batch([
    db.prepare('SELECT * FROM products ORDER BY id'),
    db.prepare(`SELECT ${offerFields} FROM ${offerJoin} WHERE ${valid}
      ORDER BY o.price,o.delivery_hours,o.confirmed_at DESC,o.id`).bind(...freshness(now)),
    db.prepare(`SELECT o.id AS offer_id,c.old_price,c.new_price,c.changed_at
      FROM price_changes c JOIN offers o ON o.id=c.offer_id JOIN suppliers s ON s.id=o.supplier_id
      WHERE ${valid} AND c.id=(SELECT MAX(id) FROM price_changes WHERE offer_id=o.id)
        AND c.new_price>c.old_price AND c.new_price=o.price ORDER BY c.changed_at DESC,o.id`).bind(...freshness(now)),
  ]);
  return { products: products.results, offers: offers.results, changes: changes.results, now };
}

export async function cart(db, accountId, now) {
  const [version, items] = await db.batch([
    db.prepare('SELECT cart_version FROM accounts WHERE id=?').bind(accountId),
    db.prepare(`SELECT ${offerFields},c.quantity,c.seen_price,c.seen_delivery,(${valid}) AS available
      FROM ${offerJoin} JOIN cart_items c ON o.id=c.offer_id WHERE c.buyer_id=? ORDER BY s.name,p.id`)
      .bind(...freshness(now),accountId),
  ]);
  return { version: version.results[0].cart_version, items: items.results };
}

export async function orders(db, account, supplierId = null) {
  const supplierMode = supplierId !== null;
  const where = supplierMode ? 'g.supplier_id=? AND pay.order_id IS NOT NULL' : 'o.buyer_id=?';
  const who = supplierMode ? supplierId : account.id;
  const [rows, claims] = await db.batch([
    db.prepare(`SELECT o.id,o.created_at,pay.reference,pay.paid_at,
      g.supplier_id,g.supplier_name,g.delivery_hours,g.status,b.business AS buyer,
      i.offer_id,i.product_name,i.pack,i.eco,i.unit_price,i.quantity
      FROM orders o JOIN accounts b ON b.id=o.buyer_id
      JOIN order_suppliers g ON g.order_id=o.id JOIN order_items i ON i.order_id=o.id AND i.supplier_id=g.supplier_id
      LEFT JOIN payments pay ON pay.order_id=o.id WHERE ${where} ORDER BY o.id DESC,g.supplier_name,i.product_name`).bind(who),
    db.prepare(`SELECT c.* FROM claims c JOIN orders o ON o.id=c.order_id
      JOIN order_suppliers g ON g.order_id=c.order_id AND g.supplier_id=c.supplier_id
      JOIN payments pay ON pay.order_id=o.id WHERE ${where}`).bind(who),
  ]);
  const byId = new Map();
  const claimByGroup = new Map(claims.results.map((c) => [`${c.order_id}:${c.supplier_id}`, c]));
  for (const row of rows.results) {
    if (!byId.has(row.id)) byId.set(row.id, {
      id: row.id, created_at: row.created_at, paid_at: row.paid_at, reference: row.reference,
      buyer: row.buyer, groups: {}, total: 0, commission: 0,
    });
    const order = byId.get(row.id);
    order.groups[row.supplier_id] ??= {
      id: row.supplier_id, name: row.supplier_name, delivery_hours: row.delivery_hours, status: row.status,
      items: [], subtotal: 0, claim: claimByGroup.get(`${row.id}:${row.supplier_id}`) ?? null,
    };
    const group = order.groups[row.supplier_id];
    group.items.push({ id: row.offer_id, product: row.product_name, pack: row.pack, price: row.unit_price, quantity: row.quantity, eco: row.eco });
    group.subtotal += row.unit_price * row.quantity;
  }
  return Array.from(byId.values(), (order) => {
    order.groups = Object.values(order.groups).map((group) => {
      const commission = aplicarPuntosBasicos(group.subtotal, COMISION_PB);
      order.total += group.subtotal;
      order.commission += commission;
      return { ...group, commission, net: group.subtotal - commission };
    });
    return order;
  });
}

export async function dashboard(db, now) {
  const from = now - 30 * DAY;
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year:'numeric', month:'2-digit' })
    .formatToParts(now * 1000);
  const monthStart = Date.UTC(Number(month.find((p) => p.type === 'year').value), Number(month.find((p) => p.type === 'month').value)-1,1,5) / 1000;
  const results = await db.batch([
    db.prepare(`SELECT COUNT(DISTINCT o.buyer_id) AS n FROM orders o WHERE o.created_at>=? AND o.created_at<=?`).bind(from,now),
    db.prepare(`SELECT COUNT(DISTINCT g.supplier_id) AS n FROM order_suppliers g
      JOIN orders ord ON ord.id=g.order_id WHERE ord.created_at>=? AND ord.created_at<=? AND EXISTS(
        SELECT 1 FROM offers o JOIN suppliers s ON s.id=o.supplier_id WHERE s.id=g.supplier_id AND ${valid}
      )`).bind(from,now,...freshness(now)),
    db.prepare(`SELECT p.id,p.name,p.category,COUNT(DISTINCT CASE WHEN ${valid} THEN s.id END) AS offers
      FROM products p LEFT JOIN offers o ON o.product_id=p.id LEFT JOIN suppliers s ON s.id=o.supplier_id
      GROUP BY p.id ORDER BY p.id`).bind(...freshness(now)),
    db.prepare(`SELECT o.id,s.name AS supplier,p.name AS product,o.confirmed_at FROM ${offerJoin}
      WHERE ${valid} AND o.confirmed_at<=? ORDER BY o.confirmed_at,o.id`).bind(...freshness(now),now - 5*DAY),
    db.prepare(`SELECT SUM(i.unit_price*i.quantity) AS subtotal FROM payments pay
      JOIN order_items i ON i.order_id=pay.order_id WHERE pay.paid_at>=? GROUP BY i.order_id,i.supplier_id`).bind(monthStart),
    db.prepare(`SELECT c.id,c.description,c.opened_at,c.response,c.closed_at,c.order_id,s.name AS supplier
      FROM claims c JOIN suppliers s ON s.id=c.supplier_id ORDER BY c.opened_at DESC LIMIT 50`),
  ]);
  const [buyers,suppliers,coverage,expiring,monthly,claims] = results.map((r) => r.results);
  return { buyers: buyers[0].n, suppliers: suppliers[0].n, coverage, expiring, claims, now,
    sales: monthly.reduce((sum, line) => sum + line.subtotal, 0),
    commission: monthly.reduce((sum, line) => sum + aplicarPuntosBasicos(line.subtotal,COMISION_PB), 0) };
}
