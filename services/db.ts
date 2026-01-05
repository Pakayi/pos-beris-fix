// FIX: Removed non-existent 'Category' and unused 'CartItem', 'UserRole' imports
import { Product, Transaction, AppSettings, Customer, UserProfile } from "../types";
import { db_fs, auth } from "./firebase";
import { doc, setDoc, getDoc, collection, onSnapshot, deleteDoc } from "firebase/firestore";

const STORAGE_KEYS = {
  PRODUCTS: "warung_products",
  TRANSACTIONS: "warung_transactions",
  CATEGORIES: "warung_categories",
  CUSTOMERS: "warung_customers",
  SETTINGS: "warung_settings",
  PROFILE: "warung_user_profile",
  INIT: "warung_initialized",
};

const DEFAULT_SETTINGS: AppSettings = {
  storeName: "Warung Sejahtera",
  storeAddress: "Jl. Merdeka No. 45, Jakarta Selatan",
  storePhone: "0812-9988-7766",
  enableTax: false,
  taxRate: 11,
  footerMessage: "Terima kasih, selamat belanja kembali!",
  showLogo: true,
  logoUrl: null,
  securityPin: null,
  printerName: null,
  tierDiscounts: { bronze: 0, silver: 2, gold: 5 },
};

class DBService {
  constructor() {
    this.init();
    this.setupCloudSync();
  }

  private init() {
    if (!localStorage.getItem(STORAGE_KEYS.INIT)) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
      localStorage.setItem(STORAGE_KEYS.INIT, "true");
    }
  }

  private sanitizeForFirestore(obj: any): any {
    return JSON.parse(
      JSON.stringify(obj, (key, value) => {
        return value === undefined ? null : value;
      })
    );
  }

  private setupCloudSync() {
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        // Sync Profile
        const profileDoc = await getDoc(doc(db_fs, "users", user.uid));
        if (profileDoc.exists()) {
          localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profileDoc.data()));
          window.dispatchEvent(new Event("profile-updated"));
        }

        // Sync Products
        onSnapshot(collection(db_fs, `users/${user.uid}/products`), (snapshot) => {
          const products: any[] = [];
          snapshot.forEach((doc) => products.push(doc.data()));
          if (products.length > 0) {
            localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
            window.dispatchEvent(new Event("products-updated"));
          }
        });
      }
    });
  }

  // --- USER PROFILE & ROLE ---
  getUserProfile(): UserProfile | null {
    const data = localStorage.getItem(STORAGE_KEYS.PROFILE);
    return data ? JSON.parse(data) : null;
  }

  async saveUserProfile(profile: UserProfile): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
    const sanitized = this.sanitizeForFirestore(profile);
    await setDoc(doc(db_fs, "users", profile.uid), sanitized);
    window.dispatchEvent(new Event("profile-updated"));
  }

  // --- PRODUCTS ---
  getProducts(): Product[] {
    const data = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    return data ? JSON.parse(data) : [];
  }

  async saveProduct(product: Product): Promise<void> {
    const products = this.getProducts();
    const index = products.findIndex((p) => p.id === product.id);
    const updatedProduct = { ...product, updatedAt: Date.now() };

    if (index >= 0) products[index] = updatedProduct;
    else products.push(updatedProduct);

    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));

    const user = auth.currentUser;
    if (user) {
      try {
        const sanitized = this.sanitizeForFirestore(updatedProduct);
        await setDoc(doc(db_fs, `users/${user.uid}/products`, product.id), sanitized);
      } catch (e) {
        console.error(e);
      }
    }
  }

  async deleteProduct(id: string): Promise<void> {
    const products = this.getProducts().filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    const user = auth.currentUser;
    if (user) await deleteDoc(doc(db_fs, `users/${user.uid}/products`, id));
  }

  // --- TRANSACTIONS ---
  getTransactions(): Transaction[] {
    const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    return data ? JSON.parse(data) : [];
  }

  async createTransaction(transaction: Transaction): Promise<void> {
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

    const user = auth.currentUser;
    if (user) {
      try {
        const sanitized = this.sanitizeForFirestore(transaction);
        await setDoc(doc(db_fs, `users/${user.uid}/transactions`, transaction.id), sanitized);
      } catch (e) {
        console.error(e);
      }
    }
  }

  // --- CUSTOMERS ---
  getCustomers(): Customer[] {
    const data = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
    return data ? JSON.parse(data) : [];
  }

  async saveCustomer(customer: Customer): Promise<void> {
    const customers = this.getCustomers();
    const index = customers.findIndex((c) => c.id === customer.id);
    if (index >= 0) customers[index] = customer;
    else customers.push(customer);
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
    const user = auth.currentUser;
    if (user) {
      try {
        const sanitized = this.sanitizeForFirestore(customer);
        await setDoc(doc(db_fs, `users/${user.uid}/customers`, customer.id), sanitized);
      } catch (e) {
        console.error(e);
      }
    }
  }

  async deleteCustomer(id: string): Promise<void> {
    const customers = this.getCustomers().filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
    const user = auth.currentUser;
    if (user) await deleteDoc(doc(db_fs, `users/${user.uid}/customers`, id));
  }

  // --- SETTINGS ---
  getSettings(): AppSettings {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const settings = data ? JSON.parse(data) : DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...settings };
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    window.dispatchEvent(new Event("settings-updated"));
    const user = auth.currentUser;
    if (user) {
      try {
        const sanitized = this.sanitizeForFirestore(settings);
        await setDoc(doc(db_fs, `users/${user.uid}/config`, "settings"), sanitized);
      } catch (e) {
        console.error(e);
      }
    }
  }

  resetWithDemoData() {
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    window.location.reload();
  }

  exportDatabase(): string {
    const data = {
      products: this.getProducts(),
      transactions: this.getTransactions(),
      customers: this.getCustomers(),
      settings: this.getSettings(),
      timestamp: Date.now(),
    };
    return JSON.stringify(data, null, 2);
  }

  importDatabase(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(data.products || []));
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(data.transactions || []));
      localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(data.customers || []));
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data.settings || DEFAULT_SETTINGS));
      localStorage.setItem(STORAGE_KEYS.INIT, "true");
      return true;
    } catch (e) {
      return false;
    }
  }
}

export const db = new DBService();
