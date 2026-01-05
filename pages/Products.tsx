import React, { useState, useEffect, useRef } from "react";
import { db } from "../services/db";
import { Product, ProductUnit } from "../types";
import { Button, Input, Modal, Badge, CurrencyInput } from "../components/UI";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { GoogleGenAI, Type } from "@google/genai";

const Products: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>({});
  const [searchTerm, setSearchTerm] = useState("");

  // AI State
  const [isAiFilling, setIsAiFilling] = useState(false);

  // Scanner State
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

  const handleAddUnit = () => {
    const currentUnits = editingProduct.units || [];
    setEditingProduct({
      ...editingProduct,
      units: [...currentUnits, { name: "", conversion: 1, price: 0, buyPrice: 0 }],
    });
  };

  const handleUnitChange = (index: number, field: keyof ProductUnit, value: any) => {
    const newUnits = [...(editingProduct.units || [])];
    newUnits[index] = { ...newUnits[index], [field]: value };
    setEditingProduct({ ...editingProduct, units: newUnits });
  };

  const handleRemoveUnit = (index: number) => {
    if ((editingProduct.units?.length || 0) <= 1) return;
    const newUnits = [...(editingProduct.units || [])];
    newUnits.splice(index, 1);
    setEditingProduct({ ...editingProduct, units: newUnits });
  };

  // --- AI SMART FILL LOGIC ---
  const handleAiSmartFill = async () => {
    if (!editingProduct.name) {
      alert("Masukkan nama produk dulu, Bro!");
      return;
    }

    setIsAiFilling(true);
    try {
      const aistudio = (window as any).aistudio;
      if (aistudio && !(await aistudio.hasSelectedApiKey())) {
        await aistudio.openSelectKey();
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analisis produk ini: "${editingProduct.name}".
        Tentukan kategori yang paling cocok (misal: Sembako, Minuman, Snack, Sabun, Rokok) 
        dan berikan estimasi harga jual wajar untuk 1 pcs/satuan dasar dalam rupiah.
        Berikan jawaban dalam JSON format.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              suggestedPrice: { type: Type.NUMBER },
              suggestedBaseUnit: { type: Type.STRING },
            },
            required: ["category", "suggestedPrice", "suggestedBaseUnit"],
          },
        },
      });

      const data = JSON.parse(response.text || "{}");

      setEditingProduct((prev) => ({
        ...prev,
        category: data.category || prev.category,
        baseUnit: data.suggestedBaseUnit || prev.baseUnit,
        units: prev.units.map((u, i) => (i === 0 ? { ...u, price: data.suggestedPrice || u.price, name: data.suggestedBaseUnit || u.name } : u)),
      }));
    } catch (e: any) {
      console.error("AI Error:", e);
      if (e.message?.includes("Requested entity was not found")) {
        const aistudio = (window as any).aistudio;
        if (aistudio) await aistudio.openSelectKey();
      }
      alert("AI Cak Warung lagi meriang, isi manual dulu ya!");
    } finally {
      setIsAiFilling(false);
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
          icon="fa-plus"
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
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <i className="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button onClick={() => handleDelete(product.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <i className="fa-solid fa-trash-can"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-gray-400">
                    <i className="fa-solid fa-magnifying-glass text-3xl mb-3 block opacity-20"></i>
                    Produk tidak ditemukan
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingProduct.id ? "Edit Produk" : "Tambah Produk"}>
        <div className="space-y-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input label="Nama Produk" value={editingProduct.name || ""} onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })} placeholder="Contoh: Indomie Goreng" />
            </div>
            <Button type="button" variant="secondary" size="md" onClick={handleAiSmartFill} disabled={isAiFilling || !editingProduct.name} className="bg-indigo-50 text-indigo-700 border-indigo-100 h-[38px]">
              <i className={`fa-solid ${isAiFilling ? "fa-spinner fa-spin" : "fa-wand-magic-sparkles"} mr-1`}></i>
              {isAiFilling ? "Mikir..." : "AI"}
            </Button>
          </div>

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
            <Input label="Stok Awal" inputMode="numeric" value={editingProduct.stock} onChange={(e) => setEditingProduct({ ...editingProduct, stock: e.target.value })} />
            <Input label="Min. Alert" inputMode="numeric" value={editingProduct.minStockAlert} onChange={(e) => setEditingProduct({ ...editingProduct, minStockAlert: e.target.value })} />
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Satuan & Harga</label>
              <button onClick={handleAddUnit} className="text-xs text-blue-600 font-bold hover:underline">
                + Tambah Satuan
              </button>
            </div>
            {editingProduct.units?.map((unit: any, idx: number) => (
              <div key={idx} className="p-4 border border-blue-100 bg-blue-50/20 rounded-xl space-y-3 relative">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Nama Satuan (Pcs/Dus)" value={unit.name} onChange={(e) => handleUnitChange(idx, "name", e.target.value)} />
                  <Input label="Isi (Konversi)" inputMode="numeric" value={unit.conversion} onChange={(e) => handleUnitChange(idx, "conversion", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <CurrencyInput label="Harga Beli (Modal)" value={unit.buyPrice || 0} onChange={(val) => handleUnitChange(idx, "buyPrice", val)} />
                  <CurrencyInput label="Harga Jual" value={unit.price} onChange={(val) => handleUnitChange(idx, "price", val)} />
                </div>
                {editingProduct.units.length > 1 && (
                  <button onClick={() => handleRemoveUnit(idx)} className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
                    <i className="fa-solid fa-times text-xs"></i>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
            Batal
          </Button>
          <Button onClick={handleSave}>Simpan Produk</Button>
        </div>
      </Modal>

      <Modal isOpen={showScanner} onClose={() => setShowScanner(false)} title="Scan Barcode SKU">
        <div className="flex flex-col items-center">
          {!cameraError ? <div id="product-scanner" className="w-full max-w-[300px] bg-black rounded-lg min-h-[250px] border-2 border-blue-500"></div> : <p className="text-red-500">{cameraError}</p>}
          <p className="text-xs text-blue-600 font-bold mt-4 animate-pulse">
            <i className="fa-solid fa-video mr-1"></i> Kamera Sedang Mencari Barcode...
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default Products;
