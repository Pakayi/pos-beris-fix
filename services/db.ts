import { Product, Transaction, AppSettings, Customer, UserProfile, Supplier, Procurement } from "../types";
import { db_fs, auth } from "./firebase";
import { doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, query, orderBy } from "firebase/firestore";

const STORAGE_KEYS = {
  PRODUCTS: "warung_products",
  TRANSACTIONS: "warung_transactions",
  CUSTOMERS: "warung_customers",
  SETTINGS: "warung_settings",
  PROFILE: "warung_user_profile",
  SUPPLIERS: "warung_suppliers",
  PROCUREMENT: "warung_procurement",
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
        const profileDoc = await getDoc(doc(db_fs, "users", user.uid));
        if (profileDoc.exists()) {
          const profileData = profileDoc.data() as UserProfile;
          this.profile = profileData;
          localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profileData));
          window.dispatchEvent(new Event("profile-updated"));

          const warungId = profileData.warungId;

          onSnapshot(doc(db_fs, `warungs/${warungId}/config`, "settings"), (docSnap) => {
            if (docSnap.exists()) {
              localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(docSnap.data()));
              window.dispatchEvent(new Event("settings-updated"));
            }
          });

          onSnapshot(collection(db_fs, `warungs/${warungId}/products`), (snapshot) => {
            const products: Product[] = [];
            snapshot.forEach((doc) => products.push(doc.data() as Product));
            if (products.length > 0) {
              localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
              window.dispatchEvent(new Event("products-updated"));
            }
          });

          onSnapshot(collection(db_fs, `warungs/${warungId}/suppliers`), (snapshot) => {
            const suppliers: Supplier[] = [];
            snapshot.forEach((doc) => suppliers.push(doc.data() as Supplier));
            localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(suppliers));
            window.dispatchEvent(new Event("suppliers-updated"));
          });
        }
      }
    });
  }

  // --- SUPPLIERS ---
  getSuppliers(): Supplier[] {
    const data = localStorage.getItem(STORAGE_KEYS.SUPPLIERS);
    return data ? JSON.parse(data) : [];
  }

  async saveSupplier(supplier: Supplier): Promise<void> {
    const suppliers = this.getSuppliers();
    const index = suppliers.findIndex((s) => s.id === supplier.id);
    if (index >= 0) suppliers[index] = supplier;
    else suppliers.push(supplier);
    localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(suppliers));

    if (this.profile?.warungId) {
      await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/suppliers`, supplier.id), this.sanitizeForFirestore(supplier));
    }
  }

  async deleteSupplier(id: string): Promise<void> {
    const suppliers = this.getSuppliers().filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(suppliers));
    if (this.profile?.warungId) {
      await deleteDoc(doc(db_fs, `warungs/${this.profile.warungId}/suppliers`, id));
    }
  }

  // --- PROCUREMENT (STOK MASUK) ---
  getProcurements(): Procurement[] {
    const data = localStorage.getItem(STORAGE_KEYS.PROCUREMENT);
    return data ? JSON.parse(data) : [];
  }

  async createProcurement(procurement: Procurement): Promise<void> {
    const procurements = this.getProcurements();
    procurements.unshift(procurement);
    localStorage.setItem(STORAGE_KEYS.PROCUREMENT, JSON.stringify(procurements));

    // Update Stok & Harga Beli Barang
    const products = this.getProducts();
    procurement.items.forEach((item) => {
      const productIndex = products.findIndex((p) => p.id === item.productId);
      if (productIndex >= 0) {
        // Tambah stok (dalam satuan dasar/konversi)
        // Note: Asumsi unitName di procurement sudah dipetakan ke konversi yang benar
        const product = products[productIndex];
        const unit = product.units.find((u) => u.name === item.unitName);
        const conversion = unit ? unit.conversion : 1;

        product.stock += item.quantity * conversion;

        // Update harga beli terakhir di satuan terkait
        if (unit) {
          unit.buyPrice = item.buyPrice;
        }

        this.saveProduct(product);
      }
    });

    if (this.profile?.warungId) {
      await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/procurements`, procurement.id), this.sanitizeForFirestore(procurement));
    }
  }

  // --- EXISTING METHODS (PROFILES, PRODUCTS, TRANSACTIONS, CUSTOMERS, SETTINGS) ---
  getUserProfile(): UserProfile | null {
    return this.profile;
  }
  async saveUserProfile(profile: UserProfile): Promise<void> {
    this.profile = profile;
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
    await setDoc(doc(db_fs, "users", profile.uid), this.sanitizeForFirestore(profile));
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
      await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/products`, product.id), this.sanitizeForFirestore(updatedProduct));
    }
  }
  async deleteProduct(id: string): Promise<void> {
    const products = this.getProducts().filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    if (this.profile?.warungId) {
      await deleteDoc(doc(db_fs, `warungs/${this.profile.warungId}/products`, id));
    }
  }

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
    if (this.profile?.warungId) {
      await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/transactions`, transaction.id), this.sanitizeForFirestore(transaction));
    }
  }

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
      await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/customers`, customer.id), this.sanitizeForFirestore(customer));
    }
  }
  async deleteCustomer(id: string): Promise<void> {
    const customers = this.getCustomers().filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
    if (this.profile?.warungId) {
      await deleteDoc(doc(db_fs, `warungs/${this.profile.warungId}/customers`, id));
    }
  }

  getSettings(): AppSettings {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    return data ? JSON.parse(data) : DEFAULT_SETTINGS;
  }
  async saveSettings(settings: AppSettings): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    window.dispatchEvent(new Event("settings-updated"));
    if (this.profile?.warungId) {
      await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/config`, "settings"), this.sanitizeForFirestore(settings));
    }
  }
}

export const db = new DBService();
