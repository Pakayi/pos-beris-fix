import React, { useState, useEffect } from "react";
import { db } from "../services/db";
import { Customer, CustomerTier, AppSettings } from "../types";
import { Button, Input, Modal, Badge } from "../components/UI";

const Customers: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<AppSettings>(db.getSettings());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer>>({});
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    refreshCustomers();
    setSettings(db.getSettings());
    const handleUpdate = () => refreshCustomers();
    window.addEventListener("customers-updated", handleUpdate);
    return () => window.removeEventListener("customers-updated", handleUpdate);
  }, []);

  const refreshCustomers = () => {
    setCustomers(db.getCustomers());
  };

  const handleSave = () => {
    if (!editingCustomer.name || !editingCustomer.phone) return;

    const customerToSave: Customer = {
      id: editingCustomer.id || `C-${Date.now()}`,
      name: editingCustomer.name,
      phone: editingCustomer.phone,
      tier: editingCustomer.tier || "Bronze",
      totalSpent: editingCustomer.totalSpent || 0,
      debtBalance: editingCustomer.debtBalance || 0,
      joinedAt: editingCustomer.joinedAt || Date.now(),
    };

    db.saveCustomer(customerToSave);
    setIsModalOpen(false);
    refreshCustomers();
  };

  const handleDelete = (id: string) => {
    if (confirm("Hapus data pelanggan ini?")) {
      db.deleteCustomer(id);
      refreshCustomers();
    }
  };

  const formatRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

  const getTierColor = (tier: CustomerTier) => {
    switch (tier) {
      case "Gold":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "Silver":
        return "bg-gray-100 text-gray-800 border-gray-200";
      default:
        return "bg-orange-50 text-orange-800 border-orange-100";
    }
  };

  const getDiscount = (tier: string) => {
    const discounts = settings.tierDiscounts || { bronze: 0, silver: 2, gold: 5 };
    return discounts[tier.toLowerCase() as keyof typeof discounts] || 0;
  };

  const filtered = customers.filter((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Manajemen Pelanggan</h1>
          <p className="text-sm text-slate-500">Total {customers.length} member terdaftar</p>
        </div>
        <Button
          onClick={() => {
            setEditingCustomer({ tier: "Bronze", debtBalance: 0 });
            setIsModalOpen(true);
          }}
          icon="fa-plus"
        >
          Tambah Pelanggan
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <Input placeholder="Cari nama atau no HP..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="max-w-md" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Nama Pelanggan</th>
                <th className="px-4 py-3">Level Member</th>
                <th className="px-4 py-3 text-right">Saldo Hutang</th>
                <th className="px-4 py-3 text-right">Total Belanja</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((cust) => (
                <tr key={cust.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-bold text-gray-900">{cust.name}</div>
                    <div className="text-[10px] text-gray-400 font-mono">{cust.phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-black border ${getTierColor(cust.tier)}`}>{cust.tier.toUpperCase()}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span className={cust.debtBalance > 0 ? "text-red-600 font-bold" : "text-slate-400"}>{formatRp(cust.debtBalance)}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium">{formatRp(cust.totalSpent)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => {
                          setEditingCustomer(cust);
                          setIsModalOpen(true);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        <i className="fa-solid fa-pen"></i>
                      </button>
                      <button onClick={() => handleDelete(cust.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500 italic">
                    Data tidak ditemukan
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
        title={editingCustomer.id ? "Edit Pelanggan" : "Tambah Pelanggan"}
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
          <Input label="Nama Pelanggan" value={editingCustomer.name || ""} onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })} placeholder="Nama Lengkap" />
          <Input label="Nomor HP/WA" type="number" value={editingCustomer.phone || ""} onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })} placeholder="08..." />

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Level Member</label>
            <div className="grid grid-cols-3 gap-2">
              {(["Bronze", "Silver", "Gold"] as CustomerTier[]).map((tier) => (
                <button
                  key={tier}
                  onClick={() => setEditingCustomer({ ...editingCustomer, tier })}
                  className={`py-2 text-xs rounded-lg border-2 font-black transition-all ${editingCustomer.tier === tier ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-100 bg-white text-gray-500 hover:bg-gray-50"}`}
                >
                  {tier.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] text-blue-700 font-bold uppercase">Saldo Hutang</span>
              <Badge color={editingCustomer.debtBalance ? "red" : "green"}>{editingCustomer.debtBalance ? "Punya Hutang" : "Lunas"}</Badge>
            </div>
            <p className="text-lg font-black text-blue-800">{formatRp(editingCustomer.debtBalance || 0)}</p>
            <p className="text-[9px] text-blue-500 mt-1 italic">* Saldo ini otomatis bertambah jika ada transaksi kasir bermetode "Hutang".</p>
          </div>

          <div className="p-2 bg-gray-50 rounded border border-gray-100">
            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Benefit Diskon:</p>
            <div className="flex gap-4 text-[10px] font-bold text-gray-600">
              <span>Gold: {getDiscount("gold")}%</span>
              <span>Silver: {getDiscount("silver")}%</span>
              <span>Bronze: {getDiscount("bronze")}%</span>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Customers;
