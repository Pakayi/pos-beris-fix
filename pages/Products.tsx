import React, { useState, useEffect, useRef } from "react";
import { db } from "../services/db";
import { Product, ProductUnit } from "../types";
import { Button, Input, Modal, Badge, CurrencyInput } from "../components/UI";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "https://esm.sh/html5-qrcode@2.3.8";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const Products: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>({});
  const [searchTerm, setSearchTerm] = useState("");

  const [showScanner, setShowScanner] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerInstanceRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
            },
            (decodedText) => onScanSuccess(decodedText),
            () => {}
          );
        } catch (err) {
          console.error(err);
          setCameraError("Kamera tidak dapat diakses.");
        }
      }, 300);

      return () => {
        clearTimeout(timer);
        if (scannerInstanceRef.current) {
          if (scannerInstanceRef.current.isScanning) {
            scannerInstanceRef.current
              .stop()
              .then(() => {
                scannerInstanceRef.current?.clear();
              })
              .catch(console.error);
          }
        }
      };
    }
  }, [showScanner]);

  const onScanSuccess = (decodedText: string) => {
    const now = Date.now();
    if (now - lastScanTimeRef.current < 1500) return;
    lastScanTimeRef.current = now;
    setEditingProduct((prev) => ({ ...prev, sku: decodedText }));
    playBeep();
    setShowScanner(false);
  };

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      console.error(e);
    }
  };

  const refreshProducts = () => {
    setProducts(db.getProducts());
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

  const handleDelete = (id: string) => {
    if (confirm("Hapus produk ini?")) {
      db.deleteProduct(id);
      refreshProducts();
    }
  };

  // --- LOGIKA EKSPOR EXCEL ---
  const handleExportExcel = () => {
    try {
      if (products.length === 0) {
        alert("Belum ada produk untuk diekspor.");
        return;
      }

      // Ratakan data agar mudah dibaca di Excel
      const excelData = products.map((p) => ({
        "ID Produk": p.id,
        "Nama Produk": p.name,
        "Barcode/SKU": p.sku,
        Kategori: p.category,
        "Stok Saat Ini": p.stock,
        "Minimal Stok": p.minStockAlert,
        "Satuan Dasar": p.baseUnit,
        "Harga Beli": p.units[0]?.buyPrice || 0,
        "Harga Jual": p.units[0]?.price || 0,
        "Info Satuan Lain": p.units
          .slice(1)
          .map((u) => `${u.name}(${u.price})`)
          .join(", "),
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data Produk");

      XLSX.writeFile(workbook, `Database_Produk_Warung_${new Date().toISOString().split("T")[0]}.xlsx`);
    } catch (error) {
      console.error("Gagal ekspor:", error);
      alert("Terjadi kesalahan saat mengekspor data.");
    }
  };

  // --- LOGIKA IMPOR EXCEL ---
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (data.length === 0) {
          alert("File Excel kosong atau format tidak sesuai.");
          return;
        }

        if (confirm(`Impor ${data.length} data produk? (Nama & SKU yang sama akan diupdate)`)) {
          const currentProducts = db.getProducts();

          for (const row of data) {
            const name = row["Nama Produk"] || row["Nama"];
            const sku = String(row["Barcode/SKU"] || row["SKU"] || "");
            const baseUnit = row["Satuan Dasar"] || row["Satuan"] || "Pcs";

            if (!name) continue;

            // Cari apakah produk sudah ada
            const existing = currentProducts.find((p) => (sku && p.sku === sku) || p.name.toLowerCase() === name.toLowerCase());

            const newProduct: Product = {
              id: existing?.id || `P-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              name: name,
              sku: sku,
              category: row["Kategori"] || "Umum",
              baseUnit: baseUnit,
              stock: Number(row["Stok Saat Ini"] || row["Stok"] || 0),
              minStockAlert: Number(row["Minimal Stok"] || 5),
              units: [
                {
                  name: baseUnit,
                  conversion: 1,
                  price: Number(row["Harga Jual"] || 0),
                  buyPrice: Number(row["Harga Beli"] || 0),
                },
              ],
              updatedAt: Date.now(),
            };

            await db.saveProduct(newProduct);
          }
          alert("Impor selesai!");
          refreshProducts();
        }
      } catch (err) {
        console.error("Gagal impor:", err);
        alert("Gagal membaca file Excel. Pastikan format kolom benar.");
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsBinaryString(file);
  };

  const filtered = products.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.includes(searchTerm));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Manajemen Produk</h1>
          <p className="text-sm text-slate-500">Kelola inventaris dan harga jual barang</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input type="file" ref={fileInputRef} onChange={handleImportExcel} accept=".xlsx, .xls" className="hidden" />
          <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" icon="fa-solid fa-file-import">
            Impor Excel
          </Button>
          <Button onClick={handleExportExcel} variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50" icon="fa-solid fa-file-export">
            Ekspor Excel
          </Button>
          <Button
            onClick={() => {
              setEditingProduct({ units: [{ name: "Pcs", conversion: 1, price: 0, buyPrice: 0 }], stock: "", minStockAlert: "" });
              setIsModalOpen(true);
            }}
            icon="fa-solid fa-plus"
          >
            Tambah Baru
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="w-full max-w-md">
            <Input placeholder="Cari nama atau barcode..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} prefix={<i className="fa-solid fa-search text-gray-400"></i>} />
          </div>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">Total: {products.length} produk</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
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
                  <tr key={product.id} className={`hover:bg-gray-50 transition-colors ${isLowStock ? "bg-red-50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-bold text-gray-900">{product.name}</div>
                      <div className="flex gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-400 uppercase font-bold">{product.category}</span>
                        <span className="text-[10px] text-gray-300 font-mono">| {product.sku || "-"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <div className="flex items-center justify-end gap-1">
                        <span className={`font-bold ${isLowStock ? "text-red-600" : "text-gray-700"}`}>{product.stock}</span>
                        <span className="text-[10px] text-gray-400 font-medium uppercase">{product.baseUnit}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {product.units.map((u, i) => (
                          <div key={i} className="px-2 py-1 bg-blue-50 border border-blue-100 rounded text-[10px] font-bold text-blue-700">
                            {u.name}: Rp {u.price.toLocaleString("id-ID")}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => {
                            setEditingProduct(product);
                            setIsModalOpen(true);
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          <i className="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button onClick={() => handleDelete(product.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                          <i className="fa-solid fa-trash-can"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-gray-400 italic">
                    Produk tidak ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProduct.id ? "Edit Produk" : "Tambah Produk"}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleSave}>Simpan Produk</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Nama Produk" value={editingProduct.name || ""} onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })} />
          <div className="flex gap-2">
            <Input label="Barcode/SKU" value={editingProduct.sku || ""} onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })} />
            <Button onClick={() => setShowScanner(true)} variant="secondary" className="mt-5" icon="fa-solid fa-barcode" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Kategori" value={editingProduct.category || ""} onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })} />
            <Input label="Satuan Dasar" value={editingProduct.baseUnit || ""} onChange={(e) => setEditingProduct({ ...editingProduct, baseUnit: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Stok Saat Ini" type="number" value={editingProduct.stock} onChange={(e) => setEditingProduct({ ...editingProduct, stock: e.target.value })} />
            <Input label="Min. Stok Alert" type="number" value={editingProduct.minStockAlert} onChange={(e) => setEditingProduct({ ...editingProduct, minStockAlert: e.target.value })} />
          </div>

          <div className="border-t pt-4">
            <h4 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-widest">Harga Jual (Satuan Utama)</h4>
            <div className="grid grid-cols-2 gap-2">
              <CurrencyInput
                label="Harga Beli"
                value={editingProduct.units?.[0]?.buyPrice || 0}
                onChange={(val) => {
                  const units = [...(editingProduct.units || [{ name: editingProduct.baseUnit || "Pcs", conversion: 1, price: 0, buyPrice: 0 }])];
                  units[0].buyPrice = val;
                  setEditingProduct({ ...editingProduct, units });
                }}
              />
              <CurrencyInput
                label="Harga Jual"
                value={editingProduct.units?.[0]?.price || 0}
                onChange={(val) => {
                  const units = [...(editingProduct.units || [{ name: editingProduct.baseUnit || "Pcs", conversion: 1, price: 0, buyPrice: 0 }])];
                  units[0].price = val;
                  setEditingProduct({ ...editingProduct, units });
                }}
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showScanner} onClose={() => setShowScanner(false)} title="Scan Barcode">
        <div id="product-scanner" className="w-full max-w-[300px] mx-auto bg-black rounded-xl overflow-hidden min-h-[250px] border-2 border-blue-500"></div>
        {cameraError && <p className="text-center text-red-500 text-sm mt-4 font-bold">{cameraError}</p>}
        <p className="text-center text-gray-500 text-xs mt-4">Arahkan kamera ke barcode produk</p>
      </Modal>
    </div>
  );
};

export default Products;
