CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  business TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('buyer','supplier','admin')),
  password_hash TEXT NOT NULL,
  assistance INTEGER NOT NULL DEFAULT 0 CHECK(assistance IN (0,1)),
  cart_version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE auth_attempts (
  actor TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('abarrotes','envases')),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 0 AND 50),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY CHECK(id BETWEEN 1 AND 24),
  name TEXT NOT NULL,
  pack TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('abarrotes','envases')),
  eco INTEGER NOT NULL CHECK(eco IN (0,1))
);
CREATE TABLE offers (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  price INTEGER NOT NULL CHECK(price BETWEEN 1 AND 10000000),
  delivery_hours INTEGER NOT NULL CHECK(delivery_hours BETWEEN 1 AND 336),
  confirmed_at INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  UNIQUE(supplier_id,product_id)
);
CREATE INDEX offers_comparison ON offers(product_id, enabled, confirmed_at);
CREATE TABLE price_changes (
  id INTEGER PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES offers(id),
  old_price INTEGER NOT NULL,
  new_price INTEGER NOT NULL,
  changed_at INTEGER NOT NULL
);
CREATE INDEX price_changes_offer ON price_changes(offer_id,id DESC);
CREATE TRIGGER record_price_change AFTER UPDATE OF price ON offers
WHEN OLD.price <> NEW.price AND NEW.confirmed_at IS NOT NULL AND NEW.enabled = 1
BEGIN
  INSERT INTO price_changes(offer_id,old_price,new_price,changed_at)
  VALUES(NEW.id,OLD.price,NEW.price,NEW.confirmed_at);
END;
CREATE TABLE cart_items (
  buyer_id TEXT NOT NULL REFERENCES accounts(id),
  offer_id TEXT NOT NULL REFERENCES offers(id),
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99),
  seen_price INTEGER NOT NULL,
  seen_delivery INTEGER NOT NULL,
  PRIMARY KEY(buyer_id,offer_id)
);
CREATE TRIGGER cart_added AFTER INSERT ON cart_items BEGIN
  UPDATE accounts SET cart_version=cart_version+1 WHERE id=NEW.buyer_id;
END;
CREATE TRIGGER cart_updated AFTER UPDATE ON cart_items BEGIN
  UPDATE accounts SET cart_version=cart_version+1 WHERE id=NEW.buyer_id;
END;
CREATE TRIGGER cart_removed AFTER DELETE ON cart_items BEGIN
  UPDATE accounts SET cart_version=cart_version+1 WHERE id=OLD.buyer_id;
END;
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT CHECK(id >= 42),
  buyer_id TEXT NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL,
  checkout_key TEXT NOT NULL,
  cart_version INTEGER NOT NULL,
  UNIQUE(buyer_id,checkout_key)
);
INSERT INTO sqlite_sequence(name,seq) VALUES('orders',41);
CREATE TABLE order_suppliers (
  order_id INTEGER NOT NULL REFERENCES orders(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  supplier_name TEXT NOT NULL,
  delivery_hours INTEGER NOT NULL,
  status INTEGER NOT NULL DEFAULT 0 CHECK(status BETWEEN 0 AND 3),
  PRIMARY KEY(order_id,supplier_id)
);
CREATE INDEX order_suppliers_by_supplier ON order_suppliers(supplier_id,order_id);
CREATE TABLE order_items (
  order_id INTEGER NOT NULL,
  supplier_id TEXT NOT NULL,
  offer_id TEXT NOT NULL REFERENCES offers(id),
  product_name TEXT NOT NULL,
  pack TEXT NOT NULL,
  eco INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  PRIMARY KEY(order_id,offer_id),
  FOREIGN KEY(order_id,supplier_id) REFERENCES order_suppliers(order_id,supplier_id)
);
CREATE INDEX order_items_group ON order_items(order_id,supplier_id);
CREATE TABLE payments (
  order_id INTEGER PRIMARY KEY REFERENCES orders(id),
  amount INTEGER NOT NULL,
  paid_at INTEGER NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL DEFAULT 'test' CHECK(mode = 'test')
);
CREATE INDEX payments_date ON payments(paid_at);
CREATE INDEX orders_by_buyer ON orders(buyer_id,id DESC);
CREATE TABLE claims (
  id TEXT PRIMARY KEY,
  order_id INTEGER NOT NULL,
  supplier_id TEXT NOT NULL,
  description TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  response TEXT,
  responded_at INTEGER,
  closed_at INTEGER,
  UNIQUE(order_id,supplier_id),
  FOREIGN KEY(order_id,supplier_id) REFERENCES order_suppliers(order_id,supplier_id)
);
