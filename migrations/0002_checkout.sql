-- SQLite triggers execute in the same transaction as order creation.
CREATE TRIGGER checkout_snapshot AFTER INSERT ON orders BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM accounts WHERE id=NEW.buyer_id AND cart_version=NEW.cart_version
  ) THEN RAISE(ABORT,'cart_version_changed') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM cart_items WHERE buyer_id=NEW.buyer_id
  ) THEN RAISE(ABORT,'empty_cart') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM cart_items c
    JOIN offers o ON o.id=c.offer_id JOIN suppliers s ON s.id=o.supplier_id
    WHERE c.buyer_id=NEW.buyer_id AND (
      o.enabled=0 OR s.enabled=0 OR o.confirmed_at IS NULL OR
      o.confirmed_at <= NEW.created_at-604800 OR o.confirmed_at > NEW.created_at OR
      o.price <> c.seen_price OR o.delivery_hours <> c.seen_delivery
    )
  ) THEN RAISE(ABORT,'cart_offer_changed') END;

  INSERT INTO order_suppliers(order_id,supplier_id,supplier_name,delivery_hours)
  SELECT NEW.id,s.id,s.name,MAX(o.delivery_hours)
  FROM cart_items c JOIN offers o ON o.id=c.offer_id JOIN suppliers s ON s.id=o.supplier_id
  WHERE c.buyer_id=NEW.buyer_id GROUP BY s.id,s.name;

  INSERT INTO order_items(order_id,supplier_id,offer_id,product_name,pack,eco,unit_price,quantity)
  SELECT NEW.id,o.supplier_id,o.id,p.name,p.pack,p.eco,o.price,c.quantity
  FROM cart_items c JOIN offers o ON o.id=c.offer_id JOIN products p ON p.id=o.product_id
  WHERE c.buyer_id=NEW.buyer_id;

  DELETE FROM cart_items WHERE buyer_id=NEW.buyer_id;
END;
