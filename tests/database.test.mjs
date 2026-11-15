import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { aplicarPuntosBasicos } from '../src/shared/dinero.ts';

function fixture() {
  const db = new DatabaseSync(':memory:');
  for (const filename of ['0001_schema.sql','0002_checkout.sql']) {
    db.exec(readFileSync(new URL(`../migrations/${filename}`,import.meta.url),'utf8'));
  }
  db.exec(`INSERT INTO accounts(id,email,name,business,role,password_hash) VALUES
    ('b','b@mallki.example','Comprador','Negocio','buyer','unused'),
    ('s','s@mallki.example','Proveedor','Distribuidora','supplier','unused');
    INSERT INTO suppliers(id,account_id,name,category,rating) VALUES('s','s','Distribuidora','abarrotes',46);
    INSERT INTO products VALUES(1,'Aceite','Balde 18 L','abarrotes',0);
    INSERT INTO offers VALUES('oil','s',1,11800,24,1000000,1);
    INSERT INTO cart_items VALUES('b','oil',2,11800,24);`);
  return db;
}

test('el límite de siete días expira la oferta y conserva el carrito', () => {
  const db = fixture();
  try {
    const checkout = db.prepare("INSERT INTO orders(buyer_id,created_at,checkout_key,cart_version) VALUES('b',?,'test',1)");
    assert.throws(()=>checkout.run(1604800),/cart_offer_changed/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cart_items').get().n,1);
    checkout.run(1604799);
    assert.equal(db.prepare('SELECT id FROM orders').get().id,42);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cart_items').get().n,0);
  } finally { db.close(); }
});

test('precio y versión se validan al confirmar y el precio confirmado queda fijo', () => {
  const db = fixture();
  try {
    db.exec("UPDATE offers SET price=11900,confirmed_at=1000002 WHERE id='oil'");
    const checkout = db.prepare("INSERT INTO orders(buyer_id,created_at,checkout_key,cart_version) VALUES('b',1000100,'test',?)");
    assert.throws(()=>checkout.run(1),/cart_offer_changed/);
    db.exec('UPDATE cart_items SET seen_price=11900');
    assert.throws(()=>checkout.run(1),/cart_version_changed/);
    checkout.run(2);
    db.exec("UPDATE offers SET price=12100,confirmed_at=1000101 WHERE id='oil'");
    assert.equal(db.prepare('SELECT unit_price FROM order_items').get().unit_price,11900);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM price_changes').get().n,2);
  } finally { db.close(); }
});

test('la comisión se redondea por proveedor y concilia con el pago agrupado', () => {
  const subtotals = [23600,19900,5560];
  const commissions = subtotals.map(amount=>aplicarPuntosBasicos(amount,250));
  assert.deepEqual(commissions,[590,498,139]);
  assert.equal(subtotals.reduce((a,b)=>a+b,0),49060);
  assert.equal(commissions.reduce((a,b)=>a+b,0),1227);
});
