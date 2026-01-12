import { Product, Transaction, AppSettings, Customer, UserProfile, Supplier, Procurement, DebtPayment } from "../types";
import { db_fs, auth } from "./firebase";
import { doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, writeBatch, getDocs } from "firebase/firestore";

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

          onSnapshot(collection(db_fs, `warungs/${warungId}/transactions`), (snapshot) => {
            const txs: Transaction[] = [];
            snapshot.forEach((doc) => txs.push(doc.data() as Transaction));
            localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(txs));
            window.dispatchEvent(new Event("transactions-updated"));
          });
        }
      }
    });
  }

  async wipeAllData(): Promise<void> {
    if (!this.profile?.warungId) return;
    const wid = this.profile.warungId;

    // Clear LocalStorage dulu (Biar tampilan langsung bersih)
    const keysToClear = [STORAGE_KEYS.PRODUCTS, STORAGE_KEYS.TRANSACTIONS, STORAGE_KEYS.CUSTOMERS, STORAGE_KEYS.SUPPLIERS, STORAGE_KEYS.PROCUREMENT, STORAGE_KEYS.DEBT_PAYMENTS];
    keysToClear.forEach((key) => localStorage.removeItem(key));

    const collectionNames = ["products", "transactions", "customers", "suppliers", "procurements", "debt_payments"];

    try {
      for (const colName of collectionNames) {
        const colRef = collection(db_fs, `warungs/${wid}/${colName}`);
        const snapshot = await getDocs(colRef);
        if (snapshot.empty) continue;

        const batch = writeBatch(db_fs);
        snapshot.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (error) {
      console.error("Gagal membersihkan data cloud:", error);
      throw error;
    }

    this.notifyAll();
  }

  async injectDemoData(): Promise<void> {
    if (!this.profile?.warungId) return;
    const wid = this.profile.warungId;
    const now = Date.now();

    await this.wipeAllData();

    const batch = writeBatch(db_fs);

    const suppliers: Supplier[] = [
      { id: "S-DEMO-1", name: "PT Sembako Makmur", contact: "081122334455", address: "Pasar Induk Kramat Jati", description: "Supplier beras dan minyak" },
      { id: "S-DEMO-2", name: "Distributor Mie Jaya", contact: "085566778899", address: "Kawasan Industri Jababeka", description: "Spesialis mie instan" },
    ];

    const products: Product[] = [
      {
        id: "P-DEMO-1",
        name: "Indomie Goreng Original",
        sku: "071295057937",
        category: "Mie Instan",
        baseUnit: "Bks",
        stock: 120,
        minStockAlert: 20,
        updatedAt: now,
        supplierId: "S-DEMO-2",
        units: [
          { name: "Bks", conversion: 1, price: 3500, buyPrice: 2800 },
          { name: "Dus", conversion: 40, price: 130000, buyPrice: 110000 },
        ],
      },
      {
        id: "P-DEMO-2",
        name: "Beras Rojo Lele 1L",
        sku: "BRS-001",
        category: "Sembako",
        baseUnit: "Liter",
        stock: 50,
        minStockAlert: 10,
        updatedAt: now,
        supplierId: "S-DEMO-1",
        units: [
          { name: "Liter", conversion: 1, price: 12500, buyPrice: 10500 },
          { name: "Karung", conversion: 25, price: 295000, buyPrice: 260000 },
        ],
      },
      {
        id: "P-DEMO-3",
        name: "Le Minerale 600ml",
        sku: "LM-600",
        category: "Minuman",
        baseUnit: "Botol",
        stock: 48,
        minStockAlert: 12,
        updatedAt: now,
        units: [
          { name: "Botol", conversion: 1, price: 4000, buyPrice: 3000 },
          { name: "Karton", conversion: 24, price: 85000, buyPrice: 70000 },
        ],
      },
    ];

    const customers: Customer[] = [
      { id: "C-DEMO-1", name: "Ibu Budi (Tetangga)", phone: "081234567890", tier: "Gold", totalSpent: 1500000, debtBalance: 75000, joinedAt: now - 86400000 * 30 },
      { id: "C-DEMO-2", name: "Pak RT", phone: "089988776655", tier: "Silver", totalSpent: 500000, debtBalance: 0, joinedAt: now - 86400000 * 15 },
    ];

    // Push ke Batch
    suppliers.forEach((s) => batch.set(doc(db_fs, `warungs/${wid}/suppliers`, s.id), this.sanitizeForFirestore(s)));
    products.forEach((p) => batch.set(doc(db_fs, `warungs/${wid}/products`, p.id), this.sanitizeForFirestore(p)));
    customers.forEach((c) => batch.set(doc(db_fs, `warungs/${wid}/customers`, c.id), this.sanitizeForFirestore(c)));

    try {
      await batch.commit();

      // PERBAIKAN UTAMA: Update LocalStorage secara MANUAL sekarang juga!
      // Jangan nunggu Cloud Sync, biar data langsung muncul di layar user.
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
      localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
      localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(suppliers));

      this.notifyAll();
    } catch (error) {
      console.error("Gagal injeksi data demo:", error);
      throw error;
    }
  }

  private notifyAll() {
    const events = ["products-updated", "customers-updated", "transactions-updated", "suppliers-updated", "debt-payments-updated"];
    events.forEach((e) => window.dispatchEvent(new Event(e)));
  }

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
    if (this.profile?.warungId) await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/customers`, c.id), this.sanitizeForFirestore(c));
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
    const customers = this.getCustomers();
    const custIdx = customers.findIndex((c) => c.id === payment.customerId);
    if (custIdx >= 0) {
      customers[custIdx].debtBalance -= payment.amount;
      await this.saveCustomer(customers[custIdx]);
    }
    if (this.profile?.warungId) await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/debt_payments`, payment.id), this.sanitizeForFirestore(payment));
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
    if (transaction.paymentMethod === "debt" && transaction.customerId) {
      const customers = this.getCustomers();
      const custIdx = customers.findIndex((c) => c.id === transaction.customerId);
      if (custIdx >= 0) {
        customers[custIdx].debtBalance = (customers[custIdx].debtBalance || 0) + transaction.totalAmount;
        customers[custIdx].totalSpent += transaction.totalAmount;
        await this.saveCustomer(customers[custIdx]);
      }
    } else if (transaction.customerId) {
      const customers = this.getCustomers();
      const custIdx = customers.findIndex((c) => c.id === transaction.customerId);
      if (custIdx >= 0) {
        customers[custIdx].totalSpent += transaction.totalAmount;
        await this.saveCustomer(customers[custIdx]);
      }
    }
    if (this.profile?.warungId) await setDoc(doc(db_fs, `warungs/${this.profile.warungId}/transactions`, transaction.id), this.sanitizeForFirestore(transaction));
  }

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
    window.dispatchEvent(new Event("updated-customers"));
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
