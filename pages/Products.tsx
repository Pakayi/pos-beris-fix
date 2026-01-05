import React, { useState, useEffect, useRef } from "react";
import { db } from "../services/db";
import { Product, ProductUnit, StockLog, UserRole } from "../types";
import { Button, Input, Modal, Badge, CurrencyInput } from "../components/UI";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

interface ProductsProps {
  role: UserRole;
}

const Products: React.FC<ProductsProps> = ({ role }) => {
  const [products, setProducts] = useState<Product[]>([]);
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

  // Import State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2 | 3>(1);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isImporting, setIsImporting] = useState(false);

  // Scanner State
  const [showScanner, setShowScanner] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerInstanceRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef<number>(0);

  useEffect(() => {
    refreshProducts();
    const handleUpdate = () => refreshProducts();
    window.addEventListener("products-updated", handleUpdate);
    return () => window.removeEventListener("products-updated", handleUpdate);
  }, []);

  useEffect(() => {
    if (showScanner) {
      setCameraError(null);
      const timer = setTimeout(async () => {
        try {
          const html5QrCode = new Html5Qrcode("product-scanner", {
            formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.CODE_128],
            verbose: false,
          });
          scannerInstanceRef.current = html5QrCode;

          await html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText) => {
              const now = Date.now();
              if (now - lastScanTimeRef.current < 1500) return;
              lastScanTimeRef.current = now;
              setEditingProduct((prev) => ({ ...prev, sku: decodedText }));
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

  const handleExportCSV = () => {
    if (!isOwner) return;
    // Enhanced CSV Export with Multi-Unit support as separate columns
    let csv = "SKU,Nama,Kategori,Stok,Satuan_Dasar,Harga_Modal_Dasar,Harga_Jual_Dasar,Satuan_2,Konversi_2,Modal_2,Jual_2,Satuan_3,Konversi_3,Modal_3,Jual_3\n";
    products.forEach((p) => {
      const units = p.units || [];
      const u1 = units.find((u) => u.conversion === 1) || { name: p.baseUnit, price: 0, buyPrice: 0, conversion: 1 };
      const u2 = units.length > 1 ? units.find((u) => u.conversion !== 1) : null;
      const u3 = units.length > 2 ? units.filter((u) => u.conversion !== 1)[1] : null;

      const row = [
        p.sku || "",
        `"${p.name}"`,
        `"${p.category}"`,
        p.stock,
        u1.name,
        u1.buyPrice,
        u1.price,
        u2 ? u2.name : "",
        u2 ? u2.conversion : "",
        u2 ? u2.buyPrice : "",
        u2 ? u2.price : "",
        u3 ? u3.name : "",
        u3 ? u3.conversion : "",
        u3 ? u3.buyPrice : "",
        u3 ? u3.price : "",
      ];
      csv += row.join(",") + "\n";
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `beris-pos-produk-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length === 0) return;

    // Simple CSV parser that handles quotes
    const parseLine = (line: string) => {
      const result = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === "," && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else current += char;
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseLine(lines[0]);
    const data = lines.slice(1).map(parseLine);

    setCsvHeaders(headers);
    setCsvData(data);

    // Auto-mapping logic
    const initialMapping: Record<string, string> = {};
    const fieldSuggestions: Record<string, string[]> = {
      name: ["nama", "name", "barang", "produk", "item", "product"],
      sku: ["sku", "barcode", "kode", "code"],
      price: ["harga", "jual", "toko", "price", "sell"],
      buyPrice: ["modal", "beli", "buy", "cogs"],
      stock: ["stok", "jumlah", "stock", "qty"],
      category: ["kategori", "category", "golongan", "group"],
      baseUnit: ["satuan", "unit", "uom"],
    };

    Object.keys(fieldSuggestions).forEach((field) => {
      const found = headers.find((h) => fieldSuggestions[field].some((s) => h.toLowerCase().includes(s.toLowerCase())));
      if (found) initialMapping[field] = found;
    });

    setMapping(initialMapping);
    setImportStep(2);
  };

  const executeImport = async () => {
    if (!mapping.name) {
      alert("Minimal kolom 'Nama Produk' harus dipilih.");
      return;
    }

    setIsImporting(true);
    const newProducts: Product[] = csvData
      .map((row, idx) => {
        const getVal = (field: string) => {
          const header = mapping[field];
          if (!header) return "";
          const colIdx = csvHeaders.indexOf(header);
          return row[colIdx] || "";
        };

        const name = getVal("name");
        if (!name) return null;

        const baseUnit = getVal("baseUnit") || "Pcs";
        const buyPrice = Number(getVal("buyPrice")) || 0;
        const price = Number(getVal("price")) || 0;

        return {
          id: `P-IMP-${Date.now()}-${idx}`,
          name,
          sku: getVal("sku"),
          category: getVal("category") || "Umum",
          baseUnit,
          stock: Number(getVal("stock")) || 0,
          minStockAlert: 5,
          units: [
            {
              name: baseUnit,
              conversion: 1,
              price,
              buyPrice,
            },
          ],
          updatedAt: Date.now(),
        };
      })
      .filter((p) => p !== null) as Product[];

    try {
      await db.bulkSaveProducts(newProducts);
      setIsImportModalOpen(false);
      refreshProducts();
      alert(`Berhasil mengimpor ${newProducts.length} produk!`);
    } catch (e) {
      alert("Gagal mengimpor data. Pastikan format benar.");
    } finally {
      setIsImporting(false);
      setImportStep(1);
    }
  };

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

  const addUnitField = () => {
    const units = [...(editingProduct.units || [])];
    units.push({ name: "", conversion: 1, price: 0, buyPrice: 0 });
    setEditingProduct({ ...editingProduct, units });
  };

  const removeUnitField = (idx: number) => {
    if (idx === 0) return;
    const units = editingProduct.units.filter((_: any, i: number) => i !== idx);
    setEditingProduct({ ...editingProduct, units });
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
            <>
              <Button
                onClick={() => {
                  setImportStep(1);
                  setIsImportModalOpen(true);
                }}
                variant="secondary"
                icon="fa-file-import"
              >
                Import
              </Button>
              <Button onClick={handleExportCSV} variant="outline" icon="fa-file-excel">
                Export
              </Button>
              <Button
                onClick={() => {
                  setEditingProduct({ units: [{ name: "Pcs", conversion: 1, price: 0, buyPrice: 0 }], stock: "", minStockAlert: "" });
                  setIsModalOpen(true);
                }}
                icon="fa-plus"
              >
                Tambah Produk
              </Button>
            </>
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
                <th className="px-4 py-3">Nama Produk</th>
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
                          title="Kelola Stok"
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

      {/* Modal Import */}
      <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title="Import Data Produk">
        {importStep === 1 && (
          <div className="space-y-6">
            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer relative">
              <input type="file" accept=".csv" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
                <i className="fa-solid fa-file-csv"></i>
              </div>
              <h4 className="font-bold text-slate-900">Pilih File CSV</h4>
              <p className="text-xs text-slate-500 mt-1">Upload file export dari aplikasi lama Anda</p>
            </div>
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-[11px] text-blue-700 leading-relaxed">
              <p className="font-bold mb-1 uppercase tracking-wider">💡 Tips Beris POS</p>
              Kami mendukung import cerdas. Anda tidak perlu mengubah kolom Excel Anda. Cukup upload, nanti kita cocokkan bersama di langkah berikutnya.
            </div>
          </div>
        )}

        {importStep === 2 && (
          <div className="space-y-4">
            <p className="text-xs font-bold text-slate-500 uppercase">Cocokkan Kolom Anda</p>
            <div className="space-y-3">
              {[
                { id: "name", label: "Nama Produk", required: true },
                { id: "sku", label: "Barcode / SKU", required: false },
                { id: "price", label: "Harga Jual Dasar", required: false },
                { id: "buyPrice", label: "Harga Modal", required: false },
                { id: "stock", label: "Stok Saat Ini", required: false },
                { id: "category", label: "Kategori", required: false },
                { id: "baseUnit", label: "Satuan Dasar", required: false },
              ].map((field) => (
                <div key={field.id} className="flex items-center gap-3 bg-white p-2 border rounded-lg">
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-800">
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </p>
                  </div>
                  <select className="flex-1 text-xs border rounded p-1 bg-slate-50" value={mapping[field.id] || ""} onChange={(e) => setMapping({ ...mapping, [field.id]: e.target.value })}>
                    <option value="">-- Lewati --</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="pt-4 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setImportStep(1)}>
                Kembali
              </Button>
              <Button className="flex-1" onClick={() => setImportStep(3)} disabled={!mapping.name}>
                Lanjut
              </Button>
            </div>
          </div>
        )}

        {importStep === 3 && (
          <div className="space-y-6 text-center">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl">
              <i className="fa-solid fa-check-double"></i>
            </div>
            <div>
              <h3 className="text-xl font-bold">Siap Impor!</h3>
              <p className="text-sm text-slate-500">
                Ada <b>{csvData.length}</b> barang ditemukan dalam file Anda.
              </p>
            </div>
            <div className="p-4 bg-slate-50 border rounded-xl text-left">
              <p className="text-xs font-bold text-slate-400 mb-2 uppercase">Preview Data</p>
              <div className="space-y-1 max-h-32 overflow-y-auto pr-2 no-scrollbar">
                {csvData.slice(0, 5).map((row, i) => (
                  <div key={i} className="text-xs text-slate-700 py-1 border-b border-slate-100 truncate">
                    {row[csvHeaders.indexOf(mapping.name)]}
                  </div>
                ))}
                {csvData.length > 5 && <p className="text-[10px] text-slate-400 mt-1">...dan {csvData.length - 5} barang lainnya.</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setImportStep(2)} disabled={isImporting}>
                Batal
              </Button>
              <Button className="flex-1" onClick={executeImport} disabled={isImporting}>
                {isImporting ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : "Mulai Impor Sekarang"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Update Stok */}
      <Modal isOpen={isStockModalOpen} onClose={() => setIsStockModalOpen(false)} title="Update Stok Barang">
        {stockAction.product && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-xs text-blue-600 font-bold uppercase tracking-wider">Produk</p>
              <p className="font-bold text-blue-900">{stockAction.product.name}</p>
              <p className="text-xs text-blue-700 mt-1">
                Stok Saat Ini:{" "}
                <span className="font-bold">
                  {stockAction.product.stock} {stockAction.product.baseUnit}
                </span>
              </p>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setStockAction({ ...stockAction, type: "IN" })}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${stockAction.type === "IN" ? "bg-emerald-500 text-white shadow-md" : "text-slate-500"}`}
              >
                BARANG MASUK (+)
              </button>
              <button
                onClick={() => setStockAction({ ...stockAction, type: "OUT" })}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${stockAction.type === "OUT" ? "bg-red-500 text-white shadow-md" : "text-slate-500"}`}
              >
                BARANG KELUAR (-)
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input label="Jumlah" type="number" value={stockAction.quantity} onChange={(e) => setStockAction({ ...stockAction, quantity: e.target.value })} placeholder="0" />
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Satuan</label>
                <select className="w-full p-2 border rounded-lg text-sm bg-white" value={stockAction.unitIdx} onChange={(e) => setStockAction({ ...stockAction, unitIdx: Number(e.target.value) })}>
                  {stockAction.product.units.map((u, i) => (
                    <option key={i} value={i}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Input
              label="Alasan / Catatan (Opsional)"
              value={stockAction.reason}
              onChange={(e) => setStockAction({ ...stockAction, reason: e.target.value })}
              placeholder={stockAction.type === "IN" ? "Contoh: Belanja Supplier A" : "Contoh: Barang Rusak"}
            />

            <div className="pt-4 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setIsStockModalOpen(false)}>
                Batal
              </Button>
              <Button className="flex-1" onClick={handleUpdateStock}>
                Simpan Perubahan
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Add/Edit Product */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingProduct.id ? "Edit Produk" : "Tambah Produk Baru"}>
        <div className="space-y-4">
          <Input label="Nama Produk" value={editingProduct.name || ""} onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Kategori" value={editingProduct.category || ""} onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })} />
            <div className="w-full">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Barcode (SKU)</label>
              <div className="flex gap-1">
                <input className="w-full px-2 py-2 border rounded-lg text-sm" value={editingProduct.sku || ""} onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })} />
                <Button variant="secondary" onClick={() => setShowScanner(true)}>
                  <i className="fa-solid fa-barcode"></i>
                </Button>
              </div>
            </div>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl border grid grid-cols-3 gap-3">
            <Input label="Satuan Dasar" value={editingProduct.baseUnit || ""} onChange={(e) => setEditingProduct({ ...editingProduct, baseUnit: e.target.value })} />
            <Input label="Stok Awal" type="number" value={editingProduct.stock} onChange={(e) => setEditingProduct({ ...editingProduct, stock: e.target.value })} disabled={!!editingProduct.id} />
            <Input label="Min. Alert" type="number" value={editingProduct.minStockAlert} onChange={(e) => setEditingProduct({ ...editingProduct, minStockAlert: e.target.value })} />
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-gray-400 uppercase">Harga & Satuan Jual</label>
            </div>
            {editingProduct.units?.map((unit: any, idx: number) => (
              <div key={idx} className="p-4 border border-blue-100 bg-blue-50/20 rounded-xl space-y-3 relative">
                {idx > 0 && (
                  <button onClick={() => removeUnitField(idx)} className="absolute top-2 right-2 text-red-400 hover:text-red-600">
                    <i className="fa-solid fa-trash-can"></i>
                  </button>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Nama Satuan"
                    value={unit.name}
                    onChange={(e) => {
                      const u = [...editingProduct.units];
                      u[idx].name = e.target.value;
                      setEditingProduct({ ...editingProduct, units: u });
                    }}
                    placeholder="Pcs/Dus/Pak"
                  />
                  <Input
                    label="Isi (Konversi)"
                    type="number"
                    value={unit.conversion}
                    onChange={(e) => {
                      const u = [...editingProduct.units];
                      u[idx].conversion = Number(e.target.value);
                      setEditingProduct({ ...editingProduct, units: u });
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {isOwner ? (
                    <CurrencyInput
                      label="Modal (Beli)"
                      value={unit.buyPrice || 0}
                      onChange={(val) => {
                        const u = [...editingProduct.units];
                        u[idx].buyPrice = val;
                        setEditingProduct({ ...editingProduct, units: u });
                      }}
                    />
                  ) : (
                    <div className="opacity-50">
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Modal (Beli)</label>
                      <div className="bg-gray-100 p-2 rounded-lg text-sm italic border text-gray-400">Terkunci</div>
                    </div>
                  )}
                  <CurrencyInput
                    label="Jual"
                    value={unit.price}
                    onChange={(val) => {
                      const u = [...editingProduct.units];
                      u[idx].price = val;
                      setEditingProduct({ ...editingProduct, units: u });
                    }}
                  />
                </div>
              </div>
            ))}
            <button onClick={addUnitField} className="w-full py-3 border-2 border-dashed border-blue-200 rounded-xl text-blue-600 hover:bg-blue-50 text-sm font-bold transition-all">
              <i className="fa-solid fa-plus-circle mr-2"></i> Tambah Satuan Jual (Grosir/Multi)
            </button>
          </div>
          <Button className="w-full py-3 mt-4" onClick={handleSave}>
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
