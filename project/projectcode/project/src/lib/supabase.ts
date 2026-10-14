import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Category = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  created_at: string;
};

export type ProductVariant = {
  name: string;
  price: number;
};

export type Product = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  variants: ProductVariant[];
  image_url: string;
  is_veg: boolean;
  is_in_stock: boolean;
  stock_quantity: number;
  tax_percentage: number;
  sort_order: number;
  created_at: string;
};

export type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  tax_percentage?: number;
  variant_name?: string;
  modifier_note?: string;
  steak_temp?: string;
};

export type SiteSetting = {
  key: string;
  value: string;
  updated_at: string;
};

export type PaymentMethod = 'cash' | 'online';
export type PaymentStatus = 'paid' | 'unpaid';
export type OrderStatus = 'pending' | 'pending_approval' | 'preparing' | 'completed' | 'cancelled' | 'rejected';
export type TableStatus = 'vacant' | 'occupied' | 'reserved';
export type ShiftType = 'morning' | 'evening' | 'double';

export type PaymentConfig = {
  cash_enabled: boolean;
  online_enabled: boolean;
  easypaisa_name: string;
  easypaisa_number: string;
  jazzcash_name: string;
  jazzcash_number: string;
  bank_name: string;
  bank_title: string;
  bank_iban: string;
};

export type Order = {
  id: string;
  customer_name: string;
  phone: string;
  order_type: 'dine-in' | 'takeaway' | 'delivery';
  table_number: string;
  address: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: OrderStatus;
  created_at: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  transaction_id: string | null;
  payment_screenshot_url: string | null;
  table_id: string | null;
  shift_id: string | null;
  item_discount: number;
  total_discount_type: string;
  total_discount_value: number;
  total_discount_amount: number;
  service_charge_enabled: boolean;
  service_charge_amount: number;
  final_total: number;
  kot_printed: boolean;
  kot_modified: boolean;
  notes: string;
  accepted_by: string;
  accepted_at: string | null;
};

export type CafeSection = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type CafeTable = {
  id: string;
  section_id: string;
  table_number: string;
  status: TableStatus;
  current_order_id: string | null;
  created_at: string;
};

export type Role = {
  id: string;
  role_name: string;
  permissions_json: string[];
  is_system: boolean;
  created_at: string;
};

export type Employee = {
  id: string;
  name: string;
  phone: string;
  default_role_id: string | null;
  is_active: boolean;
  created_at: string;
};

export type Shift = {
  id: string;
  employee_id: string;
  role_id: string | null;
  shift_type: ShiftType;
  start_time: string;
  end_time: string | null;
  opening_cash: number;
  closing_cash: number | null;
  total_orders: number;
  created_at: string;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  tax_percentage: number;
  variant_name: string;
  modifier_note: string;
  steak_temp: string;
  item_discount_type: string;
  item_discount_value: number;
  item_discount_amount: number;
  line_total: number;
  is_kot_printed: boolean;
  kot_modified: boolean;
  created_at: string;
};
