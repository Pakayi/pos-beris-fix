import { Product, Transaction, AppSettings, Customer, UserProfile, StockLog, Supplier } from "../types";
import { db_fs, auth } from "./firebase";
import { doc, setDoc, collection, deleteDoc, onSnapshot, getDoc, query, where, getDocs, updateDoc, orderBy, limit, writeBatch } from "firebase/firestore";

const STORAGE_KEYS = {
  PRODUCTS: "warung_products",
  TRANSACTIONS: "warung_transactions",
  CUSTOMERS: "warung_customers",
  SUPPLIERS: "warung_suppliers",
  SETTINGS: "warung_settings",
  PROFILE: "warung_user_profile",
  STOCK_LOGS: "warung_stock_logs",
  INIT: "warung_initialized",
};

const DEFAULT_SETTINGS: AppSettings = {
  storeName: "Warung Baru",
  storeAddress: "Alamat belum diatur",
  storePhone: "-",
  enableTax: false,
  taxRate: 11,
  footerMessage: "Terima kasih!",
  showLogo: true,
  logoUrl: null,
  securityPin: null,
  printerName: null,
  tierDiscounts: { bronze: 0, silver: 2, gold: 5 },
};

class DBService {
  private activeWarungId: string | null = null;
  private unsubscribers: (() => void)[] = [];

  constructor() {
    this.init();
  }

  private init() {
    const cachedProfile = localStorage.getItem(STORAGE_KEYS.PROFILE);
    if (cachedProfile) {
      try {
        const profile: UserProfile = JSON.parse(cachedProfile);
        this.activeWarungId = profile.warungId;
      } catch (e) {
        localStorage.removeItem(STORAGE_KEYS.PROFILE);
      }
    }
  }

  setWarungId(id: string) {
    this.activeWarungId = id;
    this.setupCloudSync();
  }

  private sanitizeForFirestore(obj: any): any {
    return JSON.parse(
      JSON.stringify(obj, (key, value) => {
        return value === undefined ? null : value;
      })
    );
  }

  private setupCloudSync() {
    if (!this.activeWarungId) return;

    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];

    const unsubProducts = onSnapshot(collection(db_fs, `warungs/${this.activeWarungId}/products`), (snapshot) => {
      const products: any[] = [];
      snapshot.forEach((doc) => products.push(doc.data()));
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
      window.dispatchEvent(new Event("products-updated"));
    });

