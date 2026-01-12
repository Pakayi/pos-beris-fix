import React, { useState, useEffect, useMemo } from "react";
import { db } from "../services/db";
import { Customer, DebtPayment, Transaction } from "../types";
import { Button, Input, Modal, Card, Badge, CurrencyInput } from "../components/UI";

const DebtBook: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [payments, setPayments] = useState<DebtPayment[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);

  const [payAmount, setPayAmount] = useState(0);
  const [payNote, setPayNote] = useState("");

  useEffect(() => {
    refresh();
    const handleUpdate = () => refresh();
    window.addEventListener("customers-updated", handleUpdate);
    window.addEventListener("debt-payments-updated", handleUpdate);
    return () => {
      window.removeEventListener("customers-updated", handleUpdate);
      window.removeEventListener("debt-payments-updated", handleUpdate);
    };
  }, []);

  const refresh = () => {
    setCustomers(db.getCustomers());
    setTransactions(db.getTransactions());
    setPayments(db.getDebtPayments());
  };

  const filtered = customers.filter((c) => c.debtBalance > 0).filter((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const totalOutstanding = useMemo(() => {
    return customers.reduce((sum, c) => sum + (c.debtBalance || 0), 0);
  }, [customers]);

  const handlePayDebt = async () => {
    if (!selectedCustomer || payAmount <= 0) return;

    const payment: DebtPayment = {
      id: `PAY-${Date.now()}`,
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      amount: payAmount,
      timestamp: Date.now(),
      note: payNote,
    };

    await db.createDebtPayment(payment);
    setIsPayModalOpen(false);
    setPayAmount(0);
    setPayNote("");
    refresh();
    alert("Pembayaran berhasil dicatat!");
  };

  const customerHistory = useMemo(() => {
    if (!selectedCustomer) return [];

    const hDebts = transactions.filter((t) => t.customerId === selectedCustomer.id && t.paymentMethod === "debt").map((t) => ({ id: t.id, type: "debt", amount: t.totalAmount, date: t.timestamp, note: "Belanja Hutang" }));

    const hPays = payments.filter((p) => p.customerId === selectedCustomer.id).map((p) => ({ id: p.id, type: "pay", amount: p.amount, date: p.timestamp, note: p.note || "Bayar Cicilan" }));

    return [...hDebts, ...hPays].sort((a, b) => b.date - a.date);
  }, [selectedCustomer, transactions, payments]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Buku Hutang (Kasbon)</h1>
          <p className="text-sm text-slate-500">Kelola piutang pelanggan warung Anda</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 bg-red-50 border-red-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-xl flex items-center justify-center text-xl">
            <i className="fa-solid fa-file-invoice-dollar"></i>
          </div>
          <div>
            <p className="text-[10px] font-bold text-red-700 uppercase">Total Piutang</p>
            <p className="text-2xl font-black text-red-800">Rp {totalOutstanding.toLocaleString("id-ID")}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center text-xl">
            <i className="fa-solid fa-users"></i>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Debitur Aktif</p>
            <p className="text-2xl font-black text-slate-800">{filtered.length} Orang</p>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <Input placeholder="Cari nama pelanggan..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} prefix={<i className="fa-solid fa-search"></i>} />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c) => (
          <Card key={c.id} className="p-5 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-slate-800">{c.name}</h3>
                <p className="text-[10px] text-slate-400 font-mono">{c.phone}</p>
              </div>
              <Badge color="red">HUTANG</Badge>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-4">
              <p className="text-[10px] text-slate-500 font-bold uppercase">Sisa Tagihan</p>
              <p className="text-xl font-black text-red-600">Rp {c.debtBalance.toLocaleString("id-ID")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedCustomer(c);
                  setIsDetailOpen(true);
                }}
              >
                Detail
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  setSelectedCustomer(c);
                  setPayAmount(c.debtBalance);
                  setIsPayModalOpen(true);
                }}
              >
                Bayar
              </Button>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <i className="fa-solid fa-face-laugh-beam text-4xl text-emerald-400 mb-3"></i>
            <p className="text-slate-500 italic">Hebat! Tidak ada pelanggan yang berhutang saat ini.</p>
          </div>
        )}
      </div>

      {/* Modal Detail Riwayat */}
      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title={`Riwayat Hutang: ${selectedCustomer?.name}`}>
        <div className="space-y-4">
          <div className="p-4 bg-slate-900 text-white rounded-xl text-center">
            <p className="text-xs text-slate-400">Total Hutang Sekarang</p>
            <p className="text-2xl font-black text-blue-400">Rp {selectedCustomer?.debtBalance.toLocaleString("id-ID")}</p>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
            {customerHistory.map((h) => (
              <div key={h.id} className={`p-3 rounded-lg border flex justify-between items-center ${h.type === "debt" ? "border-red-100 bg-red-50/30" : "border-emerald-100 bg-emerald-50/30"}`}>
                <div>
                  <p className="text-xs font-bold text-slate-700">{h.note}</p>
                  <p className="text-[10px] text-slate-400">{new Date(h.date).toLocaleDateString("id-ID")}</p>
                </div>
                <p className={`font-bold ${h.type === "debt" ? "text-red-600" : "text-emerald-600"}`}>
                  {h.type === "debt" ? "+" : "-"} {h.amount.toLocaleString("id-ID")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Modal Bayar Hutang */}
      <Modal
        isOpen={isPayModalOpen}
        onClose={() => setIsPayModalOpen(false)}
        title="Catat Pembayaran Hutang"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsPayModalOpen(false)}>
              Batal
            </Button>
            <Button onClick={handlePayDebt}>Simpan Pembayaran</Button>
          </>
        }
      >
        <div className="space-y-4">
          <CurrencyInput label="Jumlah Bayar" value={payAmount} onChange={setPayAmount} autoFocus />
          <Input label="Catatan (Opsional)" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Misal: Bayar lunas / titip 50rb" />
          <div className="p-3 bg-blue-50 text-blue-700 rounded-lg text-[10px] italic">Pembayaran ini akan otomatis memotong saldo hutang pelanggan {selectedCustomer?.name}.</div>
        </div>
      </Modal>
    </div>
  );
};

export default DebtBook;
