import React, { useState, useEffect, useMemo } from "react";
import { db } from "../services/db";
import { Supplier, Product, Procurement } from "../types";
import { Button, Input, Modal, Card, Badge } from "../components/UI";

const Suppliers: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [procurements, setProcurements] = useState<Procurement[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Partial<Supplier>>({});
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    refresh();
    const handleUpdate = () => refresh();
    window.addEventListener("suppliers-updated", handleUpdate);
    window.addEventListener("products-updated", handleUpdate);
    return () => {
      window.removeEventListener("suppliers-updated", handleUpdate);
      window.removeEventListener("products-updated", handleUpdate);
    };
  }, []);

  const refresh = () => {
    setSuppliers(db.getSuppliers());
    setProducts(db.getProducts());
    setProcurements(db.getProcurements());
  };

  const handleSave = () => {
    if (!editingSupplier.name) return;
    const s: Supplier = {
      id: editingSupplier.id || `S-${Date.now()}`,
      name: editingSupplier.name,
      contact: editingSupplier.contact || "",
      address: editingSupplier.address || "",
      description: editingSupplier.description || "",
    };
    db.saveSupplier(s);
    setIsModalOpen(false);
    refresh();
  };

  const handleDelete = (id: string) => {
    if (confirm("Hapus supplier ini?")) {
      db.deleteSupplier(id);
      refresh();
    }
  };

  const openDetail = (s: Supplier) => {
    setSelectedSupplier(s);
    setIsDetailOpen(true);
  };

  const filtered = suppliers.filter((s) => s.name.toLowerCase().includes(searchTerm.toLowerCase()));

  // Menghitung statistik per supplier
  const supplierStats = useMemo(() => {
    const stats: Record<string, { totalProducts: number; totalSpend: number }> = {};
    suppliers.forEach((s) => {
      const supplierProducts = products.filter((p) => p.supplierId === s.id);
      const supplierProcurements = procurements.filter((pr) => pr.supplierId === s.id);
      const totalSpend = supplierProcurements.reduce((sum, pr) => sum + pr.totalAmount, 0);

      stats[s.id] = {
        totalProducts: supplierProducts.length,
        totalSpend: totalSpend,
      };
    });
    return stats;
  }, [suppliers, products, procurements]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Daftar Supplier</h1>
          <p className="text-sm text-slate-500">Kelola dan lihat laporan penyuplai barang</p>
        </div>
        <Button
          onClick={() => {
            setEditingSupplier({});
            setIsModalOpen(true);
          }}
          icon="fa-plus"
        >
          Tambah Supplier
        </Button>
      </div>

      <Card className="p-4 flex gap-4">
        <Input placeholder="Cari nama supplier..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} prefix={<i className="fa-solid fa-search"></i>} />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((s) => {
          const stat = supplierStats[s.id] || { totalProducts: 0, totalSpend: 0 };
          return (
            <Card key={s.id} className="p-5 flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg text-slate-800">{s.name}</h3>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setEditingSupplier(s);
                        setIsModalOpen(true);
                      }}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                    >
                      <i className="fa-solid fa-pen"></i>
                    </button>
                    <button onClick={() => handleDelete(s.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Produk</p>
                    <p className="font-bold text-slate-700">{stat.totalProducts} Item</p>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Total Belanja</p>
                    <p className="font-bold text-blue-700">Rp {stat.totalSpend.toLocaleString("id-ID", { notation: "compact" })}</p>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <i className="fa-brands fa-whatsapp text-emerald-500"></i>
                    <span>{s.contact || "-"}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <i className="fa-solid fa-location-dot text-red-400 mt-1"></i>
                    <span className="line-clamp-1">{s.address || "Alamat tidak diisi"}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button onClick={() => openDetail(s)} className="py-2 bg-blue-50 text-blue-700 text-center rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors">
                  <i className="fa-solid fa-chart-line mr-1"></i> LAPORAN
                </button>
                <a href={`https://wa.me/${s.contact.replace(/\D/g, "")}`} target="_blank" className="py-2 bg-emerald-50 text-emerald-700 text-center rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors">
                  <i className="fa-brands fa-whatsapp mr-1"></i> CHAT WA
                </a>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Modal Add/Edit */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSupplier.id ? "Edit Supplier" : "Tambah Supplier"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleSave}>Simpan</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Nama Supplier" value={editingSupplier.name || ""} onChange={(e) => setEditingSupplier({ ...editingSupplier, name: e.target.value })} placeholder="Misal: PT. Indofood" />
          <Input label="Kontak / No WA" value={editingSupplier.contact || ""} onChange={(e) => setEditingSupplier({ ...editingSupplier, contact: e.target.value })} placeholder="08..." />
          <Input label="Alamat" value={editingSupplier.address || ""} onChange={(e) => setEditingSupplier({ ...editingSupplier, address: e.target.value })} />
          <Input label="Catatan Tambahan" value={editingSupplier.description || ""} onChange={(e) => setEditingSupplier({ ...editingSupplier, description: e.target.value })} />
        </div>
      </Modal>

      {/* Modal Laporan Detail Supplier */}
      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title={`Laporan: ${selectedSupplier?.name}`}>
        <div className="space-y-6">
          {/* Ringkasan */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
              <p className="text-xs text-blue-600 font-bold uppercase">Total Belanja</p>
              <p className="text-xl font-black text-blue-800">Rp {(supplierStats[selectedSupplier?.id || ""]?.totalSpend || 0).toLocaleString("id-ID")}</p>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
              <p className="text-xs text-slate-500 font-bold uppercase">Jumlah Produk</p>
              <p className="text-xl font-black text-slate-800">{supplierStats[selectedSupplier?.id || ""]?.totalProducts || 0} Macam</p>
            </div>
          </div>

          {/* Daftar Produk */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <i className="fa-solid fa-box text-blue-400"></i> PRODUK YANG DISUPLAI
            </h4>
            <div className="max-h-48 overflow-y-auto border rounded-xl divide-y">
              {products
                .filter((p) => p.supplierId === selectedSupplier?.id)
                .map((p) => (
                  <div key={p.id} className="p-3 flex justify-between items-center text-sm">
                    <span className="font-medium text-slate-700">{p.name}</span>
                    <Badge color={p.stock <= p.minStockAlert ? "red" : "blue"}>
                      Stok: {p.stock} {p.baseUnit}
                    </Badge>
                  </div>
                ))}
              {products.filter((p) => p.supplierId === selectedSupplier?.id).length === 0 && <p className="p-4 text-center text-xs text-slate-400 italic">Belum ada produk dikaitkan</p>}
            </div>
          </div>

          {/* Riwayat Pengadaan */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <i className="fa-solid fa-truck-loading text-emerald-400"></i> RIWAYAT STOK MASUK
            </h4>
            <div className="max-h-48 overflow-y-auto border rounded-xl divide-y">
              {procurements
                .filter((pr) => pr.supplierId === selectedSupplier?.id)
                .map((pr) => (
                  <div key={pr.id} className="p-3 flex flex-col gap-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-mono text-slate-400">{new Date(pr.timestamp).toLocaleDateString("id-ID")}</span>
                      <span className="font-bold text-emerald-600">Rp {pr.totalAmount.toLocaleString("id-ID")}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 line-clamp-1">{pr.items.map((i) => i.productName).join(", ")}</p>
                  </div>
                ))}
              {procurements.filter((pr) => pr.supplierId === selectedSupplier?.id).length === 0 && <p className="p-4 text-center text-xs text-slate-400 italic">Belum ada riwayat belanja</p>}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Suppliers;
