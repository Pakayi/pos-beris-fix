export interface ProductUnit {
  name: string;
  conversion: number;
  price: number;
  buyPrice: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  baseUnit: string;
  stock: number;
  minStockAlert: number;
  units: ProductUnit[];
  updatedAt: number;
  supplierId?: string; // Menghubungkan produk ke pemasok
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  address: string;
  category: string;
  updatedAt: number;
}

export type StockLogType = "SALE" | "RESTOCK" | "ADJUSTMENT" | "INITIAL";

export interface StockLog {
  id: string;
  productId: string;
  productName: string;
  type: "IN" | "OUT";
  logType: StockLogType;
  quantity: number;
  unitName: string;
  previousStock: number;
  currentStock: number;
  reason: string;
  operatorName: string;
  timestamp: number;
}

export type CustomerTier = "Bronze" | "Silver" | "Gold";

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
  paymentMethod: "cash" | "qris";
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

export type UserRole = "owner" | "cashier" | "admin";

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
  status: "active" | "suspended";
  plan: "free" | "pro";
  createdAt: number;
  trialEndsAt?: number;
}

export enum AppRoute {
  DASHBOARD = "dashboard",
  POS = "pos",
  PRODUCTS = "products",
  CUSTOMERS = "customers",
  SUPPLIERS = "suppliers",
  INVENTORY = "inventory",
  REPORTS = "reports",
  SETTINGS = "settings",
}
