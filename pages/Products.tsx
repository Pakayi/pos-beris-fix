import React, { useState, useEffect, useRef } from "react";
import { db } from "../services/db";
import { Product, ProductUnit, StockLog, UserRole } from "../types";
import { Button, Input, Modal, Badge, CurrencyInput } from "../components/UI";

// Direct URL Imports for stability
// @ts-ignore
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
// @ts-ignore
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "https://esm.sh/html5-qrcode@2.3.8";

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

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2 | 3>(1);
  const [excelRows, setExcelRows] = useState<any[]>([]);
  const [columnHeaders, setColumnHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isImporting, setIsImporting] = useState(false);

  const [showScanner, setShowScanner] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerInstanceRef = useRef<any>(null);
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

  const handleExportExcel = () => {
    if (!isOwner) return;
    const exportData = products.map((p) => {
      const units = p.units || [];
      const u1 = units.find((u) => u.conversion === 1) || { name: p.baseUnit, price: 0, buyPrice: 0, conversion: 1 };
      const extraUnits = units.filter((u) => u.conversion !== 1);
      return {
        KODE_BARCODE: p.sku || "",
        NAMA_PRODUK: p.name,
        KATEGORI: p.category,
        STOK: p.stock,
        SATUAN_DASAR: u1.name,
        HARGA_MODAL_DASAR: u1.buyPrice,
        HARGA_JUAL_DASAR: u1.price,
        SATUAN_2: extraUnits[0]?.name || "",
        KONVERSI_2: extraUnits[0]?.conversion || "",
        MODAL_2: extraUnits[0]?.buyPrice || "",
        JUAL_2: extraUnits[0]?.price || "",
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data Produk");
    XLSX.writeFile(workbook, `beris-pos-produk-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      // XLSX.read secara otomatis mengenali .xls dan .xlsx
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (rows.length === 0) return;

      const headers = rows[0].map((h) => String(h).trim());
      const dataRows = rows.slice(1);

      setColumnHeaders(headers);
      setExcelRows(dataRows);

      const initialMapping: Record<string, string> = {};
      const fieldSuggestions: Record<string, string[]> = {
        name: ["nama", "name", "barang", "produk", "item", "product", "deskripsi", "NAMA"],
        sku: ["sku", "barcode", "kode", "code", "barcode1", "KODE_BARCODE", "KODE_BARANG"],
        price: ["harga", "jual", "toko", "price", "sell", "harga_jual", "TOKO"],
        buyPrice: ["modal", "beli", "buy", "cogs", "harga_beli", "harga_modal"],
        stock: ["stok", "jumlah", "stock", "qty", "balance", "STOK"],
        category: ["kategori", "category", "golongan", "group", "sub_kategori", "KATEGORI"],
        baseUnit: ["satuan", "unit", "uom", "satuan_1", "SATUAN_1"],
      };

      Object.keys(fieldSuggestions).forEach((field) => {
        const found = headers.find((h) => fieldSuggestions[field].some((s) => h.toLowerCase() === s.toLowerCase() || h.toLowerCase().includes(s.toLowerCase())));
        if (found) initialMapping[field] = found;
      });

      setMapping(initialMapping);
      setImportStep(2);
    };
    reader.readAsArrayBuffer(file);
  };

  const executeImport = async () => {
    if (!mapping.name) {
      alert("Minimal kolom 'Nama Produk' harus dipilih.");
      return;
    }
    setIsImporting(true);
    const newProducts: Product[] = excelRows
      .map((row, idx) => {
        const getVal = (field: string) => {
          const header = mapping[field];
          if (!header) return null;
          const colIdx = columnHeaders.indexOf(header);
          return row[colIdx];
        };
        const name = String(getVal("name") || "");
        if (!name) return null;

        const baseUnit = String(getVal("baseUnit") || "Pcs");
        const buyPrice = Number(getVal("buyPrice")) || 0;
        const price = Number(getVal("price")) || 0;
        const sku = String(getVal("sku") || "");
        const stock = Number(getVal("stock")) || 0;
        const category = String(getVal("category") || "Umum");

        const units: ProductUnit[] = [{ name: baseUnit, conversion: 1, price, buyPrice }];

        return {
          id: `P-IMP-${Date.now()}-${idx}`,
          name,
          sku,
          category,
          baseUnit,
          stock,
          minStockAlert: 5,
          units,
          updatedAt: Date.now(),
        };
      })
      .filter((p) => p !== null) as Product[];

    try {
      await db.bulkSaveProducts(newProducts);
      setIsImportModalOpen(false);
      refreshProducts();
      alert(`Berhasil mengimpor ${newProducts.length} produk ke Beris POS!`);
    } catch (e) {
      alert("Gagal mengimpor data. Pastikan format file benar.");
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
                Import Excel
              </Button>
              <Button onClick={handleExportExcel} variant="outline" icon="fa-file-excel">
                Export Excel
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
      <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title="Import Data Produk (Excel)">
        {importStep === 1 && (
          <div className="space-y-6">
            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer relative">
              <input type="file" accept=".xls,.xlsx" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
                <i className="fa-solid fa-file-excel"></i>
              </div>
              <h4 className="font-bold text-slate-900">Pilih File Excel</h4>
              <p className="text-xs text-slate-500 mt-1">Mendukung format .xls (lama) dan .xlsx (baru)</p>
            </div>
          </div>
        )}
        {importStep === 2 && (
          <div className="space-y-4">
            <div className="bg-slate-800 p-3 rounded-lg text-white mb-2">
              <p className="text-xs">Cocokkan kolom di file Anda dengan sistem kami</p>
            </div>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto no-scrollbar">
              {[
                { id: "name", label: "Nama Produk", required: true, icon: "fa-tag" },
                { id: "sku", label: "Barcode / SKU", required: false, icon: "fa-barcode" },
                { id: "price", label: "Harga Jual", required: false, icon: "fa-hand-holding-dollar" },
                { id: "stock", label: "Stok Awal", required: false, icon: "fa-box" },
                { id: "category", label: "Kategori", required: false, icon: "fa-folder" },
                { id: "baseUnit", label: "Satuan", required: false, icon: "fa-ruler" },
              ].map((field) => (
                <div key={field.id} className="flex items-center gap-3 bg-white p-3 border border-slate-200 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-xs">
                    <i className={`fa-solid ${field.icon}`}></i>
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-slate-800">{field.label}</p>
                  </div>
                  <select className="w-1/2 text-xs border rounded-lg p-2 bg-slate-50" value={mapping[field.id] || ""} onChange={(e) => setMapping({ ...mapping, [field.id]: e.target.value })}>
                    <option value="">-- Lewati --</option>
                    {columnHeaders.map((h) => (
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
                Ganti File
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
              <i className="fa-solid fa-cloud-arrow-up"></i>
            </div>
            <h3 className="text-xl font-bold">Siap Import!</h3>
            <p className="text-sm text-slate-500">Ditemukan {excelRows.length} baris data produk.</p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setImportStep(2)} disabled={isImporting}>
                Kembali
              </Button>
              <Button className="flex-1" onClick={executeImport} disabled={isImporting}>
                {isImporting ? <i className="fa-solid fa-spinner fa-spin"></i> : "Mulai Import"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

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
          <div className="grid grid-cols-2 gap-3">
            <Input label="Kategori" value={editingProduct.category || ""} onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })} />
            <div className="w-full">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Barcode/SKU</label>
              <div className="flex gap-1">
                <input className="w-full px-2 py-2 border rounded-lg text-sm" value={editingProduct.sku || ""} onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })} />
                <Button variant="secondary" onClick={() => setShowScanner(true)}>
                  <i className="fa-solid fa-barcode"></i>
                </Button>
              </div>
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
