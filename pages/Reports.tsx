import React, { useState, useEffect, useMemo } from "react";
import { db } from "../services/db";
import { Transaction, Product, AppSettings, DebtPayment } from "../types";
import { Card, Button, Badge } from "../components/UI";
import { jsPDF } from "https://aistudiocdn.com/jspdf@^2.5.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

type DateRange = "today" | "week" | "month" | "all";

const Reports: React.FC = () => {
  const [range, setRange] = useState<DateRange>("week");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debtPayments, setDebtPayments] = useState<DebtPayment[]>([]);
  const [settings, setSettings] = useState<AppSettings>(db.getSettings());
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    refreshData();
    const handleUpdate = () => refreshData();
    window.addEventListener("debt-payments-updated", handleUpdate);
    window.addEventListener("profile-updated", handleUpdate);
    return () => {
      window.removeEventListener("debt-payments-updated", handleUpdate);
      window.removeEventListener("profile-updated", handleUpdate);
    };
  }, []);

  const refreshData = () => {
    setTransactions(db.getTransactions());
    setDebtPayments(db.getDebtPayments());
    setSettings(db.getSettings());
  };

  const stats = useMemo(() => {
    const now = new Date();
    let startDate = 0;

    if (range === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    } else if (range === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      startDate = d.getTime();
    } else if (range === "month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    }

    const filteredTx = transactions.filter((t) => t.timestamp >= startDate);
    const filteredPays = debtPayments.filter((p) => p.timestamp >= startDate);

    const totalRevenue = filteredTx.reduce((sum, t) => sum + t.totalAmount, 0);
    const totalTransactions = filteredTx.length;

    // Hitung Hutang yang muncul di periode ini
    const totalDebtGenerated = filteredTx.filter((t) => t.paymentMethod === "debt").reduce((sum, t) => sum + t.totalAmount, 0);
    // Hitung Cicilan Hutang yang masuk di periode ini
    const totalDebtCollected = filteredPays.reduce((sum, p) => sum + p.amount, 0);

    // Kas Masuk = (Omzet Non-Hutang) + Cicilan Hutang
    const actualCashCollected = totalRevenue - totalDebtGenerated + totalDebtCollected;

    let totalProfit = 0;
    filteredTx.forEach((t) => {
      t.items.forEach((item) => {
        const cost = (item.buyPrice || item.price * 0.8) * item.quantity;
        const revenue = item.price * item.quantity;
        totalProfit += revenue - cost;
      });
      if (t.discountAmount) {
        totalProfit -= t.discountAmount;
      }
    });

    const productMap = new Map<string, { name: string; qty: number; revenue: number }>();
    filteredTx.forEach((t) => {
      t.items.forEach((item) => {
        const existing = productMap.get(item.productName) || { name: item.productName, qty: 0, revenue: 0 };
        productMap.set(item.productName, {
          name: item.productName,
          qty: existing.qty + item.quantity,
          revenue: existing.revenue + item.price * item.quantity,
        });
      });
    });

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return {
      totalRevenue,
      totalProfit,
      totalTransactions,
      actualCashCollected,
      totalDebtGenerated,
      totalDebtCollected,
      topProducts,
      filteredTx,
    };
  }, [range, transactions, debtPayments]);

  const formatRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

  const handlePrintPDF = () => {
    setIsProcessing(true);
    try {
      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text(`Laporan Penjualan - ${settings.storeName}`, 14, 20);
      doc.setFontSize(12);
      doc.text(`Periode: ${range}`, 14, 30);

      doc.text(`Total Omzet: ${formatRp(stats.totalRevenue)}`, 14, 45);
      doc.text(`Kas Masuk Riil: ${formatRp(stats.actualCashCollected)}`, 14, 55);
      doc.text(`Total Untung: ${formatRp(stats.totalProfit)}`, 14, 65);

      doc.setFontSize(14);
      doc.text("Top 5 Produk:", 14, 80);
      stats.topProducts.forEach((p, i) => {
        doc.setFontSize(10);
        doc.text(`${i + 1}. ${p.name} - ${p.qty} terjual (${formatRp(p.revenue)})`, 14, 90 + i * 7);
      });

      doc.save(`Laporan_${range}.pdf`);
    } catch (e) {
      alert("Gagal cetak PDF");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportExcel = () => {
    try {
      if (stats.filteredTx.length === 0) {
        alert("Tidak ada data untuk diekspor.");
        return;
      }

      const excelData = stats.filteredTx.map((t) => ({
        "ID Transaksi": t.id,
        Tanggal: new Date(t.timestamp).toLocaleString("id-ID"),
        Pelanggan: t.customerName || "Umum",
        "Metode Bayar": t.paymentMethod.toUpperCase(),
        "Item Barang": t.items.map((i) => `${i.productName} (${i.quantity} ${i.unitName})`).join("; "),
        "Total Belanja (Rp)": t.totalAmount,
        "Status Pembayaran": t.paymentMethod === "debt" ? "HUTANG (BELUM LUNAS)" : "LUNAS",
        "Diskon (Rp)": t.discountAmount || 0,
        "Untung (Rp)":
          t.items.reduce((sum, item) => {
            const cost = (item.buyPrice || item.price * 0.8) * item.quantity;
            return sum + (item.price * item.quantity - cost);
          }, 0) - (t.discountAmount || 0),
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const wscols = [{ wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 45 }, { wch: 18 }, { wch: 20 }, { wch: 15 }, { wch: 15 }];
      worksheet["!cols"] = wscols;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Penjualan");

      const dateStr = new Date().toISOString().split("T")[0];
      XLSX.writeFile(workbook, `Laporan_Warung_${range}_${dateStr}.xlsx`);
    } catch (error) {
      console.error("Gagal ekspor Excel:", error);
      alert("Terjadi kesalahan saat membuat file Excel.");
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Laporan Bisnis</h1>
          <p className="text-slate-500">Analisis performa warung Anda</p>
        </div>
        <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
          {(["today", "week", "month", "all"] as DateRange[]).map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${range === r ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"}`}>
              {r === "today" ? "Hari Ini" : r === "week" ? "7 Hari" : r === "month" ? "Bulan" : "Semua"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-6 border-l-4 border-l-blue-500 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Total Omzet</span>
            <h3 className="text-3xl font-black text-slate-800 mt-2">{formatRp(stats.totalRevenue)}</h3>
            <p className="text-[10px] text-slate-400 mt-1">Nilai seluruh barang keluar</p>
          </Card>

          <Card className="p-6 border-l-4 border-l-emerald-500 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Kas Masuk Riil</span>
            <h3 className="text-3xl font-black text-emerald-700 mt-2">{formatRp(stats.actualCashCollected)}</h3>
            <p className="text-[10px] text-slate-400 mt-1">Duit yang benar-benar ada di laci</p>
          </Card>

          <Card className="lg:col-span-2 p-0 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">Top 5 Produk Terlaris</h3>
              <Badge color="blue">{stats.totalTransactions} Transaksi</Badge>
            </div>
            <div className="p-4 space-y-3">
              {stats.topProducts.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 font-bold">{i + 1}.</span>
                    <span className="font-bold text-slate-700">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-slate-400">{formatRp(p.revenue)}</span>
                    <Badge color="blue">{p.qty} terjual</Badge>
                  </div>
                </div>
              ))}
              {stats.topProducts.length === 0 && <p className="text-center py-10 text-slate-400 text-sm italic">Belum ada data penjualan pada periode ini.</p>}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2">Aksi Laporan</h3>
            <Button onClick={handlePrintPDF} disabled={isProcessing} variant="outline" className="w-full justify-start text-slate-600" icon={isProcessing ? "fa-solid fa-circle-notch fa-spin" : "fa-solid fa-file-pdf"}>
              {isProcessing ? "Memproses..." : "Cetak PDF"}
            </Button>
            <Button onClick={handleExportExcel} variant="outline" className="w-full justify-start text-slate-600" icon="fa-solid fa-file-excel">
              Ekspor Excel (.xlsx)
            </Button>
          </Card>

          <Card className="p-6 bg-slate-50 border-slate-200">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Ringkasan Keuangan</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Estimasi Untung</span>
                <span className="font-bold text-emerald-600">{formatRp(stats.totalProfit)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Hutang Baru</span>
                <span className="font-bold text-red-600">{formatRp(stats.totalDebtGenerated)}</span>
              </div>
              <div className="flex justify-between text-sm border-t pt-2 mt-2">
                <span className="text-slate-500 font-bold">Total Transaksi</span>
                <span className="font-bold text-slate-700">{stats.totalTransactions}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Reports;
