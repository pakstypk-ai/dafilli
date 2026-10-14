/*
# POS System: Sections, Tables, Roles, Employees, Shifts, Order Enhancements

## Overview
Upgrades the cafe system from a simple ordering app into a full POS/management system.
Adds table management, waiter POS, employee shifts, role-based permissions, order approval flow,
discounts, and service charges.

## New Tables
1. `sections` — Cafe seating sections (Indoor, Outdoor, Terrace A, Terrace B)
   - id (uuid PK), name (text), sort_order (int), created_at (timestamptz)

2. `tables` — Individual cafe tables with live status
   - id (uuid PK), section_id (FK→sections), table_number (text), status (text: vacant|occupied|reserved), current_order_id (uuid nullable), created_at

3. `roles` — Employee role definitions with modular permissions
   - id (uuid PK), role_name (text unique), permissions_json (jsonb), is_system (bool), created_at

4. `employees` — Staff members
   - id (uuid PK), name (text), phone (text), default_role_id (FK→roles), is_active (bool), created_at

5. `shifts` — Employee shift tracking
   - id (uuid PK), employee_id (FK→employees), role_id (FK→roles), shift_type (text: morning|evening|double), start_time (timestamptz), end_time (timestamptz nullable), opening_cash (numeric), closing_cash (numeric nullable), total_orders (int), created_at

6. `order_items` — Normalized order line items (replaces items JSONB for new orders)
   - id (uuid PK), order_id (FK→orders), product_id (text), name (text), price (numeric), quantity (int), tax_percentage (numeric), variant_name (text), modifier_note (text), steak_temp (text), item_discount_type (text: percent|flat), item_discount_value (numeric), item_discount_amount (numeric), line_total (numeric), is_kot_printed (bool), kot_modified (bool), created_at

## Modified Tables
- `orders`: Added columns — table_id (FK→tables), shift_id (FK→shifts), item_discount (numeric), total_discount_type (text), total_discount_value (numeric), total_discount_amount (numeric), service_charge_enabled (bool), service_charge_amount (numeric), final_total (numeric), kot_printed (bool), kot_modified (bool), notes (text), accepted_by (text), accepted_at (timestamptz).
  - `status` extended to include: 'pending_approval', 'preparing', 'completed', 'cancelled', 'rejected'

## Seed Data
- 4 default sections
- 19 default tables (Indoor 1-4, Outdoor O1-O15)
- 4 system roles with permissions
- Default tables seeded into cafe_settings

## Security
- RLS enabled on all new tables with anon+authenticated CRUD (single-tenant, no auth screen)
- No user_id columns (no sign-in required for this app)
*/

-- ============================================================
-- SECTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_sections" ON sections;
CREATE POLICY "anon_select_sections" ON sections FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_sections" ON sections FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_sections" ON sections FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_sections" ON sections FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- TABLES (cafe tables, not DB tables)
-- ============================================================
CREATE TABLE IF NOT EXISTS tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid REFERENCES sections(id) ON DELETE CASCADE,
  table_number text NOT NULL,
  status text NOT NULL DEFAULT 'vacant',
  current_order_id uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_tables" ON tables;
CREATE POLICY "anon_select_tables" ON tables FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_tables" ON tables;
CREATE POLICY "anon_insert_tables" ON tables FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_tables" ON tables;
CREATE POLICY "anon_update_tables" ON tables FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_tables" ON tables;
CREATE POLICY "anon_delete_tables" ON tables FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- ROLES
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name text UNIQUE NOT NULL,
  permissions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_roles" ON roles;
CREATE POLICY "anon_select_roles" ON roles FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_roles" ON roles;
CREATE POLICY "anon_insert_roles" ON roles FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_roles" ON roles;
CREATE POLICY "anon_update_roles" ON roles FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_roles" ON roles;
CREATE POLICY "anon_delete_roles" ON roles FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- EMPLOYEES
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  default_role_id uuid REFERENCES roles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_employees" ON employees;
CREATE POLICY "anon_select_employees" ON employees FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_employees" ON employees;
CREATE POLICY "anon_insert_employees" ON employees FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_employees" ON employees;
CREATE POLICY "anon_update_employees" ON employees FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_employees" ON employees;
CREATE POLICY "anon_delete_employees" ON employees FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- SHIFTS
-- ============================================================
CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  role_id uuid REFERENCES roles(id) ON DELETE SET NULL,
  shift_type text NOT NULL DEFAULT 'morning',
  start_time timestamptz NOT NULL DEFAULT now(),
  end_time timestamptz,
  opening_cash numeric NOT NULL DEFAULT 0,
  closing_cash numeric,
  total_orders int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_shifts" ON shifts;
