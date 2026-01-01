import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { Customer, CustomerTier, AppSettings } from '../types';
import { Button, Input, Modal, Badge } from '../components/UI';

const Customers: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<AppSettings>(db.getSettings());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer>>({});
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    refreshCustomers();
    setSettings(db.getSettings());
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
      tier: editingCustomer.tier || 'Bronze',
      totalSpent: editingCustomer.totalSpent || 0,
      joinedAt: editingCustomer.joinedAt || Date.now()
    };

    db.saveCustomer(customerToSave);
    setIsModalOpen(false);
    refreshCustomers();
  };

  const handleDelete = (id: string) => {
    if (confirm('Hapus data pelanggan ini?')) {
      db.deleteCustomer(id);
      refreshCustomers();
    }
  };

  const formatRp = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

  const getTierColor = (tier: CustomerTier) => {
      switch(tier) {
          case 'Gold': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
          case 'Silver': return 'bg-gray-100 text-gray-800 border-gray-200';
          default: return 'bg-orange-50 text-orange-800 border-orange-100';
      }
  };

  // Safe accessor for discounts
  const getDiscount = (tier: string) => {
      const discounts = settings.tierDiscounts || { bronze: 0, silver: 2, gold: 5 };
      return discounts[tier.toLowerCase() as keyof typeof discounts] || 0;
  };

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phone.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-800">Manajemen Pelanggan</h1>
        <Button onClick={() => { setEditingCustomer({ tier: 'Bronze' }); setIsModalOpen(true); }} icon="fa-plus">
          Tambah Pelanggan
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
           <Input 
             placeholder="Cari nama atau no HP..." 
             value={searchTerm} 
             onChange={e => setSearchTerm(e.target.value)}
             className="max-w-md"
           />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Nama Pelanggan</th>
                <th className="px-4 py-3">No. HP</th>
                <th className="px-4 py-3">Level Member</th>
                <th className="px-4 py-3 text-right">Total Belanja</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(cust => (
                <tr key={cust.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{cust.name}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {cust.phone}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold border ${getTierColor(cust.tier)}`}>
                        {cust.tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatRp(cust.totalSpent)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => { setEditingCustomer(cust); setIsModalOpen(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded">
                        <i className="fa-solid fa-pen"></i>
                      </button>
                      <button onClick={() => handleDelete(cust.id)} className="p-2 text-red-600 hover:bg-red-50 rounded">
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <div className="p-8 text-center text-gray-500">Data tidak ditemukan</div>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCustomer.id ? "Edit Pelanggan" : "Tambah Pelanggan"}
        footer={
           <>
             <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Batal</Button>
             <Button onClick={handleSave}>Simpan</Button>
           </>
        }
      >
        <div className="space-y-4">
          <Input 
            label="Nama Pelanggan" 
            value={editingCustomer.name || ''} 
            onChange={e => setEditingCustomer({...editingCustomer, name: e.target.value})} 
            placeholder="Nama Lengkap"
          />
          <Input 
            label="Nomor HP/WA" 
            type="number"
            value={editingCustomer.phone || ''} 
            onChange={e => setEditingCustomer({...editingCustomer, phone: e.target.value})} 
            placeholder="08..."
          />
          
          <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Level Member</label>
              <div className="grid grid-cols-3 gap-2">
                  {(['Bronze', 'Silver', 'Gold'] as CustomerTier[]).map(tier => (
                      <button
                        key={tier}
                        onClick={() => setEditingCustomer({...editingCustomer, tier})}
                        className={`py-2 text-sm rounded-lg border-2 font-bold transition-all ${
                            editingCustomer.tier === tier 
                            ? 'border-blue-500 bg-blue-50 text-blue-700' 
                            : 'border-gray-100 bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                          {tier}
                      </button>
                  ))}
              </div>
              <p className="text-xs text-gray-400 mt-2 bg-gray-50 p-2 rounded border border-gray-100">
                  <i className="fa-solid fa-tags mr-1"></i> Diskon saat ini (sesuai pengaturan):<br/>
                  <span className="font-semibold text-gray-600">Gold: {getDiscount('gold')}%</span>, 
                  <span className="font-semibold text-gray-600 ml-1">Silver: {getDiscount('silver')}%</span>, 
                  <span className="font-semibold text-gray-600 ml-1">Bronze: {getDiscount('bronze')}%</span>
              </p>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Customers;