
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

export type CustomerTier = 'Bronze' | 'Silver' | 'Gold';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  tier: CustomerTier;
  totalSpent: number; // Track total spending for future tier upgrades logic
  joinedAt: number;
}

export interface CartItem {
  productId: string;
  productName: string;
  unitName: string;
  price: number; // Selling Price at time of transaction
  buyPrice: number; // Cost Price at time of transaction
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
  
  // New fields for Customer & Discount
  customerId?: string;
  customerName?: string;
  discountAmount?: number; // Total discount in Rp
}

export interface Category {
  id: string;
  name: string;
  
}

export interface AppSettings {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  enableTax: boolean;
  taxRate: number; // Percentage
  footerMessage: string;
  showLogo: boolean;
  logoUrl?: string | null; // Base64 image string
  securityPin: string | null;
  printerName?: string | null; // For UI display only
  
  // Loyalty Settings
  tierDiscounts: {
    bronze: number;
    silver: number;
    gold: number;
  };
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
