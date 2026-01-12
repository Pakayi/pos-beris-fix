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
  supplierId?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  address: string;
  description: string;
}

export interface ProcurementItem {
  productId: string;
  productName: string;
  quantity: number;
  unitName: string;
  buyPrice: number;
  total: number;
}

export interface Procurement {
  id: string;
  supplierId: string;
  supplierName: string;
  timestamp: number;
  items: ProcurementItem[];
  totalAmount: number;
  note?: string;
}

export type CustomerTier = "Bronze" | "Silver" | "Gold";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  tier: CustomerTier;
  totalSpent: number;
  debtBalance: number; // Saldo hutang saat ini
  joinedAt: number;
}

export interface DebtPayment {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  timestamp: number;
  note?: string;
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
  paymentMethod: "cash" | "qris" | "debt"; // Tambah metode debt
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
  warungId: string;
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
  SUPPLIERS = "suppliers",
  PROCUREMENT = "procurement",
  DEBT_BOOK = "debt-book",
}
