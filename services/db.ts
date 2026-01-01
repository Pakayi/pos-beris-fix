import { Product, Transaction, Category, AppSettings, Customer, CartItem } from "../types";
import { db_fs, auth } from "./firebase";
import { doc, setDoc, collection, getDocs, deleteDoc, onSnapshot, query, orderBy, limit } from "firebase/firestore";

const STORAGE_KEYS = {
  PRODUCTS: "warung_products",
  TRANSACTIONS: "warung_transactions",
  CATEGORIES: "warung_categories",
  CUSTOMERS: "warung_customers",
  SETTINGS: "warung_settings",
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
    auth.onAuthStateChanged((user) => {
      if (user) {
        onSnapshot(
          collection(db_fs, `users/${user.uid}/products`),
          (snapshot) => {
            const products: any[] = [];
            snapshot.forEach((doc) => products.push(doc.data()));
            if (products.length > 0) {
              localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
              window.dispatchEvent(new Event("products-updated"));
            }
          },
          (error) => {
            if (error.code === "permission-denied") {
              console.warn("Firestore Sync: Akses ditolak.");
            }
          }
        );
      }
    });
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
    // Hindari localStorage.clear() agar sesi Firebase (login) tidak hilang
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));

    // 1. Demo Products
    const demoProducts: Product[] = [
      {
        id: "p1",
        name: "Indomie Goreng Spesial",
        sku: "8886001001103",
        category: "Mie Instan",
        baseUnit: "Pcs",
        stock: 120,
        minStockAlert: 20,
        updatedAt: Date.now(),
        units: [
          { name: "Pcs", conversion: 1, price: 3500, buyPrice: 2800 },
          { name: "Karton", conversion: 40, price: 132000, buyPrice: 110000 },
        ],
      },
      {
        id: "p2",
        name: "Kopi Kapal Api 20g",
        sku: "8991001101234",
        category: "Minuman",
        baseUnit: "Sachet",
        stock: 8,
        minStockAlert: 10,
        updatedAt: Date.now(), // Trigger low stock
        units: [
          { name: "Sachet", conversion: 1, price: 2000, buyPrice: 1500 },
          { name: "Renteng", conversion: 10, price: 18500, buyPrice: 14500 },
        ],
      },
      {
        id: "p3",
        name: "Beras Setra Ramos 5kg",
        sku: "8997001230011",
        category: "Sembako",
        baseUnit: "Karung",
        stock: 15,
        minStockAlert: 5,
        updatedAt: Date.now(),
        units: [{ name: "Karung", conversion: 1, price: 78000, buyPrice: 65000 }],
      },
      {
        id: "p4",
        name: "Minyak Goreng Bimoli 2L",
        sku: "8991002345678",
        category: "Sembako",
        baseUnit: "Pouch",
        stock: 24,
        minStockAlert: 6,
        updatedAt: Date.now(),
        units: [{ name: "Pouch", conversion: 1, price: 38000, buyPrice: 32000 }],
      },
      {
        id: "p5",
        name: "Teh Botol Sosro 450ml",
        sku: "8991001105555",
        category: "Minuman",
        baseUnit: "Botol",
        stock: 48,
        minStockAlert: 12,
        updatedAt: Date.now(),
        units: [
          { name: "Botol", conversion: 1, price: 5500, buyPrice: 4200 },
          { name: "Krat", conversion: 24, price: 120000, buyPrice: 95000 },
        ],
      },
      {
        id: "p6",
        name: "Rokok Sampoerna Mild 16",
        sku: "8999999000123",
        category: "Rokok",
        baseUnit: "Bungkus",
        stock: 2,
        minStockAlert: 10,
        updatedAt: Date.now(), // Trigger low stock
        units: [
          { name: "Bungkus", conversion: 1, price: 32000, buyPrice: 28500 },
          { name: "Slop", conversion: 10, price: 315000, buyPrice: 280000 },
        ],
      },
    ];

    // 2. Demo Customers
    const demoCustomers: Customer[] = [
      { id: "c1", name: "Budi Santoso", phone: "08123456789", tier: "Gold", totalSpent: 2500000, joinedAt: Date.now() - 30 * 86400000 },
      { id: "c2", name: "Ani Wijaya", phone: "08571122334", tier: "Silver", totalSpent: 850000, joinedAt: Date.now() - 15 * 86400000 },
      { id: "c3", name: "Iwan Fals", phone: "08998877665", tier: "Bronze", totalSpent: 125000, joinedAt: Date.now() - 5 * 86400000 },
    ];

    // 3. Demo Transactions (Past 7 days)
    const demoTransactions: Transaction[] = [];
    const now = Date.now();

    // Generate 45 transactions over 7 days
    for (let i = 0; i < 45; i++) {
      const daysAgo = Math.floor(Math.random() * 7);
      const timestamp = now - daysAgo * 86400000 - Math.random() * 3600000 * 12;

      // Randomly pick 1-3 items per transaction
      const items: CartItem[] = [];
      const numItems = Math.floor(Math.random() * 3) + 1;
      let subtotal = 0;

      for (let j = 0; j < numItems; j++) {
        const randomProduct = demoProducts[Math.floor(Math.random() * demoProducts.length)];
        const unit = randomProduct.units[0];
        const qty = Math.floor(Math.random() * 3) + 1;

        items.push({
          productId: randomProduct.id,
          productName: randomProduct.name,
          unitName: unit.name,
          price: unit.price,
          buyPrice: unit.buyPrice || unit.price * 0.8,
          quantity: qty,
          conversion: unit.conversion,
        });
        subtotal += unit.price * qty;
      }

      const isMember = i % 3 === 0;
      const customer = isMember ? demoCustomers[Math.floor(Math.random() * demoCustomers.length)] : null;
      let discount = 0;
      if (customer) {
        const rate = customer.tier === "Gold" ? 0.05 : customer.tier === "Silver" ? 0.02 : 0;
        discount = subtotal * rate;
      }

      const finalTotal = subtotal - discount;

      demoTransactions.push({
        id: `TX-DEMO-${1000 + i}`,
        timestamp,
        items,
        totalAmount: finalTotal,
        paymentMethod: "cash",
        cashPaid: Math.ceil(finalTotal / 10000) * 10000,
        change: Math.ceil(finalTotal / 10000) * 10000 - finalTotal,
        customerId: customer?.id || null,
        customerName: customer?.name || null,
        discountAmount: discount,
      });
    }

    // Sort transactions by date descending
    demoTransactions.sort((a, b) => b.timestamp - a.timestamp);

    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(demoProducts));
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(demoCustomers));
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(demoTransactions));
    localStorage.setItem(STORAGE_KEYS.INIT, "true");

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
