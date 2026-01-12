
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../services/db';
import { Product, ProductUnit } from '../types';
import { Button, Input, Modal, Badge, CurrencyInput, Card } from '../components/UI';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'https://esm.sh/html5-qrcode@2.3.8';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const Products: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>({});
  const [searchTerm, setSearchTerm] = useState('');

  const [showScanner, setShowScanner] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerInstanceRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    refreshProducts();
    const handleUpdate = () => refreshProducts();
    window.addEventListener('products-updated', handleUpdate);
    return () => window.removeEventListener('products-updated', handleUpdate);
  }, []);

  useEffect(() => {
    if (showScanner) {
      setCameraError(null);
      const timer = setTimeout(async () => {
        try {
          const html5QrCode = new Html5Qrcode("product-scanner", {
            formatsToSupport: [
              Html5QrcodeSupportedFormats.EAN_13, 
              Html5QrcodeSupportedFormats.EAN_8, 
              Html5QrcodeSupportedFormats.CODE_128
            ],
            verbose: false
          });
          scannerInstanceRef.current = html5QrCode;
          
          await html5QrCode.start(
            { facingMode: "environment" },
            { 
              fps: 10, 
              qrbox: { width: 250, height: 250 }
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
            scannerInstanceRef.current.stop().then(() => {
              scannerInstanceRef.current?.clear();
            }).catch(console.error);
          }
        }
      };
    }
  }, [showScanner]);

  const onScanSuccess = (decodedText: string) => {
    const now = Date.now();
    if ((now - lastScanTimeRef.current) < 1500) return;
    lastScanTimeRef.current = now;
    setEditingProduct(prev => ({ ...prev, sku: decodedText }));
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
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) { console.error(e); }
  };

  const refreshProducts = () => {
    setProducts(db.getProducts());
  };

  const handleSave = () => {
    if (!editingProduct.name || !editingProduct.baseUnit) return;
    const productToSave: Product = {
      id: editingProduct.id || `P-${Date.now()}`,
      name: editingProduct.name,
      sku: editingProduct.sku || '',
      category: editingProduct.category || 'Umum',
      baseUnit: editingProduct.baseUnit,
      stock: editingProduct.stock === '' ? 0 : Number(editingProduct.stock),
      minStockAlert: editingProduct.minStockAlert === '' ? 5 : Number(editingProduct.minStockAlert),
      units: editingProduct.units || [{ name: editingProduct.baseUnit, conversion: 1, price: 0, buyPrice: 0 }],
      updatedAt: Date.now()
    };
    db.saveProduct(productToSave);
    setIsModalOpen(false);
    refreshProducts();
  };

  const handleDelete = (id: string) => {
    if (confirm('Hapus produk ini?')) {
      db.deleteProduct(id);
      refreshProducts();
    }
  };

  // --- Multi Unit Logic ---
  const addUnit = () => {
    const units = [...(editingProduct.units || [])];
    units.push({ name: '', conversion: 1, price: 0, buyPrice: 0 });
    setEditingProduct({ ...editingProduct, units });
  };

  const removeUnit = (index: number) => {
    if (index === 0) return; // Unit dasar tidak bisa dihapus
    const units = editingProduct.units.filter((_: any, i: number) => i !== index);
    setEditingProduct({ ...editingProduct, units });
  };

  const updateUnit = (index: number, field: keyof ProductUnit, value: any) => {
    const units = [...editingProduct.units];
    units[index] = { ...units[index], [field]: value };
    // Jika unit dasar diubah namanya, sinkronkan baseUnit
    if (index === 0 && field === 'name') {
      setEditingProduct({ ...editingProduct, units, baseUnit: value });
    } else {
      setEditingProduct({ ...editingProduct, units });
    }
  };

  const handleExportExcel = () => {
    try {
      if (products.length === 0) {
        alert("Belum ada produk untuk diekspor.");
        return;
      }
      const excelData = products.map(p => ({
        "ID Produk": p.id,
        "Nama Produk": p.name,
        "Barcode/SKU": p.sku,
        "Kategori": p.category,
        "Stok Saat Ini": p.stock,
        "Minimal Stok": p.minStockAlert,
        "Satuan Dasar": p.baseUnit,
        "Harga Beli": p.units[0]?.buyPrice || 0,
        "Harga Jual": p.units[0]?.price || 0,
        "Info Satuan Lain": p.units.slice(1).map(u => `${u.name}(${u.price})`).join(', ')
      }));
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data Produk");
      XLSX.writeFile(workbook, `Database_Produk_Warung_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      alert("Terjadi kesalahan saat mengekspor data.");
    }
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (rawData.length === 0) {
          alert("File Excel kosong.");
          return;
        }

        if (confirm(`Impor ${rawData.length} data produk? (Proses ini mungkin memakan waktu beberapa menit untuk data besar)`)) {
          setIsImporting(true);
          const currentProducts = db.getProducts();
          
          for (let i = 0; i < rawData.length; i++) {
            const row = rawData[i];
            const normalizedRow: any = {};
            Object.keys(row).forEach(k => normalizedRow[k.toUpperCase().trim()] = row[k]);

            const name = normalizedRow["NAMA"] || normalizedRow["NAMA PRODUK"] || normalizedRow["NAMA_BARANG"];
            const sku = String(normalizedRow["KODE_BARCODE"] || normalizedRow["KODE_BARANG"] || normalizedRow["SKU"] || "");
            const baseUnit = normalizedRow["SATUAN_1"] || normalizedRow["SATUAN DASAR"] || normalizedRow["SATUAN"] || "Pcs";
            const stock = Number(normalizedRow["TOKO"] || normalizedRow["STOK SAAT INI"] || normalizedRow["STOK"] || 0);
            const buyPrice = Number(normalizedRow["HPP"] || normalizedRow["HARGA BELI"] || 0);
            const price = Number(normalizedRow["HARGA_TOKO_1"] || normalizedRow["HARGA JUAL"] || 0);
            const category = normalizedRow["KATEGORI"] || "Umum";

            if (!name) continue;

            const existing = currentProducts.find(p => (sku && p.sku === sku) || (p.name.toLowerCase() === String(name).toLowerCase()));
            
            const newProduct: Product = {
              id: existing?.id || `P-${Date.now()}-${i}`,
              name: String(name),
              sku: sku,
              category: String(category),
              baseUnit: String(baseUnit),
              stock: stock,
              minStockAlert: 5,
              units: existing ? existing.units : [
                {
                  name: String(baseUnit),
                  conversion: 1,
                  price: price,
                  buyPrice: buyPrice
                }
              ],
              updatedAt: Date.now()
            };

            await db.saveProduct(newProduct);
            if (i % 100 === 0) await new Promise(r => setTimeout(r, 10));
          }
          
          setIsImporting(false);
          alert("Impor berhasil!");
          refreshProducts();
        }
      } catch (err) {
        setIsImporting(false);
        alert("Gagal membaca file Excel.");
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Manajemen Produk</h1>
          <p className="text-sm text-slate-500">Kelola {products.length} item inventaris</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input type="file" ref={fileInputRef} onChange={handleImportExcel} accept=".xlsx, .xls" className="hidden" />
          <Button onClick={() => fileInputRef.current?.click()} variant="outline" disabled={isImporting} className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" icon={isImporting ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-file-import"}>
            {isImporting ? "Mengimpor..." : "Impor Excel"}
          </Button>
          <Button onClick={handleExportExcel} variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50" icon="fa-solid fa-file-export">Ekspor</Button>
          <Button onClick={() => { setEditingProduct({ units: [{name: 'Pcs', conversion: 1, price: 0, buyPrice: 0}], stock: '', minStockAlert: '', baseUnit: 'Pcs' }); setIsModalOpen(true); }} icon="fa-solid fa-plus">Tambah Baru</Button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
           <div className="w-full max-w-md">
             <Input placeholder="Cari nama atau barcode..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} prefix={<i className="fa-solid fa-search text-gray-400"></i>} />
           </div>
           <Badge color="blue">{products.length} Produk</Badge>
        </div>
        <div className="overflow-x-auto max-h-[60vh]">
          <table className="w-full text-sm text-left sticky-header">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3">Nama Produk</th>
                <th className="px-4 py-3 text-right">Stok</th>
                <th className="px-4 py-3">Satuan & Harga</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.slice(0, 100).map(product => {
                const isLowStock = product.stock <= product.minStockAlert;
                return (
                  <tr key={product.id} className={`hover:bg-gray-50 transition-colors ${isLowStock ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-bold text-gray-900">{product.name}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{product.sku || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={`font-bold ${isLowStock ? 'text-red-600' : 'text-gray-700'}`}>{product.stock}</span>
                      <span className="text-[10px] text-gray-400 ml-1 uppercase">{product.baseUnit}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {product.units.map((u, i) => (
                          <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold border border-blue-100">
                            {u.name}: {u.price.toLocaleString('id-ID')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => { setEditingProduct(product); setIsModalOpen(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><i className="fa-solid fa-pen-to-square"></i></button>
                        <button onClick={() => handleDelete(product.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><i className="fa-solid fa-trash-can"></i></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Batal</Button>
            <Button onClick={handleSave}>Simpan Produk</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Nama Produk" value={editingProduct.name || ''} onChange={e => setEditingProduct({...editingProduct, name: e.target.value})} />
          <div className="flex gap-2">
            <Input label="Barcode/SKU" value={editingProduct.sku || ''} onChange={e => setEditingProduct({...editingProduct, sku: e.target.value})} />
            <Button onClick={() => setShowScanner(true)} variant="secondary" className="mt-5" icon="fa-solid fa-barcode" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Kategori" value={editingProduct.category || ''} onChange={e => setEditingProduct({...editingProduct, category: e.target.value})} />
            <Input label="Satuan Dasar" value={editingProduct.baseUnit || ''} onChange={e => updateUnit(0, 'name', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2 border-b pb-4">
            <Input label="Stok Saat Ini" type="number" value={editingProduct.stock} onChange={e => setEditingProduct({...editingProduct, stock: e.target.value})} />
            <Input label="Min. Stok Alert" type="number" value={editingProduct.minStockAlert} onChange={e => setEditingProduct({...editingProduct, minStockAlert: e.target.value})} />
          </div>

          <div className="space-y-3">
             <div className="flex justify-between items-center">
               <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Daftar Satuan & Harga</h4>
               <Button size="sm" variant="outline" onClick={addUnit} icon="fa-solid fa-plus-circle">Tambah Satuan</Button>
             </div>
             
             {editingProduct.units?.map((unit: any, idx: number) => (
               <div key={idx} className={`p-3 rounded-xl border ${idx === 0 ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-200'} space-y-2 relative`}>
                 <div className="grid grid-cols-2 gap-2">
                    <Input label={idx === 0 ? "Nama Satuan Utama" : "Nama Satuan"} value={unit.name} onChange={e => updateUnit(idx, 'name', e.target.value)} placeholder="Misal: Dus" />
                    <Input label="Konversi (Isi)" type="number" disabled={idx === 0} value={unit.conversion} onChange={e => updateUnit(idx, 'conversion', Number(e.target.value))} placeholder="Misal: 10" />
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                    <CurrencyInput label="Harga Beli" value={unit.buyPrice} onChange={val => updateUnit(idx, 'buyPrice', val)} />
                    <CurrencyInput label="Harga Jual" value={unit.price} onChange={val => updateUnit(idx, 'price', val)} />
                 </div>
                 {idx > 0 && (
                   <button onClick={() => removeUnit(idx)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] shadow-sm"><i className="fa-solid fa-times"></i></button>
                 )}
                 {idx === 0 && <span className="absolute top-2 right-3 text-[9px] font-bold text-blue-500 uppercase">Utama</span>}
               </div>
             ))}
          </div>
        </div>
      </Modal>

      <Modal isOpen={showScanner} onClose={() => setShowScanner(false)} title="Scan Barcode">
        <div id="product-scanner" className="w-full max-w-[300px] mx-auto bg-black rounded-xl overflow-hidden min-h-[250px] border-2 border-blue-500"></div>
        <p className="text-center text-gray-500 text-xs mt-4">Scan barcode barang untuk mengisi SKU</p>
      </Modal>

      {isImporting && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6 text-center">
           <Card className="p-8 max-w-sm w-full space-y-4">
              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <h3 className="text-lg font-bold">Sinkronisasi Data...</h3>
              <p className="text-sm text-gray-500">Mohon tunggu, kami sedang mengimpor ribuan data ke database Anda.</p>
           </Card>
        </div>
      )}
    </div>
  );
};

export default Products;
