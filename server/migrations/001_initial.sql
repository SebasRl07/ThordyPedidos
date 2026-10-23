
CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','operator')), active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS product_categories(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,name TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>=0),category TEXT NOT NULL DEFAULT '',presentation TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,sold_out INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,request_key TEXT NOT NULL UNIQUE,customer TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',neighborhood TEXT NOT NULL DEFAULT '',channel TEXT NOT NULL,payment TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',subtotal INTEGER NOT NULL,discount INTEGER NOT NULL,delivery INTEGER NOT NULL,total INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','ready','dispatched','delivered','cancelled')),created_at TEXT NOT NULL,ready_at TEXT,dispatched_at TEXT,delivered_at TEXT,cancelled_at TEXT,cancel_reason TEXT,user_id INTEGER NOT NULL REFERENCES users(id));
CREATE INDEX IF NOT EXISTS orders_date ON orders(created_at);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),product_id INTEGER NOT NULL REFERENCES products(id),name TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),price INTEGER NOT NULL CHECK(price>=0));
CREATE TABLE IF NOT EXISTS order_status_history(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),status TEXT NOT NULL,at TEXT NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id),reason TEXT);
CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS backup_history(id INTEGER PRIMARY KEY,at TEXT NOT NULL,path TEXT NOT NULL,status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at TEXT NOT NULL,user_id INTEGER REFERENCES users(id),action TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS print_jobs(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),kind TEXT NOT NULL,request_key TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'simulated',attempts INTEGER NOT NULL DEFAULT 1,at TEXT NOT NULL);
INSERT OR IGNORE INTO migrations VALUES(1);
INSERT OR IGNORE INTO app_settings VALUES('operation','{"warningMinutes":30,"retentionDays":30,"backupHour":23,"paperWidth":80,"copies":1,"autoPrint":false,"connection":"simulated","printer":""}');
