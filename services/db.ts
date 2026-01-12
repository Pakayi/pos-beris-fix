import { Product, Transaction, AppSettings, Customer, UserProfile, Supplier, Procurement, DebtPayment } from "../types";
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
  DEBT_PAYMENTS: "warung_debt_payments",
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
            localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
            window.dispatchEvent(new Event("products-updated"));
          });

          onSnapshot(collection(db_fs, `warungs/${warungId}/customers`), (snapshot) => {
            const customers: Customer[] = [];
            snapshot.forEach((doc) => customers.push(doc.data() as Customer));
            localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
            window.dispatchEvent(new Event("customers-updated"));
          });

          onSnapshot(collection(db_fs, `warungs/${warungId}/debt_payments`), (snapshot) => {
            const payments: DebtPayment[] = [];
            snapshot.forEach((doc) => payments.push(doc.data() as DebtPayment));
            localStorage.setItem(STORAGE_KEYS.DEBT_PAYMENTS, JSON.stringify(payments));
            window.dispatchEvent(new Event("debt-payments-updated"));
          });
        }
      }
    });
  }

  // --- CUSTOMERS & DEBT ---
  getCustomers(): Customer[] {
    const data = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
    return data ? JSON.parse(data) : [];
  }

  async saveCustomer(customer: Customer): Promise<void> {
    const customers = this.getCustomers();
    const index = customers.findIndex((c) => c.id === customer.id);
    const c = { ...customer, debtBalance: customer.debtBalance || 0 };
    if (index >= 0) customers[index] = c;
    else customers.push(c);
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
    if (this.profile?.warungId) {
      await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/customers`, c.id), this.sanitizeForFirestore(c));
    }
    window.dispatchEvent(new Event("customers-updated"));
  }

  getDebtPayments(): DebtPayment[] {
    const data = localStorage.getItem(STORAGE_KEYS.DEBT_PAYMENTS);
    return data ? JSON.parse(data) : [];
  }

  async createDebtPayment(payment: DebtPayment): Promise<void> {
    const payments = this.getDebtPayments();
    payments.unshift(payment);
    localStorage.setItem(STORAGE_KEYS.DEBT_PAYMENTS, JSON.stringify(payments));

    // Update Saldo Hutang Pelanggan
    const customers = this.getCustomers();
    const custIdx = customers.findIndex((c) => c.id === payment.customerId);
    if (custIdx >= 0) {
      customers[custIdx].debtBalance -= payment.amount;
      await this.saveCustomer(customers[custIdx]);
    }

    if (this.profile?.warungId) {
      await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/debt_payments`, payment.id), this.sanitizeForFirestore(payment));
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

    // 1. Kurangi Stok
    const products = this.getProducts();
    transaction.items.forEach((item) => {
      const productIndex = products.findIndex((p) => p.id === item.productId);
      if (productIndex >= 0) {
        products[productIndex].stock -= item.quantity * item.conversion;
        this.saveProduct(products[productIndex]);
      }
    });

    // 2. Jika Hutang, Tambah Saldo Hutang Pelanggan
    if (transaction.paymentMethod === "debt" && transaction.customerId) {
      const customers = this.getCustomers();
      const custIdx = customers.findIndex((c) => c.id === transaction.customerId);
      if (custIdx >= 0) {
        customers[custIdx].debtBalance = (customers[custIdx].debtBalance || 0) + transaction.totalAmount;
        customers[custIdx].totalSpent += transaction.totalAmount;
        await this.saveCustomer(customers[custIdx]);
      }
    } else if (transaction.customerId) {
      // Jika bayar langsung, tetap update total belanja pelanggan
      const customers = this.getCustomers();
      const custIdx = customers.findIndex((c) => c.id === transaction.customerId);
      if (custIdx >= 0) {
        customers[custIdx].totalSpent += transaction.totalAmount;
        await this.saveCustomer(customers[custIdx]);
      }
    }

    if (this.profile?.warungId) {
      await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/transactions`, transaction.id), this.sanitizeForFirestore(transaction));
    }
  }

  // --- OTHER RE-USED METHODS ---
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
    if (this.profile?.warungId) await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/suppliers`, supplier.id), this.sanitizeForFirestore(supplier));
    window.dispatchEvent(new Event("suppliers-updated"));
  }
  async deleteSupplier(id: string): Promise<void> {
    const suppliers = this.getSuppliers().filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(suppliers));
    if (this.profile?.warungId) await deleteDoc(doc(db_fs, `warungs/${this.profile.warungId}/suppliers`, id));
    window.dispatchEvent(new Event("suppliers-updated"));
  }
  getProcurements(): Procurement[] {
    const data = localStorage.getItem(STORAGE_KEYS.PROCUREMENT);
    return data ? JSON.parse(data) : [];
  }
  async createProcurement(procurement: Procurement): Promise<void> {
    const procurements = this.getProcurements();
    procurements.unshift(procurement);
    localStorage.setItem(STORAGE_KEYS.PROCUREMENT, JSON.stringify(procurements));
    const products = this.getProducts();
    procurement.items.forEach((item) => {
      const productIndex = products.findIndex((p) => p.id === item.productId);
      if (productIndex >= 0) {
        const product = products[productIndex];
        const unit = product.units.find((u) => u.name === item.unitName);
        const conversion = unit ? unit.conversion : 1;
        product.stock += item.quantity * conversion;
        if (unit) unit.buyPrice = item.buyPrice;
        this.saveProduct(product);
      }
    });
    if (this.profile?.warungId) await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/procurements`, procurement.id), this.sanitizeForFirestore(procurement));
  }
  getUserProfile(): UserProfile | null {
    return this.profile;
  }
  async saveUserProfile(profile: UserProfile): Promise<void> {
    this.profile = profile;
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
    await setDoc(doc(db_fs, "users", profile.uid), this.sanitizeForFirestore(profile));
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
    if (this.profile?.warungId) await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/products`, product.id), this.sanitizeForFirestore(updatedProduct));
    window.dispatchEvent(new Event("products-updated"));
  }
  async deleteProduct(id: string): Promise<void> {
    const products = this.getProducts().filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    if (this.profile?.warungId) await deleteDoc(doc(db_fs, `warungs/${this.profile.warungId}/products`, id));
    window.dispatchEvent(new Event("products-updated"));
  }
  async deleteCustomer(id: string): Promise<void> {
    const customers = this.getCustomers().filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
    if (this.profile?.warungId) await deleteDoc(doc(db_fs, `warungs/${this.profile.warungId}/customers`, id));
    window.dispatchEvent(new Event("customers-updated"));
  }
  getSettings(): AppSettings {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    return data ? JSON.parse(data) : DEFAULT_SETTINGS;
  }
  async saveSettings(settings: AppSettings): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    window.dispatchEvent(new Event("settings-updated"));
    if (this.profile?.warungId) await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/config`, "settings"), this.sanitizeForFirestore(settings));
  }
}

export const db = new DBService();
