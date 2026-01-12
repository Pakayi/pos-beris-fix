import React, { useState, useEffect, useRef } from "react";
import { db } from "../services/db";
import { Product, ProductUnit, StockLog, UserRole, Supplier } from "../types";
import { Button, Input, Modal, Badge, CurrencyInput } from "../components/UI";

// @ts-ignore
import { Html5Qrcode } from "https://esm.sh/html5-qrcode@2.3.8";

interface ProductsProps {
  role: UserRole;
}

const Products: React.FC<ProductsProps> = ({ role }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>({});
  const [stockAction, setStockAction] = useState<{ product: Product | null; type: "IN" | "OUT"; quantity: string; unitIdx: number; reason: string }>({
    product: null,
    type: "IN",
    quantity: "",
    unitIdx: 0,
    reason: "",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const isOwner = role === "owner";

  const [showScanner, setShowScanner] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerInstanceRef = useRef<any>(null);
  const lastScanTimeRef = useRef<number>(0);

  useEffect(() => {
    refreshProducts();
    setSuppliers(db.getSuppliers());
    const handleUpdate = () => refreshProducts();
    window.addEventListener("products-updated", handleUpdate);
    return () => window.removeEventListener("products-updated", handleUpdate);
  }, []);

  useEffect(() => {
    if (showScanner) {
      setCameraError(null);
      const timer = setTimeout(async () => {
        try {
          const html5QrCode = new Html5Qrcode("product-scanner");
          scannerInstanceRef.current = html5QrCode;
          await html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText: string) => {
              const now = Date.now();
              if (now - lastScanTimeRef.current < 1500) return;
              lastScanTimeRef.current = now;
              setEditingProduct((prev: any) => ({ ...prev, sku: decodedText }));
              setShowScanner(false);
            },
            () => {}
          );
        } catch (err) {
          setCameraError("Kamera tidak dapat diakses.");
        }
      }, 300);
      return () => {
        if (scannerInstanceRef.current?.isScanning) {
          scannerInstanceRef.current.stop().then(() => scannerInstanceRef.current?.clear());
        }
      };
    }
  }, [showScanner]);

  const refreshProducts = () => setProducts(db.getProducts());

  const handleSave = () => {
    if (!editingProduct.name || !editingProduct.baseUnit) return;
    const productToSave: Product = {
      id: editingProduct.id || `P-${Date.now()}`,
      name: editingProduct.name,
      sku: editingProduct.sku || "",
      category: editingProduct.category || "Umum",
      baseUnit: editingProduct.baseUnit,
      stock: editingProduct.stock === "" ? 0 : Number(editingProduct.stock),
      minStockAlert: editingProduct.minStockAlert === "" ? 5 : Number(editingProduct.minStockAlert),
      units: editingProduct.units || [{ name: editingProduct.baseUnit, conversion: 1, price: 0, buyPrice: 0 }],
      supplierId: editingProduct.supplierId || "",
      updatedAt: Date.now(),
    };
    db.saveProduct(productToSave);
    setIsModalOpen(false);
    refreshProducts();
  };

  const handleUpdateStock = () => {
    const { product, type, quantity, unitIdx, reason } = stockAction;
    if (!product || !quantity || Number(quantity) <= 0) return;
    const user = JSON.parse(localStorage.getItem("warung_user_profile") || "{}");
    const unit = product.units[unitIdx];
    const qtyInBase = Number(quantity) * unit.conversion;
    const oldStock = product.stock;
    const newStock = type === "IN" ? oldStock + qtyInBase : oldStock - qtyInBase;

    const updatedProduct = { ...product, stock: newStock, updatedAt: Date.now() };
    const log: StockLog = {
      id: `LOG-ADJ-${Date.now()}`,
      productId: product.id,
      productName: product.name,
      type: type,
      logType: type === "IN" ? "RESTOCK" : "ADJUSTMENT",
      quantity: Number(quantity),
      unitName: unit.name,
      previousStock: oldStock,
      currentStock: newStock,
      reason: reason || (type === "IN" ? "Barang Masuk / Restock" : "Penyesuaian Stok / Rusak"),
      operatorName: user.displayName || "User",
      timestamp: Date.now(),
    };
    db.saveProduct(updatedProduct, log);
    setIsStockModalOpen(false);
    refreshProducts();
  };

  const getSupplierName = (id?: string) => {
    if (!id) return "-";
    return suppliers.find((s) => s.id === id)?.name || "-";
  };

  const filtered = products.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Manajemen Produk</h1>
          <p className="text-slate-500 text-sm">Kelola inventaris dan harga jual barang</p>
        </div>
        <div className="flex gap-2">
          {isOwner && (
            <Button
              onClick={() => {
                setEditingProduct({ units: [{ name: "Pcs", conversion: 1, price: 0, buyPrice: 0 }], stock: "", minStockAlert: "" });
                setIsModalOpen(true);
              }}
              icon="fa-plus"
            >
              Tambah Produk
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row gap-4 items-center">
          <Input placeholder="Cari nama atau barcode..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="max-w-md" prefix="fa-search" />
          <div className="flex-1"></div>
          <div className="text-xs text-gray-400">
            Total: <b>{filtered.length}</b> produk
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Nama Produk / Supplier</th>
                <th className="px-4 py-3 text-right">Stok</th>
                <th className="px-4 py-3">Satuan & Harga Jual</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((product) => {
                const isLowStock = product.stock <= product.minStockAlert;
                return (
                  <tr key={product.id} className={`hover:bg-gray-50 ${isLowStock ? "bg-red-50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-bold text-gray-900">{product.name}</div>
                      <div className="text-[10px] text-blue-500 font-bold uppercase">
                        <i className="fa-solid fa-truck-field mr-1"></i> {getSupplierName(product.supplierId)}
                      </div>
                      <div className="text-[10px] text-gray-400 font-mono">
                        {product.category} | {product.sku || "-"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={`font-bold ${isLowStock ? "text-red-600" : "text-slate-700"}`}>{product.stock}</span> {product.baseUnit}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {product.units.map((u, i) => (
                          <div key={i} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 font-bold">
                            {u.name}: Rp {u.price.toLocaleString("id-ID")}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => {
                            setStockAction({ product, type: "IN", quantity: "", unitIdx: 0, reason: "" });
                            setIsStockModalOpen(true);
                          }}
                          className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 border border-emerald-100"
                        >
                          <i className="fa-solid fa-boxes-stacked"></i>
                        </button>
                        {isOwner && (
                          <>
                            <button
                              onClick={() => {
                                setEditingProduct(product);
                                setIsModalOpen(true);
                              }}
                              className="p-1.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-100"
                            >
                              <i className="fa-solid fa-pen"></i>
                            </button>
                            <button
                              onClick={() => {
                                if (confirm("Hapus produk ini secara permanen?")) {
                                  db.deleteProduct(product.id);
                                  refreshProducts();
                                }
                              }}
                              className="p-1.5 bg-red-50 text-red-600 rounded-lg border border-red-100"
                            >
                              <i className="fa-solid fa-trash"></i>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Stok */}
      <Modal isOpen={isStockModalOpen} onClose={() => setIsStockModalOpen(false)} title="Update Stok Barang">
        {stockAction.product && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
              <p className="font-bold text-blue-900">{stockAction.product.name}</p>
              <p className="text-xs text-blue-700">
                Stok Sekarang: {stockAction.product.stock} {stockAction.product.baseUnit}
              </p>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button onClick={() => setStockAction({ ...stockAction, type: "IN" })} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${stockAction.type === "IN" ? "bg-emerald-500 text-white" : "text-slate-500"}`}>
                MASUK (+)
              </button>
              <button onClick={() => setStockAction({ ...stockAction, type: "OUT" })} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${stockAction.type === "OUT" ? "bg-red-500 text-white" : "text-slate-500"}`}>
                KELUAR (-)
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Jumlah" type="number" value={stockAction.quantity} onChange={(e) => setStockAction({ ...stockAction, quantity: e.target.value })} />
              <select className="w-full mt-5 p-2 border rounded-lg text-sm bg-white" value={stockAction.unitIdx} onChange={(e) => setStockAction({ ...stockAction, unitIdx: Number(e.target.value) })}>
                {stockAction.product.units.map((u, i) => (
                  <option key={i} value={i}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <Button className="w-full" onClick={handleUpdateStock}>
              Simpan Perubahan
            </Button>
          </div>
        )}
      </Modal>

      {/* Modal Edit Produk */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingProduct.id ? "Edit Produk" : "Tambah Produk"}>
        <div className="space-y-4">
          <Input label="Nama Produk" value={editingProduct.name || ""} onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Pilih Supplier</label>
              <select
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-500"
                value={editingProduct.supplierId || ""}
                onChange={(e) => setEditingProduct({ ...editingProduct, supplierId: e.target.value })}
              >
                <option value="">-- Tanpa Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <Input label="Kategori" value={editingProduct.category || ""} onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })} />
          </div>

          <div className="w-full">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Barcode/SKU</label>
            <div className="flex gap-1">
              <input className="w-full px-2 py-2 border rounded-lg text-sm" value={editingProduct.sku || ""} onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })} />
              <Button variant="secondary" onClick={() => setShowScanner(true)}>
                <i className="fa-solid fa-barcode"></i>
              </Button>
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl border grid grid-cols-3 gap-3">
            <Input label="Satuan" value={editingProduct.baseUnit || ""} onChange={(e) => setEditingProduct({ ...editingProduct, baseUnit: e.target.value })} />
            <Input label="Stok" type="number" value={editingProduct.stock} onChange={(e) => setEditingProduct({ ...editingProduct, stock: e.target.value })} disabled={!!editingProduct.id} />
            <Input label="Alert Stok" type="number" value={editingProduct.minStockAlert} onChange={(e) => setEditingProduct({ ...editingProduct, minStockAlert: e.target.value })} />
          </div>
          {editingProduct.units?.map((unit: any, idx: number) => (
            <div key={idx} className="p-4 border border-blue-100 bg-blue-50/20 rounded-xl space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Unit"
                  value={unit.name}
                  onChange={(e) => {
                    const u = [...editingProduct.units];
                    u[idx].name = e.target.value;
                    setEditingProduct({ ...editingProduct, units: u });
                  }}
                />
                <Input
                  label="Konversi (Isi)"
                  type="number"
                  value={unit.conversion}
                  onChange={(e) => {
                    const u = [...editingProduct.units];
                    u[idx].conversion = Number(e.target.value);
                    setEditingProduct({ ...editingProduct, units: u });
                  }}
                />
              </div>
              <CurrencyInput
                label="Harga Jual"
                value={unit.price}
                onChange={(val) => {
                  const u = [...editingProduct.units];
                  u[idx].price = val;
                  setEditingProduct({ ...editingProduct, units: u });
                }}
              />
            </div>
          ))}
          <Button className="w-full py-3 font-bold" onClick={handleSave}>
            Simpan Produk
          </Button>
        </div>
      </Modal>

      <Modal isOpen={showScanner} onClose={() => setShowScanner(false)} title="Scan Barcode">
        <div id="product-scanner" className="w-full max-w-[300px] bg-black rounded-lg min-h-[250px] mx-auto border-2 border-blue-500"></div>
      </Modal>
    </div>
  );
};
export default Products;