    const unsubSuppliers = onSnapshot(collection(db_fs, `warungs/${this.activeWarungId}/suppliers`), (snapshot) => {
      const suppliers: any[] = [];
      snapshot.forEach((doc) => suppliers.push(doc.data()));
      localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(suppliers));
      window.dispatchEvent(new Event("suppliers-updated"));
    });

    const unsubSettings = onSnapshot(doc(db_fs, `warungs/${this.activeWarungId}/config/settings`), (snapshot) => {
      if (snapshot.exists()) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(snapshot.data()));
        window.dispatchEvent(new Event("settings-updated"));
      }
    });

    this.unsubscribers.push(unsubProducts, unsubSuppliers, unsubSettings);
  }

  async getUserProfile(uid: string, retryCount = 0): Promise<UserProfile | null> {
    try {
      const userDoc = await getDoc(doc(db_fs, "users", uid));
      if (userDoc.exists()) {
        const profile = userDoc.data() as UserProfile;
        localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
        this.activeWarungId = profile.warungId;
        return profile;
      }
    } catch (e: any) {
      if (retryCount < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return this.getUserProfile(uid, retryCount + 1);
      }
    }
    return null;
  }

  // --- Suppliers ---
  getSuppliers(): Supplier[] {
    const data = localStorage.getItem(STORAGE_KEYS.SUPPLIERS);
    return data ? JSON.parse(data) : [];
  }

  async saveSupplier(supplier: Supplier): Promise<void> {
    if (!this.activeWarungId) return;
    const suppliers = this.getSuppliers();
    const index = suppliers.findIndex((s) => s.id === supplier.id);
    const updatedSupplier = { ...supplier, updatedAt: Date.now() };

    if (index >= 0) suppliers[index] = updatedSupplier;
    else suppliers.push(updatedSupplier);

    localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(suppliers));
    try {
      await setDoc(doc(db_fs, `warungs/${this.activeWarungId}/suppliers`, supplier.id), this.sanitizeForFirestore(updatedSupplier));
    } catch (e) {
      console.error(e);
    }
  }

  async deleteSupplier(id: string): Promise<void> {
    if (!this.activeWarungId) return;
    const suppliers = this.getSuppliers().filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(suppliers));
    await deleteDoc(doc(db_fs, `warungs/${this.activeWarungId}/suppliers`, id));
  }

  // --- Staff ---
  async getStaff(): Promise<UserProfile[]> {
    if (!this.activeWarungId) return [];
    try {
      const q = query(collection(db_fs, "users"), where("warungId", "==", this.activeWarungId));
      const snapshot = await getDocs(q);
      const staff: UserProfile[] = [];
      snapshot.forEach((doc) => staff.push(doc.data() as UserProfile));
      return staff;
    } catch (e) {
      return [];
    }
  }

  async updateUserStatus(uid: string, active: boolean): Promise<void> {
    await updateDoc(doc(db_fs, "users", uid), { active });
  }

  // --- Stock & Products ---
  async saveStockLog(log: StockLog): Promise<void> {
    if (!this.activeWarungId) return;
    const logs = this.getStockLogs();
    logs.unshift(log);
    localStorage.setItem(STORAGE_KEYS.STOCK_LOGS, JSON.stringify(logs.slice(0, 100)));
    try {
      await setDoc(doc(db_fs, `warungs/${this.activeWarungId}/stock_logs`, log.id), this.sanitizeForFirestore(log));
    } catch (e) {
      console.error(e);
    }
  }

  getStockLogs(): StockLog[] {
    const data = localStorage.getItem(STORAGE_KEYS.STOCK_LOGS);
    return data ? JSON.parse(data) : [];
  }

  async fetchRemoteStockLogs(): Promise<StockLog[]> {
    if (!this.activeWarungId) return [];
    try {
      const q = query(collection(db_fs, `warungs/${this.activeWarungId}/stock_logs`), orderBy("timestamp", "desc"), limit(50));
      const snapshot = await getDocs(q);
      const logs: StockLog[] = [];
      snapshot.forEach((doc) => logs.push(doc.data() as StockLog));
      localStorage.setItem(STORAGE_KEYS.STOCK_LOGS, JSON.stringify(logs));
      return logs;
    } catch (e) {
      return this.getStockLogs();
    }
  }

  getProducts(): Product[] {
    const data = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    return data ? JSON.parse(data) : [];
  }

  async saveProduct(product: Product, log?: StockLog): Promise<void> {
    if (!this.activeWarungId) return;
    const products = this.getProducts();
    const index = products.findIndex((p) => p.id === product.id);
    const updatedProduct = { ...product, updatedAt: Date.now() };

    if (index >= 0) products[index] = updatedProduct;
    else products.push(updatedProduct);

    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));

    try {
      await setDoc(doc(db_fs, `warungs/${this.activeWarungId}/products`, product.id), this.sanitizeForFirestore(updatedProduct));
      if (log) await this.saveStockLog(log);
    } catch (e) {
      console.error(e);
    }
  }

  async saveProductsBulk(newProducts: Product[]): Promise<void> {
    if (!this.activeWarungId) return;
    const batch = writeBatch(db_fs);
    const existingProducts = this.getProducts();

    newProducts.forEach((p) => {
      const ref = doc(db_fs, `warungs/${this.activeWarungId}/products`, p.id);
      batch.set(ref, this.sanitizeForFirestore(p));
    });

    await batch.commit();
    // Update local storage will happen via onSnapshot
  }

  async deleteProduct(id: string): Promise<void> {
    if (!this.activeWarungId) return;
    const products = this.getProducts().filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    await deleteDoc(doc(db_fs, `warungs/${this.activeWarungId}/products`, id));
  }

  // --- Transactions ---
  getTransactions(): Transaction[] {
    const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    return data ? JSON.parse(data) : [];
  }

  async createTransaction(transaction: Transaction): Promise<void> {
    if (!this.activeWarungId) return;
    const profileStr = localStorage.getItem(STORAGE_KEYS.PROFILE);
    const user = profileStr ? JSON.parse(profileStr) : { displayName: "Kasir" };

    const transactions = this.getTransactions();
    transactions.unshift(transaction);
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));

    const products = this.getProducts();
    for (const item of transaction.items) {
      const pIdx = products.findIndex((p) => p.id === item.productId);
      if (pIdx >= 0) {
        const oldStock = products[pIdx].stock;
        const qtyToReduce = item.quantity * item.conversion;
        products[pIdx].stock -= qtyToReduce;

        const log: StockLog = {
          id: `LOG-SALE-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          productId: item.productId,
          productName: item.productName,
          type: "OUT",
          logType: "SALE",
          quantity: item.quantity,
          unitName: item.unitName,
          previousStock: oldStock,
          currentStock: products[pIdx].stock,
          reason: `Penjualan (Struk: ${transaction.id.split("-")[1]})`,
          operatorName: user.displayName || "Kasir",
          timestamp: Date.now(),
        };
        await this.saveProduct(products[pIdx], log);
      }
    }

    try {
      await setDoc(doc(db_fs, `warungs/${this.activeWarungId}/transactions`, transaction.id), this.sanitizeForFirestore(transaction));
    } catch (e) {
      console.error(e);
    }
  }

  // --- Customers ---
  getCustomers(): Customer[] {
    const data = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
    return data ? JSON.parse(data) : [];
  }

  async saveCustomer(customer: Customer): Promise<void> {
    if (!this.activeWarungId) return;
    const customers = this.getCustomers();
    const index = customers.findIndex((c) => c.id === customer.id);
    if (index >= 0) customers[index] = customer;
    else customers.push(customer);
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
    try {
      await setDoc(doc(db_fs, `warungs/${this.activeWarungId}/customers`, customer.id), this.sanitizeForFirestore(customer));
    } catch (e) {}
  }

  async deleteCustomer(id: string): Promise<void> {
    if (!this.activeWarungId) return;
    const customers = this.getCustomers().filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
    await deleteDoc(doc(db_fs, `warungs/${this.activeWarungId}/customers`, id));
  }

  // --- Settings ---
  getSettings(): AppSettings {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const settings = data ? JSON.parse(data) : DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...settings };
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    if (!this.activeWarungId) return;
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    window.dispatchEvent(new Event("settings-updated"));
    try {
      await setDoc(doc(db_fs, `warungs/${this.activeWarungId}/config/settings`, "settings"), this.sanitizeForFirestore(settings));
    } catch (e) {}
  }

  exportDatabase(): string {
    return JSON.stringify(
      {
        products: this.getProducts(),
        transactions: this.getTransactions(),
        customers: this.getCustomers(),
        suppliers: this.getSuppliers(),
        settings: this.getSettings(),
        timestamp: Date.now(),
      },
      null,
      2
    );
  }

  resetWithDemoData(): void {
    localStorage.clear();
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
  }
}

export const db = new DBService();
