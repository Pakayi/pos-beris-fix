import { Product, Transaction, AppSettings, Customer, UserProfile } from "../types";
import { db_fs, auth } from "./firebase";
import { doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, query, orderBy } from "firebase/firestore";

const STORAGE_KEYS = {
  PRODUCTS: "warung_products",
  TRANSACTIONS: "warung_transactions",
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
  private profile: UserProfile | null = null;

  constructor() {
    this.init();
    this.setupCloudSync();
  }

  private init() {
    if (!localStorage.getItem(STORAGE_KEYS.INIT)) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
      localStorage.setItem(STORAGE_KEYS.INIT, "true");
    }
    const cachedProfile = localStorage.getItem(STORAGE_KEYS.PROFILE);
    if (cachedProfile) this.profile = JSON.parse(cachedProfile);
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
        // 1. Ambil Profil User Terlebih Dahulu untuk dapat warungId
        const profileDoc = await getDoc(doc(db_fs, "users", user.uid));
        if (profileDoc.exists()) {
          const profileData = profileDoc.data() as UserProfile;
          this.profile = profileData;
          localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profileData));
          window.dispatchEvent(new Event("profile-updated"));

          // 2. Jika sudah ada warungId, sync data dari koleksi /warungs/{warungId}/
          const warungId = profileData.warungId;

          // Sync Settings
          onSnapshot(doc(db_fs, `warungs/${warungId}/config`, "settings"), (docSnap) => {
            if (docSnap.exists()) {
              localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(docSnap.data()));
              window.dispatchEvent(new Event("settings-updated"));
            }
          });

          // Sync Products
          onSnapshot(collection(db_fs, `warungs/${warungId}/products`), (snapshot) => {
            const products: Product[] = [];
            snapshot.forEach((doc) => products.push(doc.data() as Product));
            if (products.length > 0) {
              localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
              window.dispatchEvent(new Event("products-updated"));
            }
          });

          // Sync Customers
          onSnapshot(collection(db_fs, `warungs/${warungId}/customers`), (snapshot) => {
            const customers: Customer[] = [];
            snapshot.forEach((doc) => customers.push(doc.data() as Customer));
            if (customers.length > 0) {
              localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
              window.dispatchEvent(new Event("customers-updated"));
            }
          });

          // Sync Transactions (Optional: limit to last 100 for performance)
          // onSnapshot(query(collection(db_fs, `warungs/${warungId}/transactions`), orderBy('timestamp', 'desc')), (snapshot) => { ... });
        }
      }
    });
  }

  // --- USER PROFILE & ROLE ---
  getUserProfile(): UserProfile | null {
    return this.profile;
  }

  async saveUserProfile(profile: UserProfile): Promise<void> {
    this.profile = profile;
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));

    // Simpan ke /users/{uid}
    await setDoc(doc(db_fs, "users", profile.uid), this.sanitizeForFirestore(profile));

    // Jika owner, inisialisasi entitas warung di /warungs/{warungId}
    if (profile.role === "owner") {
      await setDoc(
        doc(db_fs, "warungs", profile.warungId),
        {
          name: profile.displayName + " Store",
          ownerId: profile.uid,
          createdAt: Date.now(),
        },
        { merge: true }
      );
    }

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

    if (this.profile?.warungId) {
      const sanitized = this.sanitizeForFirestore(updatedProduct);
      await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/products`, product.id), sanitized);
    }
  }

  async deleteProduct(id: string): Promise<void> {
    const products = this.getProducts().filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    if (this.profile?.warungId) {
      await deleteDoc(doc(db_fs, `warungs/${this.profile.warungId}/products`, id));
    }
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

    // Update Stok Lokal
    const products = this.getProducts();
    transaction.items.forEach((item) => {
      const productIndex = products.findIndex((p) => p.id === item.productId);
      if (productIndex >= 0) {
        products[productIndex].stock -= item.quantity * item.conversion;
        this.saveProduct(products[productIndex]);
      }
    });

    // Simpan ke Cloud
    if (this.profile?.warungId) {
      const sanitized = this.sanitizeForFirestore(transaction);
      await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/transactions`, transaction.id), sanitized);
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

    if (this.profile?.warungId) {
      const sanitized = this.sanitizeForFirestore(customer);
      await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/customers`, customer.id), sanitized);
    }
  }

  async deleteCustomer(id: string): Promise<void> {
    const customers = this.getCustomers().filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
    if (this.profile?.warungId) {
      await deleteDoc(doc(db_fs, `warungs/${this.profile.warungId}/customers`, id));
    }
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

    if (this.profile?.warungId) {
      const sanitized = this.sanitizeForFirestore(settings);
      await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/config`, "settings"), sanitized);
    }
  }

  resetWithDemoData() {
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    window.location.reload();
  }
}

export const db = new DBService();
