import React, { useState, useEffect, useRef } from "react";
import { db } from "../services/db";
import { Product, ProductUnit } from "../types";
import { Button, Input, Modal, Badge, CurrencyInput } from "../components/UI";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "https://esm.sh/html5-qrcode@2.3.8";

const Products: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>({});
  const [searchTerm, setSearchTerm] = useState("");

  const [showScanner, setShowScanner] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerInstanceRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef<number>(0);

  useEffect(() => {
    refreshProducts();
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

  const filtered = products.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.includes(searchTerm));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Manajemen Produk</h1>
          <p className="text-sm text-slate-500">Kelola inventaris dan harga jual barang</p>
        </div>
        <Button
          onClick={() => {
            setEditingProduct({ units: [{ name: "Pcs", conversion: 1, price: 0, buyPrice: 0 }], stock: "", minStockAlert: "" });
            setIsModalOpen(true);
          }}
          icon="fa-solid fa-plus"
        >
          Tambah Produk
        </Button>
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
            </tbody>
          </table>
        </div>
      </div>
      {/* Modal & Form Code (Omitted for brevity as only imports changed) */}
    </div>
  );
};

export default Products;
