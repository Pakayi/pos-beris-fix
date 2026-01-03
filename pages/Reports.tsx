import React, { useState, useEffect, useMemo } from "react";
import { db } from "../services/db";
import { Transaction, Product, AppSettings } from "../types";
import { Card, Button, Badge } from "../components/UI";
import { jsPDF } from "jspdf";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

type DateRange = "today" | "week" | "month" | "all";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const Reports: React.FC = () => {
  const [range, setRange] = useState<DateRange>("week");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredTx, setFilteredTx] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<AppSettings>(db.getSettings());

  useEffect(() => {
    setTransactions(db.getTransactions());
    setProducts(db.getProducts());
  }, []);

  useEffect(() => {
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

    const filtered = transactions.filter((t) => t.timestamp >= startDate);
    setFilteredTx(filtered);
  }, [range, transactions]);

  const stats = useMemo(() => {
    const totalRevenue = filteredTx.reduce((sum, t) => sum + t.totalAmount, 0);
    const totalTransactions = filteredTx.length;
    const avgTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    let totalCostOfGoodsSold = 0;
    filteredTx.forEach((t) => {
      t.items.forEach((item) => {
        totalCostOfGoodsSold += item.buyPrice * item.quantity;
      });
    });

    const grossProfit = totalRevenue - totalCostOfGoodsSold;

    const productMap = new Map<string, { name: string; qty: number; revenue: number }>();
    const categoryMap = new Map<string, number>();

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

    const productList = db.getProducts();
    const productCatMap = new Map(productList.map((p) => [p.name, p.category]));

    filteredTx.forEach((t) => {
      t.items.forEach((item) => {
        const cat = productCatMap.get(item.productName) || "Lainnya";
        categoryMap.set(cat, (categoryMap.get(cat) || 0) + item.price * item.quantity);
      });
    });

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    const categoryData = Array.from(categoryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return {
      totalRevenue,
      totalCostOfGoodsSold,
      grossProfit,
      totalTransactions,
      avgTransaction,
      topProducts,
      categoryData,
    };
  }, [filteredTx]);

  const chartData = useMemo(() => {
    const dataMap = new Map<string, number>();
    filteredTx.forEach((t) => {
      const date = new Date(t.timestamp).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
      dataMap.set(date, (dataMap.get(date) || 0) + t.totalAmount);
    });
    return Array.from(dataMap.entries())
      .map(([name, sales]) => ({ name, sales }))
      .reverse();
  }, [filteredTx]);

  const handleExportCSV = () => {
    let csv = "ID Transaksi,Waktu,Pelanggan,Metode,Subtotal,Diskon,Total,Profit\n";
    filteredTx.forEach((t) => {
      let profit = t.totalAmount;
      t.items.forEach((i) => (profit -= i.buyPrice * i.quantity));
      csv += `${t.id},"${new Date(t.timestamp).toLocaleString("id-ID")}","${t.customerName || "Umum"}","${t.paymentMethod}",${t.totalAmount + (t.discountAmount || 0)},${t.discountAmount || 0},${t.totalAmount},${profit}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-transaksi-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const handlePrintPDF = () => {
    const doc = new jsPDF();
    const centerX = doc.internal.pageSize.getWidth() / 2;

    doc.setFontSize(18);
    doc.text(settings.storeName, centerX, 20, { align: "center" });
    doc.setFontSize(10);
    doc.text(settings.storeAddress, centerX, 26, { align: "center" });
    doc.text(`Laporan Penjualan: ${range.toUpperCase()}`, centerX, 32, { align: "center" });

    doc.setLineWidth(0.5);
    doc.line(15, 38, 195, 38);

    doc.setFontSize(12);
    doc.text("Ringkasan Keuangan", 15, 50);
    doc.setFontSize(10);
    doc.text(`Total Omzet (Pendapatan): Rp ${stats.totalRevenue.toLocaleString("id-ID")}`, 15, 60);
    doc.text(`Total Biaya Modal (HPP): Rp ${stats.totalCostOfGoodsSold.toLocaleString("id-ID")}`, 15, 68);
    doc.setFontSize(12);
    doc.text(`Laba Kotor: Rp ${stats.grossProfit.toLocaleString("id-ID")}`, 15, 80);

    doc.setFontSize(12);
    doc.text("Produk Terlaris", 15, 100);
    let y = 110;
    stats.topProducts.forEach((p, i) => {
      doc.setFontSize(10);
      doc.text(`${i + 1}. ${p.name} (${p.qty} terjual)`, 15, y);
      doc.text(`Rp ${p.revenue.toLocaleString("id-ID")}`, 180, y, { align: "right" });
      y += 8;
    });

    doc.setFontSize(8);
    doc.text(`Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 15, 280);

    doc.save(`laporan-${settings.storeName}-${range}.pdf`);
  };

  const formatRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Laporan Keuangan</h1>
          <p className="text-slate-500">Analisis laba rugi dan performa toko</p>
        </div>
        <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
          {(["today", "week", "month", "all"] as DateRange[]).map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${range === r ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-50"}`}>
              {r === "today" ? "Hari Ini" : r === "week" ? "7 Hari" : r === "month" ? "Bulan Ini" : "Semua"}
            </button>
          ))}
        </div>
      </div>

      {/* Rincian Laba Rugi */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 border-l-4 border-l-blue-500">
          <div className="flex items-center gap-3 text-blue-600 mb-2">
            <i className="fa-solid fa-money-bill-wave"></i>
            <span className="text-sm font-bold uppercase tracking-wider">Total Omzet</span>
          </div>
          <h3 className="text-2xl font-black text-slate-800">{formatRp(stats.totalRevenue)}</h3>
          <p className="text-xs text-slate-400 mt-2">Total pendapatan kotor dari penjualan.</p>
        </Card>

        <Card className="p-6 border-l-4 border-l-red-400">
          <div className="flex items-center gap-3 text-red-500 mb-2">
            <i className="fa-solid fa-tags"></i>
            <span className="text-sm font-bold uppercase tracking-wider">Harga Pokok (HPP)</span>
          </div>
          <h3 className="text-2xl font-black text-slate-800">{formatRp(stats.totalCostOfGoodsSold)}</h3>
          <p className="text-xs text-slate-400 mt-2">Modal barang yang keluar untuk terjual.</p>
        </Card>

        <Card className="p-6 border-l-4 border-l-emerald-500 bg-emerald-50/30">
          <div className="flex items-center gap-3 text-emerald-600 mb-2">
            <i className="fa-solid fa-piggy-bank"></i>
            <span className="text-sm font-bold uppercase tracking-wider">Laba Kotor</span>
          </div>
          <h3 className="text-2xl font-black text-emerald-700">{formatRp(stats.grossProfit)}</h3>
          <p className="text-xs text-emerald-600 font-bold mt-2">Margin Keuntungan: {stats.totalRevenue > 0 ? ((stats.grossProfit / stats.totalRevenue) * 100).toFixed(1) : 0}%</p>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" icon="fa-file-pdf" onClick={handlePrintPDF}>
          Cetak PDF
        </Button>
        <Button icon="fa-file-excel" onClick={handleExportCSV}>
          Download Excel (CSV)
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
            <i className="fa-solid fa-chart-line text-blue-500"></i>
            Tren Penjualan Harian
          </h3>
          <div className="h-72 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} dy={10} tick={{ fontSize: 12, fill: "#94a3b8" }} />
                  <YAxis hide />
                  <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} formatter={(value: number) => [formatRp(value), "Pendapatan"]} />
                  <Bar dataKey="sales" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 italic">Belum ada data transaksi</div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-bold text-gray-800 mb-4">Top 5 Produk</h3>
          <div className="space-y-4">
            {stats.topProducts.map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${i === 0 ? "bg-yellow-400 text-yellow-900" : "bg-slate-200 text-slate-600"}`}>{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-slate-800 truncate">{p.name}</p>
                  <p className="text-[10px] text-slate-500">{p.qty} Terjual</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm text-blue-600">{formatRp(p.revenue)}</p>
                </div>
              </div>
            ))}
            {stats.topProducts.length === 0 && <p className="text-center py-10 text-gray-400 italic">Belum ada data</p>}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
          <h3 className="font-bold text-slate-800">Riwayat Transaksi Terperinci</h3>
          <Badge color="blue">{filteredTx.length} Transaksi</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-white text-gray-500 font-bold border-b">
              <tr>
                <th className="px-4 py-3">ID / Waktu</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right text-emerald-600">Laba</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTx.map((t) => {
                let tProfit = t.totalAmount;
                t.items.forEach((i) => (tProfit -= i.buyPrice * i.quantity));
                return (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-blue-600 font-bold">{t.id.split("-")[1]}</div>
                      <div className="text-[10px] text-gray-400">{new Date(t.timestamp).toLocaleString("id-ID")}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[10px] text-slate-600 line-clamp-1">{t.items.map((i) => `${i.productName} (${i.quantity})`).join(", ")}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800">{formatRp(t.totalAmount)}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">{formatRp(tProfit)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default Reports;
