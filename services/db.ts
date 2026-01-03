import { Product, Transaction, AppSettings, Customer, UserProfile } from "../types";
import { db_fs, auth } from "./firebase";
import { doc, setDoc, collection, deleteDoc, onSnapshot, getDoc, query, where, getDocs, updateDoc } from "firebase/firestore";

const STORAGE_KEYS = {
  PRODUCTS: "warung_products",
  TRANSACTIONS: "warung_transactions",
  CUSTOMERS: "warung_customers",
  SETTINGS: "warung_settings",
  PROFILE: "warung_user_profile",
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

    // Bersihkan listener lama jika ada
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];

    // Sync Products
    const unsubProducts = onSnapshot(
      collection(db_fs, `warungs/${this.activeWarungId}/products`),
      (snapshot) => {
        const products: any[] = [];
        snapshot.forEach((doc) => products.push(doc.data()));
        if (products.length > 0) {
          localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
          window.dispatchEvent(new Event("products-updated"));
        }
      },
      (error) => {
        console.error("Firestore Products Sync Error:", error);
        if (error.code === "permission-denied") {
          console.warn("Akses ditolak. Pastikan Security Rules sudah diupdate.");
        }
      }
    );

    // Sync Settings
    const unsubSettings = onSnapshot(
      doc(db_fs, `warungs/${this.activeWarungId}/config/settings`),
      (snapshot) => {
        if (snapshot.exists()) {
          localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(snapshot.data()));
          window.dispatchEvent(new Event("settings-updated"));
        }
      },
      (error) => {
        console.error("Firestore Settings Sync Error:", error);
      }
    );

    this.unsubscribers.push(unsubProducts, unsubSettings);
  }

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
      const userDoc = await getDoc(doc(db_fs, "users", uid));
      if (userDoc.exists()) {
        const profile = userDoc.data() as UserProfile;
        localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
        this.activeWarungId = profile.warungId;
        return profile;
      }
    } catch (e) {
      console.error("Error fetching user profile:", e);
    }
    return null;
  }

  // --- STAFF MANAGEMENT ---
  async getStaff(): Promise<UserProfile[]> {
    if (!this.activeWarungId) return [];
    try {
      const q = query(collection(db_fs, "users"), where("warungId", "==", this.activeWarungId));
      const snapshot = await getDocs(q);
      const staff: UserProfile[] = [];
      snapshot.forEach((doc) => staff.push(doc.data() as UserProfile));
      return staff;
    } catch (e) {
      console.error("Error fetching staff:", e);
      return [];
    }
  }

  async updateUserStatus(uid: string, active: boolean): Promise<void> {
    try {
      await updateDoc(doc(db_fs, "users", uid), { active });
    } catch (e) {
      console.error("Error updating user status:", e);
      throw e;
    }
  }

  // --- PRODUCTS ---
  getProducts(): Product[] {
    const data = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    return data ? JSON.parse(data) : [];
  }

  async saveProduct(product: Product): Promise<void> {
    if (!this.activeWarungId) return;
    const products = this.getProducts();
    const index = products.findIndex((p) => p.id === product.id);
    const updatedProduct = { ...product, updatedAt: Date.now() };

    if (index >= 0) products[index] = updatedProduct;
    else products.push(updatedProduct);

    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));

    try {
      const sanitized = this.sanitizeForFirestore(updatedProduct);
      await setDoc(doc(db_fs, `warungs/${this.activeWarungId}/products`, product.id), sanitized);
    } catch (e) {
      console.error("Error saving product to cloud:", e);
    }
  }

  async deleteProduct(id: string): Promise<void> {
    if (!this.activeWarungId) return;
    const products = this.getProducts().filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    try {
      await deleteDoc(doc(db_fs, `warungs/${this.activeWarungId}/products`, id));
    } catch (e) {
      console.error("Error deleting product from cloud:", e);
    }
  }

  // --- TRANSACTIONS ---
  getTransactions(): Transaction[] {
    const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    return data ? JSON.parse(data) : [];
  }

  async createTransaction(transaction: Transaction): Promise<void> {
    if (!this.activeWarungId) return;
    const transactions = this.getTransactions();
    transactions.unshift(transaction);
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));

    const products = this.getProducts();
    transaction.items.forEach((item) => {
      const productIndex = products.findIndex((p) => p.id === item.productId);
      if (productIndex >= 0) {
        products[productIndex].stock -= item.quantity * item.conversion;
        this.saveProduct(products[productIndex]);
      }
    });

    try {
      const sanitized = this.sanitizeForFirestore(transaction);
      await setDoc(doc(db_fs, `warungs/${this.activeWarungId}/transactions`, transaction.id), sanitized);
    } catch (e) {
      console.error("Error saving transaction to cloud:", e);
    }
  }

  // --- CUSTOMERS ---
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
      const sanitized = this.sanitizeForFirestore(customer);
      await setDoc(doc(db_fs, `warungs/${this.activeWarungId}/customers`, customer.id), sanitized);
    } catch (e) {
      console.error("Error saving customer to cloud:", e);
    }
  }

  async deleteCustomer(id: string): Promise<void> {
    if (!this.activeWarungId) return;
    const customers = this.getCustomers().filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
    try {
      await deleteDoc(doc(db_fs, `warungs/${this.activeWarungId}/customers`, id));
    } catch (e) {
      console.error("Error deleting customer from cloud:", e);
    }
  }

  // --- SETTINGS ---
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
      const sanitized = this.sanitizeForFirestore(settings);
      await setDoc(doc(db_fs, `warungs/${this.activeWarungId}/config/settings`, "settings"), sanitized);
    } catch (e) {
      console.error("Error saving settings to cloud:", e);
    }
  }

  exportDatabase(): string {
    return JSON.stringify(
      {
        products: this.getProducts(),
        transactions: this.getTransactions(),
        customers: this.getCustomers(),
        settings: this.getSettings(),
        timestamp: Date.now(),
      },
      null,
      2
    );
  }

  importDatabase(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(data.products || []));
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(data.transactions || []));
      localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(data.customers || []));
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data.settings || DEFAULT_SETTINGS));
      return true;
    } catch (e) {
      return false;
    }
  }

  resetWithDemoData(): void {
    localStorage.removeItem(STORAGE_KEYS.PRODUCTS);
    localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
    localStorage.removeItem(STORAGE_KEYS.CUSTOMERS);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
  }
}

export const db = new DBService();
