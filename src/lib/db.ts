import Dexie, { Table } from 'dexie';

// Define interfaces for our local tables based on Supabase schema
export interface LocalProduct {
  id: string;
  name: string;
  category_id: string | null;
  barcode: string | null;
  purchase_price: number;
  sell_price: number;
  stock_quantity: number;
  min_stock: number;
  image_url: string | null;
  created_at: string;
  created_by: string;
  [key: string]: any;
}

export interface LocalCategory {
  id: string;
  name: string;
  created_at: string;
  created_by: string;
  [key: string]: any;
}

export interface LocalCustomer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  balance: number;
  opening_balance: number;
  is_active?: boolean;
  is_archived?: boolean;
  created_at: string;
  created_by: string;
  [key: string]: any;
}

export interface LocalSale {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  subtotal: number;
  discount: number;
  total_amount: number;
  paid_amount: number;
  payment_method: string;
  status: string;
  created_by: string;
  created_at: string;
  [key: string]: any;
}

export interface LocalSaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  [key: string]: any;
}

export interface LocalTransaction {
  id: string;
  tenant_id: string;
  type: string;
  amount: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  date: string;
  payment_method: string;
  entity_type: string | null;
  entity_id: string | null;
  created_by: string;
  created_at: string;
  [key: string]: any;
}

export interface LocalSupplier {
  id: string;
  name: string;
  phone: string | null;
  company_name: string | null;
  balance: number;
  opening_balance: number;
  created_at: string;
  created_by: string;
  [key: string]: any;
}

export interface LocalPartner {
  id: string;
  name: string;
  phone: string | null;
  share_percentage: number;
  tenant_id: string;
  created_at: string;
  [key: string]: any;
}

export interface PendingSale {
  id: string; // local uuid
  tenant_id: string;
  customer_id: string | null;
  subtotal: number;
  discount: number;
  total_amount: number;
  paid_amount: number;
  payment_method: string;
  status: string;
  created_by: string;
  created_at: string;
  items: any[]; // Array of sale items
}

export class AppDatabase extends Dexie {
  products!: Table<LocalProduct, string>;
  categories!: Table<LocalCategory, string>;
  customers!: Table<LocalCustomer, string>;
  sales!: Table<LocalSale, string>;
  sale_items!: Table<LocalSaleItem, string>;
  transactions!: Table<LocalTransaction, string>;
  suppliers!: Table<LocalSupplier, string>;
  partners!: Table<LocalPartner, string>;
  pending_sales!: Table<PendingSale, string>;

  constructor() {
    super('BawsalaDB');
    
    // Define tables and indexes
    // 'id' is the primary key. Other fields are indexed for faster querying if needed.
    this.version(5).stores({
      products: 'id, category_id, name, barcode, created_by, created_at',
      categories: 'id, name, created_by, created_at',
      customers: 'id, name, phone, created_by, created_at',
      sales: 'id, customer_id, created_at, tenant_id',
      sale_items: 'id, sale_id, product_id',
      transactions: 'id, reference_id, reference_type, date, tenant_id, entity_type, entity_id, payment_method, created_at',
      suppliers: 'id, name, created_by, created_at',
      partners: 'id, name, tenant_id, created_at',
      pending_sales: 'id, created_at'
    });
  }
}

export const db = new AppDatabase();
