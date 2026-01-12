import React, { useState, useEffect, useRef } from "react";
import { db } from "../services/db";
import { Product, ProductUnit, StockLog, UserRole, Supplier } from "../types";
import { Button, Input, Modal, Badge, CurrencyInput } from "../components/UI";
// @ts-ignore
import * as XLSX from "xlsx";

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
  const [isImporting, setIsImporting] = useState(false);

  const isOwner = role === "owner";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showScanner, setShowScanner] = useState(false);
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
          alert("Gagal akses kamera");
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

  const addUnitField = () => {
    const currentUnits = editingProduct.units || [];
    setEditingProduct({
      ...editingProduct,
      units: [...currentUnits, { name: "", conversion: 1, price: 0, buyPrice: 0 }],
    });
  };

  const removeUnitField = (index: number) => {
    if (index === 0) return; // Base unit can't be removed
    const currentUnits = [...editingProduct.units];
    currentUnits.splice(index, 1);
    setEditingProduct({ ...editingProduct, units: currentUnits });
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

  // --- EXCEL FEATURES ---
  const exportToExcel = () => {
    const data = products.map((p) => ({
      ID: p.id,
      Nama: p.name,
      SKU: p.sku,
      Kategori: p.category,
      Stok: p.stock,
      Satuan_Dasar: p.baseUnit,
      Supplier: getSupplierName(p.supplierId),
      Harga_Utama: p.units[0]?.price || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produk");
    XLSX.writeFile(wb, `Stok_Warung_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        const importedProducts: Product[] = data.map((row, idx) => ({
          id: row.ID || `P-IMP-${Date.now()}-${idx}`,
          name: row.Nama || "Tanpa Nama",
          sku: String(row.SKU || ""),
          category: row.Kategori || "Umum",
          baseUnit: row.Satuan_Dasar || "Pcs",
          stock: Number(row.Stok || 0),
          minStockAlert: 5,
          units: [{ name: row.Satuan_Dasar || "Pcs", conversion: 1, price: Number(row.Harga_Utama || 0), buyPrice: 0 }],
          updatedAt: Date.now(),
        }));

        await db.saveProductsBulk(importedProducts);
        alert(`Berhasil mengimpor ${importedProducts.length} produk.`);
        refreshProducts();
      } catch (err) {
        alert("Gagal membaca file Excel. Pastikan format kolom benar (ID, Nama, SKU, Kategori, Stok, Satuan_Dasar, Harga_Utama)");
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  const getSupplierName = (id?: string) => {
    if (!id) return "-";
    return suppliers.find((s) => s.id === id)?.name || "-";
  };

  const filtered = products.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.includes(searchTerm));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Manajemen Produk</h1>
          <p className="text-slate-500 text-sm">Kelola inventaris dan harga jual barang</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <input type="file" ref={fileInputRef} onChange={handleImportExcel} className="hidden" accept=".xlsx, .xls" />
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={isImporting} icon="fa-file-import">
            {isImporting ? "Mengimpor..." : "Import"}
          </Button>
          <Button variant="secondary" onClick={exportToExcel} icon="fa-file-export">
            Export
          </Button>
          {isOwner && (
            <Button
              onClick={() => {
                setEditingProduct({ units: [{ name: "Pcs", conversion: 1, price: 0, buyPrice: 0 }], stock: "", minStockAlert: "" });
                setIsModalOpen(true);
              }}
              icon="fa-plus"
            >
              Tambah
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative w-full sm:max-w-md">
            <Input placeholder="Cari nama atau barcode..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} prefix="fa-search" className="w-full" />
          </div>
          <div className="hidden sm:block flex-1"></div>
          <div className="text-xs text-gray-400 font-bold bg-gray-50 px-3 py-1.5 rounded-full border">TOTAL: {filtered.length} PRODUK</div>
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-200 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-6 py-4">Nama Produk / Supplier</th>
                <th className="px-6 py-4 text-right">Stok</th>
                <th className="px-6 py-4">Satuan & Harga Jual</th>
                <th className="px-6 py-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((product) => {
                const isLowStock = product.stock <= product.minStockAlert;
                return (
                  <tr key={product.id} className={`hover:bg-gray-50 transition-colors ${isLowStock ? "bg-red-50/50" : ""}`}>
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-900">{product.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-blue-500 font-bold uppercase flex items-center gap-1">
                          <i className="fa-solid fa-truck-field"></i> {getSupplierName(product.supplierId)}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">| {product.sku || "No SKU"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono">
                      <span className={`font-bold text-lg ${isLowStock ? "text-red-600" : "text-slate-700"}`}>{product.stock}</span>
                      <span className="text-xs text-gray-400 ml-1 uppercase">{product.baseUnit}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {product.units.map((u, i) => (
                          <div key={i} className="text-[10px] bg-white text-blue-600 px-2.5 py-1 rounded-lg border border-blue-200 font-bold shadow-sm">
                            {u.name}: Rp {u.price.toLocaleString("id-ID")}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => {
                            setStockAction({ product, type: "IN", quantity: "", unitIdx: 0, reason: "" });
                            setIsStockModalOpen(true);
                          }}
                          className="w-8 h-8 flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 border border-emerald-100 transition-all"
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
                              className="w-8 h-8 flex items-center justify-center bg-blue-50 text-blue-600 rounded-lg border border-blue-100 transition-all"
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
                              className="w-8 h-8 flex items-center justify-center bg-red-50 text-red-600 rounded-lg border border-red-100 transition-all"
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
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
              <p className="font-bold text-blue-900">{stockAction.product.name}</p>
              <p className="text-xs text-blue-700">
                Stok Saat Ini:{" "}
                <b>
                  {stockAction.product.stock} {stockAction.product.baseUnit}
                </b>
              </p>
            </div>
            <div className="flex bg-slate-100 p-1.5 rounded-xl">
              <button
                onClick={() => setStockAction({ ...stockAction, type: "IN" })}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${stockAction.type === "IN" ? "bg-emerald-500 text-white shadow-md" : "text-slate-500"}`}
              >
                RESTOCK (+)
              </button>
              <button
                onClick={() => setStockAction({ ...stockAction, type: "OUT" })}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${stockAction.type === "OUT" ? "bg-red-500 text-white shadow-md" : "text-slate-500"}`}
              >
                PENYESUAIAN (-)
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Jumlah" type="number" value={stockAction.quantity} onChange={(e) => setStockAction({ ...stockAction, quantity: e.target.value })} />
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-500">Satuan</label>
                <select className="w-full p-2.5 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-100" value={stockAction.unitIdx} onChange={(e) => setStockAction({ ...stockAction, unitIdx: Number(e.target.value) })}>
                  {stockAction.product.units.map((u, i) => (
                    <option key={i} value={i}>
                      {u.name} (Isi {u.conversion})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Input label="Alasan (Opsional)" placeholder="Contoh: Barang datang dari supplier" value={stockAction.reason} onChange={(e) => setStockAction({ ...stockAction, reason: e.target.value })} />
            <Button className="w-full py-3" onClick={handleUpdateStock}>
              Simpan Perubahan
            </Button>
          </div>
        )}
      </Modal>

      {/* Modal Edit Produk */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingProduct.id ? "Edit Detail Produk" : "Tambah Produk Baru"}>
        <div className="space-y-5">
          <Input label="Nama Produk" placeholder="Contoh: Indomie Goreng" value={editingProduct.name || ""} onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Pilih Supplier</label>
              <select
                className="w-full px-3 py-2.5 border rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
            <Input label="Kategori" placeholder="Sembako, Minuman, dll" value={editingProduct.category || ""} onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Barcode / SKU</label>
            <div className="flex gap-2">
              <Input value={editingProduct.sku || ""} onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })} placeholder="Scan atau ketik manual" className="flex-1" />
              <Button variant="secondary" onClick={() => setShowScanner(true)} className="shrink-0">
                <i className="fa-solid fa-camera"></i>
              </Button>
            </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 grid grid-cols-3 gap-4">
            <Input label="Satuan Dasar" placeholder="Pcs" value={editingProduct.baseUnit || ""} onChange={(e) => setEditingProduct({ ...editingProduct, baseUnit: e.target.value })} />
            <Input label="Stok Awal" type="number" placeholder="0" value={editingProduct.stock} onChange={(e) => setEditingProduct({ ...editingProduct, stock: e.target.value })} disabled={!!editingProduct.id} />
            <Input label="Alert Stok" type="number" placeholder="5" value={editingProduct.minStockAlert} onChange={(e) => setEditingProduct({ ...editingProduct, minStockAlert: e.target.value })} />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Daftar Satuan & Harga</h4>
              <button onClick={addUnitField} className="text-blue-600 text-xs font-bold hover:underline">
                + Tambah Satuan
              </button>
            </div>
            {editingProduct.units?.map((unit: any, idx: number) => (
              <div key={idx} className="p-4 border border-blue-100 bg-blue-50/20 rounded-xl space-y-3 relative">
                {idx > 0 && (
                  <button onClick={() => removeUnitField(idx)} className="absolute top-2 right-2 text-red-400 hover:text-red-600">
                    <i className="fa-solid fa-circle-xmark"></i>
                  </button>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Nama Satuan"
                    placeholder="Pcs, Dus, Pak"
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
                    placeholder="1"
                    value={unit.conversion}
                    disabled={idx === 0}
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
          </div>

          <Button className="w-full py-4 font-bold text-lg shadow-lg shadow-blue-500/20" onClick={handleSave}>
            Simpan Produk
          </Button>
        </div>
      </Modal>

      <Modal isOpen={showScanner} onClose={() => setShowScanner(false)} title="Scan Barcode Produk">
        <div className="p-1">
          <div id="product-scanner" className="w-full max-w-[300px] bg-black rounded-2xl min-h-[250px] mx-auto border-4 border-blue-500 overflow-hidden"></div>
          <p className="text-center text-xs text-slate-500 mt-4 italic">Arahkan kamera ke barcode barang</p>
        </div>
      </Modal>
    </div>
  );
};
export default Products;
