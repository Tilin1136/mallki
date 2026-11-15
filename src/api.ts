export type Role = 'buyer' | 'supplier' | 'admin';
export interface Account { id: string; name: string; business: string; role: Role; assistance: boolean }
export interface Product { id: number; name: string; pack: string; category: 'abarrotes' | 'envases'; eco: number }
export interface Offer {
  id: string; product_id: number; product: string; pack: string; eco: number; price: number;
  delivery_hours: number; confirmed_at: number | null; enabled: number; supplier: string; supplier_id: string; rating: number;
}
export interface Change { offer_id: string; old_price: number; new_price: number; changed_at: number }
export interface Catalog { products: Product[]; offers: Offer[]; changes: Change[]; now: number }
export interface CartItem extends Offer { quantity: number; seen_price: number; seen_delivery: number; available: number }
export interface Cart { version: number; items: CartItem[] }
export interface Claim {
  id: string; order_id: number; description: string; opened_at: number; closed_at: number | null;
  response: string | null; supplier: string;
}
export interface OrderItem { id: string; product: string; pack: string; price: number; quantity: number }
export interface Group {
  id: string; name: string; delivery_hours: number; status: number; items: OrderItem[];
  subtotal: number; commission: number; net: number; claim: Claim | null;
}
export interface Order {
  id: number; created_at: number; reference: string | null; paid_at: number | null;
  buyer: string; groups: Group[]; total: number; commission: number;
}
export interface Coverage { id: number; name: string; category: Product['category']; offers: number }
export interface Dashboard {
  buyers: number; suppliers: number; coverage: Coverage[]; now: number; sales: number; commission: number;
  expiring: Array<{ id: string; supplier: string; product: string; confirmed_at: number }>;
  claims: Claim[];
}
export async function api<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api' + path, {
    signal,
    ...(body ? { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data as T;
}
