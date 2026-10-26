export type OrderStatus =
  "received" | "ready" | "dispatched" | "delivered" | "cancelled";
export interface Actor {
  id: number;
  username: string;
  role: "admin" | "operator";
}
export interface OrderRow {
  id: number;
  request_key: string;
  customer: string;
  phone: string;
  address: string;
  neighborhood: string;
  channel: string;
  payment: string;
  notes: string;
  subtotal: number;
  discount: number;
  delivery: number;
  total: number;
  status: OrderStatus;
  created_at: string;
  ready_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  user_id: number;
}
export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  name: string;
  quantity: number;
  price: number;
}
export interface StatusHistory {
  id: number;
  order_id: number;
  status: OrderStatus;
  at: string;
  user_id: number;
  username: string;
  reason: string | null;
}
export interface Order extends OrderRow {
  responsible: string;
  items: OrderItem[];
  history: StatusHistory[];
  revision: number;
}
export interface ChangeEvent {
  resource: "orders" | "products" | "settings";
  action?: "created" | "updated" | "deleted";
  id?: number;
}
export const orderLabels: Record<OrderStatus, string> = {
  received: "Recibido",
  ready: "Listo",
  dispatched: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
};
