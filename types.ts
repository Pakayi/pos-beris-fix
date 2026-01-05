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

export type UserRole = "owner" | "staff";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  storeId: string; // Menghubungkan staff ke toko owner
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

export enum AppRoute {
  DASHBOARD = "dashboard",
  POS = "pos",
  PRODUCTS = "products",
  CUSTOMERS = "customers",
  REPORTS = "reports",
  SETTINGS = "settings",
}
