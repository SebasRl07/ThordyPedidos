-- Ledger deliberately has no FK to orders: deletion must preserve its audit.
CREATE TABLE order_deletions (
  order_id INTEGER PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  deleted_at TEXT NOT NULL,
  admin_id INTEGER NOT NULL REFERENCES users(id),
  admin_username TEXT NOT NULL,
  original_status TEXT NOT NULL
);
CREATE INDEX order_items_order ON order_items(order_id);
CREATE INDEX order_history_order ON order_status_history(order_id,id);
CREATE INDEX print_jobs_order ON print_jobs(order_id,status);
CREATE INDEX print_jobs_queue ON print_jobs(status,attempts,id);
CREATE INDEX orders_delivered ON orders(delivered_at) WHERE status='delivered';
CREATE INDEX order_deletions_date ON order_deletions(deleted_at);
