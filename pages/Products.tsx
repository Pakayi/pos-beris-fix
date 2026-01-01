
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../services/db';
import { Product, ProductUnit } from '../types';
import { Button, Input, Modal, Badge, CurrencyInput } from '../components/UI';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const Products: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>({}); // Gunakan any untuk fleksibilitas input string/number saat edit
  const [searchTerm, setSearchTerm] = useState('');

  // Scanner State
  const [showScanner, setShowScanner] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const lastScanTimeRef = useRef<number>(0);

  useEffect(() => {
    refreshProducts();
  }, []);

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    let timer: any = null;

    if (showScanner) {
      setCameraError(null);
      timer = setTimeout(() => {
        const element = document.getElementById("product-scanner");
        if (element) element.innerHTML = ""; 

        try {
          scanner = new Html5QrcodeScanner(
            "product-scanner",
            { 
              fps: 10, 
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1.0,
              videoConstraints: { facingMode: "environment" },
              rememberLastUsedCamera: true,
              formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.CODE_128]
            },
            false
          );
          
          scanner.render(onScanSuccess, (err) => {});
          scannerRef.current = scanner;
        } catch (err: any) {
          console.error("Scanner init failed", err);
          setCameraError("Gagal membuka kamera. Pastikan izin kamera diberikan.");
        }
      }, 100);
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (scanner) {
        scanner.clear().catch(console.error);
      }
      scannerRef.current = null;
    };
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
    
    // Konversi nilai string kembali ke number saat simpan
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

  const handleAddUnit = () => {
    const currentUnits = editingProduct.units || [];
    setEditingProduct({
      ...editingProduct,
      units: [...currentUnits, { name: '', conversion: 1, price: 0, buyPrice: 0 }]
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

  const filtered = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-800">Manajemen Produk</h1>
        <Button onClick={() => { setEditingProduct({ units: [{name: 'Pcs', conversion: 1, price: 0, buyPrice: 0}], stock: '', minStockAlert: '' }); setIsModalOpen(true); }} icon="fa-plus">
          Tambah Produk
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
           <Input 
             placeholder="Cari produk..." 
             value={searchTerm} 
             onChange={e => setSearchTerm(e.target.value)}
             className="max-w-md"
           />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Nama Produk</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3 text-right">Stok</th>
                <th className="px-4 py-3">Satuan & Harga</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(product => {
                const isLowStock = product.stock <= product.minStockAlert;
                return (
                  <tr key={product.id} className={`hover:bg-gray-50 transition-colors ${isLowStock ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{product.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{product.sku || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge color="blue">{product.category}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {isLowStock ? (
                        <div className="flex flex-col items-end">
                           <span className="text-red-600 font-bold flex items-center gap-1">
                             <i className="fa-solid fa-triangle-exclamation text-[10px]"></i> {product.stock}
                           </span>
                        </div>
                      ) : (
                        <div className="text-gray-700 font-bold">{product.stock} <span className="text-[10px] font-normal text-gray-400">{product.baseUnit}</span></div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {product.units.map((u, i) => (
                          <div key={i} className="flex gap-2 text-[11px]">
                             <span className="font-bold w-10 text-slate-500 uppercase">{u.name}</span>
                             <span className="text-blue-600 font-semibold">Rp {u.price.toLocaleString('id-ID')}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => { setEditingProduct(product); setIsModalOpen(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded">
                          <i className="fa-solid fa-pen"></i>
                        </button>
                        <button onClick={() => handleDelete(product.id)} className="p-2 text-red-600 hover:bg-red-50 rounded">
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="p-8 text-center text-gray-500">Data tidak ditemukan</div>}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProduct.id ? "Edit Produk" : "Tambah Produk Baru"}
        footer={
           <>
             <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Batal</Button>
             <Button onClick={handleSave}>Simpan</Button>
           </>
        }
      >
        <div className="space-y-5">
          <Input 
            label="Nama Produk" 
            value={editingProduct.name || ''} 
            onChange={e => setEditingProduct({...editingProduct, name: e.target.value})} 
            placeholder="Contoh: Indomie Goreng"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input 
              label="Kategori" 
              value={editingProduct.category || ''} 
              onChange={e => setEditingProduct({...editingProduct, category: e.target.value})} 
            />
             <div className="w-full">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Barcode (SKU)</label>
                <div className="flex gap-1">
                  <input
                    className="w-full px-2 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-500 transition-all"
                    value={editingProduct.sku || ''} 
                    onChange={e => setEditingProduct({...editingProduct, sku: e.target.value})} 
                    placeholder="Scan..."
                  />
                  <Button variant="secondary" onClick={() => setShowScanner(true)} className="px-3">
                    <i className="fa-solid fa-barcode"></i>
                  </Button>
                </div>
             </div>
          </div>
          
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
            <h4 className="font-bold text-xs text-slate-400 uppercase tracking-widest mb-3">Inventori Dasar</h4>
            <div className="grid grid-cols-3 gap-3">
              <Input 
                label="Satuan Dasar" 
                placeholder="Pcs"
                value={editingProduct.baseUnit || ''}
                onChange={e => setEditingProduct({...editingProduct, baseUnit: e.target.value})}
              />
              <Input 
                label="Stok Awal" 
                inputMode="numeric"
                value={editingProduct.stock}
                onChange={e => setEditingProduct({...editingProduct, stock: e.target.value})}
                placeholder="0"
              />
               <Input 
                label="Min. Alert" 
                inputMode="numeric"
                value={editingProduct.minStockAlert}
                onChange={e => setEditingProduct({...editingProduct, minStockAlert: e.target.value})}
                placeholder="5"
              />
            </div>
          </div>

          <div>
             <div className="flex justify-between items-center mb-3">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Satuan Jual & Harga</label>
                <button onClick={handleAddUnit} className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-1 rounded-full">+ Tambah Satuan</button>
             </div>
             
             <div className="space-y-4">
               {editingProduct.units?.map((unit: any, idx: number) => (
                 <div key={idx} className="relative p-4 bg-white border border-gray-200 rounded-xl shadow-sm space-y-3">
                   {editingProduct.units && editingProduct.units.length > 1 && (
                     <button 
                        onClick={() => handleRemoveUnit(idx)} 
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-100 text-red-600 rounded-full flex items-center justify-center shadow-sm hover:bg-red-200 transition-colors z-10"
                      >
                        <i className="fa-solid fa-xmark text-[10px]"></i>
                      </button>
                   )}
                   
                   <div className="grid grid-cols-2 gap-3">
                      <Input 
                        label="Nama Satuan"
                        placeholder="Mis: Slop"
                        value={unit.name}
                        onChange={e => handleUnitChange(idx, 'name', e.target.value)}
                      />
                      <Input 
                        label="Konversi"
                        inputMode="numeric"
                        title="1 Satuan ini = Berapa satuan dasar?"
                        value={unit.conversion}
                        onChange={e => handleUnitChange(idx, 'conversion', e.target.value)}
                        className="font-mono"
                      />
                   </div>

                   <div className="space-y-3">
                      <CurrencyInput 
                        label="Harga Beli (Modal)"
                        value={unit.buyPrice || 0}
                        onChange={val => handleUnitChange(idx, 'buyPrice', val)}
                        className="bg-gray-50 border-gray-100 text-gray-600"
                      />
                      <CurrencyInput 
                        label="Harga Jual"
                        value={unit.price}
                        onChange={val => handleUnitChange(idx, 'price', val)}
                        className="border-blue-200 text-blue-700 font-bold text-base"
                      />
                   </div>
                 </div>
               ))}
             </div>
             <p className="text-[10px] text-gray-400 mt-3 italic">
               *Konversi: Isi 1 untuk satuan dasar. Contoh: Isi 10 jika 1 Slop = 10 Pcs.
             </p>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        title="Scan Barcode Produk"
        footer={<Button variant="secondary" onClick={() => setShowScanner(false)}>Batal</Button>}
      >
        <div className="flex flex-col items-center justify-center">
          {!cameraError ? (
             <div id="product-scanner" className="w-full max-w-[300px] bg-black rounded-lg overflow-hidden min-h-[250px]"></div>
          ) : (
             <div className="text-center p-6 bg-red-50 rounded-xl border border-red-100">
                <i className="fa-solid fa-video-slash text-4xl text-red-400 mb-3"></i>
                <p className="text-sm text-red-600 mb-4">{cameraError}</p>
            </div>
          )}
          <p className="text-xs text-gray-500 mt-4 text-center">
            Arahkan kamera ke barcode produk.
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default Products;