CREATE POLICY "anon_select_shifts" ON shifts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_shifts" ON shifts;
CREATE POLICY "anon_insert_shifts" ON shifts FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_shifts" ON shifts;
CREATE POLICY "anon_update_shifts" ON shifts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_shifts" ON shifts;
CREATE POLICY "anon_delete_shifts" ON shifts FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- ORDER_ITEMS (normalized line items)
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  product_id text NOT NULL DEFAULT '',
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  quantity int NOT NULL DEFAULT 1,
  tax_percentage numeric NOT NULL DEFAULT 0,
  variant_name text NOT NULL DEFAULT '',
  modifier_note text NOT NULL DEFAULT '',
  steak_temp text NOT NULL DEFAULT '',
  item_discount_type text NOT NULL DEFAULT '',
  item_discount_value numeric NOT NULL DEFAULT 0,
  item_discount_amount numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  is_kot_printed boolean NOT NULL DEFAULT false,
  kot_modified boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_order_items" ON order_items;
CREATE POLICY "anon_select_order_items" ON order_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_order_items" ON order_items;
CREATE POLICY "anon_insert_order_items" ON order_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_order_items" ON order_items;
CREATE POLICY "anon_update_order_items" ON order_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_order_items" ON order_items;
CREATE POLICY "anon_delete_order_items" ON order_items FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- ORDERS table additions
-- ============================================================
DO $$ BEGIN
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id uuid REFERENCES tables(id) ON DELETE SET NULL;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS item_discount numeric NOT NULL DEFAULT 0;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_discount_type text NOT NULL DEFAULT '';
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_discount_value numeric NOT NULL DEFAULT 0;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_discount_amount numeric NOT NULL DEFAULT 0;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_charge_enabled boolean NOT NULL DEFAULT false;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_charge_amount numeric NOT NULL DEFAULT 0;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS final_total numeric NOT NULL DEFAULT 0;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS kot_printed boolean NOT NULL DEFAULT false;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS kot_modified boolean NOT NULL DEFAULT false;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS accepted_by text NOT NULL DEFAULT '';
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
  ALTER TABLE orders ALTER COLUMN customer_name SET DEFAULT '';
  ALTER TABLE orders ALTER COLUMN phone SET DEFAULT '';
  ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending_approval';
END $$;

-- ============================================================
-- SEED: Default sections
-- ============================================================
INSERT INTO sections (name, sort_order) VALUES
  ('Indoor', 1),
  ('Outdoor', 2),
  ('Terrace A', 3),
  ('Terrace B', 4)
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED: Default tables (Indoor 1-4, Outdoor O1-O15)
-- ============================================================
DO $$
DECLARE
  indoor_id uuid;
  outdoor_id uuid;
  terrace_a_id uuid;
  terrace_b_id uuid;
  i int;
BEGIN
  SELECT id INTO indoor_id FROM sections WHERE name = 'Indoor' LIMIT 1;
  SELECT id INTO outdoor_id FROM sections WHERE name = 'Outdoor' LIMIT 1;
  SELECT id INTO terrace_a_id FROM sections WHERE name = 'Terrace A' LIMIT 1;
  SELECT id INTO terrace_b_id FROM sections WHERE name = 'Terrace B' LIMIT 1;

  -- Indoor tables 1-4
  FOR i IN 1..4 LOOP
    INSERT INTO tables (section_id, table_number, status)
    VALUES (indoor_id, i::text, 'vacant')
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Outdoor tables O1-O15
  FOR i IN 1..15 LOOP
    INSERT INTO tables (section_id, table_number, status)
    VALUES (outdoor_id, 'O' || i::text, 'vacant')
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Terrace A: T1-T5
  FOR i IN 1..5 LOOP
    INSERT INTO tables (section_id, table_number, status)
    VALUES (terrace_a_id, 'T' || i::text, 'vacant')
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Terrace B: TB1-TB5
  FOR i IN 1..5 LOOP
    INSERT INTO tables (section_id, table_number, status)
    VALUES (terrace_b_id, 'TB' || i::text, 'vacant')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ============================================================
-- SEED: Default roles
-- ============================================================
INSERT INTO roles (role_name, permissions_json, is_system) VALUES
  ('Admin', '["all"]'::jsonb, true),
  ('Manager', '["can_apply_discount","can_edit_order","can_void_item","can_manage_products","can_view_reports","can_accept_orders","can_reject_orders","can_punch_kot","can_manage_tables"]'::jsonb, true),
  ('Cashier', '["can_accept_orders","can_reject_orders","can_punch_kot","can_view_reports","can_process_payment"]'::jsonb, true),
  ('Waiter', '["can_punch_kot","can_take_orders","can_view_tables"]'::jsonb, true)
ON CONFLICT (role_name) DO NOTHING;

-- ============================================================
-- SEED: cafe_settings defaults (service charge)
-- ============================================================
INSERT INTO site_settings (key, value) VALUES
  ('service_charge_enabled', 'false'),
  ('service_charge_percentage', '0')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tables_section ON tables(section_id);
CREATE INDEX IF NOT EXISTS idx_tables_status ON tables(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_shifts_employee ON shifts(employee_id);
