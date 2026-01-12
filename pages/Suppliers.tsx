import React, { useState, useEffect } from "react";
import { db } from "../services/db";
import { Supplier } from "../types";
import { Button, Input, Modal, Card } from "../components/UI";

const Suppliers: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Partial<Supplier>>({});
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    refreshSuppliers();
    const handleUpdate = () => refreshSuppliers();
    window.addEventListener("suppliers-updated", handleUpdate);
    return () => window.removeEventListener("suppliers-updated", handleUpdate);
  }, []);

  const refreshSuppliers = () => setSuppliers(db.getSuppliers());

  const handleSave = () => {
    if (!editingSupplier.name || !editingSupplier.phone) return;

    const supplierToSave: Supplier = {
      id: editingSupplier.id || `S-${Date.now()}`,
      name: editingSupplier.name,
      contactName: editingSupplier.contactName || "",
      phone: editingSupplier.phone,
      address: editingSupplier.address || "",
      category: editingSupplier.category || "Umum",
      updatedAt: Date.now(),
    };

    db.saveSupplier(supplierToSave);
    setIsModalOpen(false);
    refreshSuppliers();
  };

  const handleDelete = (id: string) => {
    if (confirm("Hapus data supplier ini?")) {
      db.deleteSupplier(id);
      refreshSuppliers();
    }
  };

  const filtered = suppliers.filter((s) => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.phone.includes(searchTerm));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Manajemen Supplier</h1>
          <p className="text-slate-500 text-sm">Kelola data pemasok barang dagangan Anda</p>
        </div>
        <Button
          onClick={() => {
            setEditingSupplier({ category: "Umum" });
            setIsModalOpen(true);
          }}
          icon="fa-plus"
        >
          Tambah Supplier
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <Input placeholder="Cari supplier..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="max-w-md" prefix="fa-search" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Nama Perusahaan</th>
                <th className="px-4 py-3">Kontak / HP</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Alamat</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-bold text-gray-900">{s.name}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-700">{s.contactName || "-"}</div>
                    <div className="text-xs text-blue-600 font-mono">{s.phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-gray-100 rounded text-[10px] font-bold text-gray-600 border uppercase">{s.category}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{s.address || "-"}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => {
                          setEditingSupplier(s);
                          setIsModalOpen(true);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <i className="fa-solid fa-pen"></i>
                      </button>
                      <button onClick={() => handleDelete(s.id)} className="p-2 text-red-600 hover:bg-red-50 rounded">
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400 italic">
                    Belum ada data supplier
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
        title={editingSupplier.id ? "Edit Supplier" : "Tambah Supplier"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleSave}>Simpan Supplier</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Nama Perusahaan / Toko" value={editingSupplier.name || ""} onChange={(e) => setEditingSupplier({ ...editingSupplier, name: e.target.value })} placeholder="Contoh: PT. Sumber Makmur" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nama Sales / Kontak" value={editingSupplier.contactName || ""} onChange={(e) => setEditingSupplier({ ...editingSupplier, contactName: e.target.value })} placeholder="Nama orang" />
            <Input label="No. HP / WA" value={editingSupplier.phone || ""} onChange={(e) => setEditingSupplier({ ...editingSupplier, phone: e.target.value })} placeholder="08..." />
          </div>
          <Input label="Kategori Barang" value={editingSupplier.category || ""} onChange={(e) => setEditingSupplier({ ...editingSupplier, category: e.target.value })} placeholder="Contoh: Minuman, Sembako" />
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Alamat</label>
            <textarea
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-500"
              value={editingSupplier.address || ""}
              onChange={(e) => setEditingSupplier({ ...editingSupplier, address: e.target.value })}
              rows={3}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Suppliers;
