import React, { useState, useEffect } from "react";
import { db } from "../services/db";
import { Product, Supplier, Procurement, ProcurementItem } from "../types";
import { Button, Input, Modal, Card, CurrencyInput, Badge } from "../components/UI";

const ProcurementPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [items, setItems] = useState<ProcurementItem[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchProduct, setSearchProduct] = useState("");

  useEffect(() => {
    setSuppliers(db.getSuppliers());
    setProducts(db.getProducts());
  }, []);

  const addItem = (product: Product) => {
    // Default pakai satuan pertama (satuan utama)
    const unit = product.units[0];
    const newItem: ProcurementItem = {
      productId: product.id,
      productName: product.name,
      quantity: 1,
      unitName: unit.name,
      buyPrice: unit.buyPrice || 0,
      total: unit.buyPrice || 0,
    };
    setItems([...items, newItem]);
    setIsModalOpen(false);
  };

  const updateItem = (index: number, field: keyof ProcurementItem, value: any) => {
    const newItems = [...items];
    const item = { ...newItems[index], [field]: value };
    item.total = item.quantity * item.buyPrice;
    newItems[index] = item;
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!selectedSupplierId || items.length === 0) {
      alert("Pilih supplier dan tambahkan barang!");
      return;
    }

    const supplier = suppliers.find((s) => s.id === selectedSupplierId);
    const totalAmount = items.reduce((sum, i) => sum + i.total, 0);

    const procurement: Procurement = {
      id: `IN-${Date.now()}`,
      supplierId: selectedSupplierId,
      supplierName: supplier?.name || "Unknown",
      timestamp: Date.now(),
      items: items,
      totalAmount: totalAmount,
    };

    await db.createProcurement(procurement);
    alert("Stok berhasil masuk!");
    setItems([]);
    setSelectedSupplierId("");
  };

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(searchProduct.toLowerCase()));
  const totalBill = items.reduce((sum, i) => sum + i.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Stok Masuk</h1>
          <p className="text-sm text-slate-500">Catat belanja barang ke supplier</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Pilih Supplier</label>
              <select className="w-full p-2 border border-slate-200 rounded-lg text-sm" value={selectedSupplierId} onChange={(e) => setSelectedSupplierId(e.target.value)}>
                <option value="">-- Pilih Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button variant="secondary" onClick={() => setIsModalOpen(true)} icon="fa-plus">
                Cari Barang
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b">
                <tr>
                  <th className="px-3 py-3">Nama Barang</th>
                  <th className="px-3 py-3 w-24">Jumlah</th>
                  <th className="px-3 py-3">Harga Beli</th>
                  <th className="px-3 py-3 text-right">Subtotal</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-4">
                      <div className="font-bold">{item.productName}</div>
                      <div className="text-[10px] text-slate-400">{item.unitName}</div>
                    </td>
                    <td className="px-3 py-4">
                      <input type="number" className="w-full p-1 border rounded" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} />
                    </td>
                    <td className="px-3 py-4">
                      <CurrencyInput value={item.buyPrice} onChange={(val) => updateItem(idx, "buyPrice", val)} className="!py-1" />
                    </td>
                    <td className="px-3 py-4 text-right font-bold">Rp {item.total.toLocaleString("id-ID")}</td>
                    <td className="px-3 py-4 text-center">
                      <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400 italic">
                      Belum ada barang dipilih
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-6 h-fit sticky top-6 bg-slate-50 border-slate-200">
          <h3 className="font-bold text-slate-800 mb-4 border-b pb-2">Ringkasan Belanja</h3>
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Jumlah Item</span>
              <span className="font-bold text-slate-800">{items.length} Macam</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total Tagihan</span>
              <span className="text-xl font-black text-blue-700">Rp {totalBill.toLocaleString("id-ID")}</span>
            </div>
          </div>
          <Button className="w-full py-4 shadow-lg shadow-blue-500/20" disabled={items.length === 0 || !selectedSupplierId} onClick={handleSave}>
            Simpan Stok Masuk
          </Button>
        </Card>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Tambah Barang ke Daftar">
        <Input placeholder="Cari barang..." value={searchProduct} onChange={(e) => setSearchProduct(e.target.value)} prefix={<i className="fa-solid fa-search"></i>} autoFocus />
        <div className="mt-4 max-h-60 overflow-y-auto divide-y">
          {filteredProducts.map((p) => (
            <button key={p.id} onClick={() => addItem(p)} className="w-full flex justify-between items-center py-3 px-2 hover:bg-slate-50 transition-colors">
              <div className="text-left">
                <div className="font-bold text-sm text-slate-800">{p.name}</div>
                <div className="text-[10px] text-slate-400">
                  Stok: {p.stock} {p.baseUnit}
                </div>
              </div>
              <Badge color="blue">Pilih</Badge>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
};

export default ProcurementPage;
