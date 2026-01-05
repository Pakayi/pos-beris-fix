
export interface ProductUnit {
  name: string; // e.g., "Pcs", "Slop", "Karton"
  conversion: number; // Multiplier relative to base unit (e.g., 1, 10, 100)
  price: number; // Selling price for this unit
  buyPrice: number; // Cost of Goods Sold (Modal) per unit
}

export interface Product {
  id: string;
  name: string;
  sku: string; // Barcode
  category: string;
  baseUnit: string; // The smallest unit (e.g., Pcs)
  stock: number; // Stored in base units
  minStockAlert: number;
  units: ProductUnit[];
  updatedAt: number;
}

export type StockLogType = 'SALE' | 'RESTOCK' | 'ADJUSTMENT' | 'INITIAL';

export interface StockLog {
  id: string;
  productId: string;
  productName: string;
  type: 'IN' | 'OUT';
  logType: StockLogType;
  quantity: number; // absolute value
  unitName: string;
  previousStock: number;
  currentStock: number;
  reason: string;
  operatorName: string;
  timestamp: number;
}

export type CustomerTier = 'Bronze' | 'Silver' | 'Gold';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  tier: CustomerTier;
  totalSpent: number;
  joinedAt: number;
}

export interface CartItem {
  productId: string;
  productName: string;
  unitName: string;
  price: number;
  buyPrice: number;
  quantity: number;
  conversion: number;
}

export interface Transaction {
  id: string;
  timestamp: number;
  items: CartItem[];
  totalAmount: number;
  paymentMethod: 'cash' | 'qris';
  cashPaid: number;
  change: number;
  note?: string;
  customerId?: string;
  customerName?: string;
  discountAmount?: number;
}

export interface AppSettings {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  enableTax: boolean;
  taxRate: number;
  footerMessage: string;
  showLogo: boolean;
  logoUrl?: string | null;
  securityPin: string | null;
  printerName?: string | null;
  tierDiscounts: {
    bronze: number;
    silver: number;
    gold: number;
  };
}

// --- NEW MULTI-TENANT TYPES ---
export type UserRole = 'owner' | 'cashier' | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  warungId: string;
  role: UserRole;
  active: boolean;
}

export interface Warung {
  id: string;
  name: string;
  ownerUid: string;
  status: 'active' | 'suspended';
  plan: 'free' | 'pro';
  createdAt: number;
}

export enum AppRoute {
  DASHBOARD = 'dashboard',
  POS = 'pos',
  PRODUCTS = 'products',
  CUSTOMERS = 'customers',
  INVENTORY = 'inventory',
  REPORTS = 'reports',
  SETTINGS = 'settings'
}
