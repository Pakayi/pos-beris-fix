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
      topProducts,
      categoryData,
    };
  }, [filteredTx]);

  const chartData = useMemo(() => {
    const dataMap = new Map<string, number>();
    // Sort transactions by date ASC for chart
    const sorted = [...filteredTx].sort((a, b) => a.timestamp - b.timestamp);
    sorted.forEach((t) => {
      const date = new Date(t.timestamp).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
      dataMap.set(date, (dataMap.get(date) || 0) + t.totalAmount);
    });
    return Array.from(dataMap.entries()).map(([name, sales]) => ({ name, sales }));
  }, [filteredTx]);

  const handleExportCSV = () => {
    let csv = "ID Transaksi,Waktu,Pelanggan,Metode,Total,Modal,Laba Bersih\n";
    filteredTx.forEach((t) => {
      let modal = 0;
      t.items.forEach((i) => (modal += i.buyPrice * i.quantity));
      const profit = t.totalAmount - modal;
      csv += `${t.id},"${new Date(t.timestamp).toLocaleString("id-ID")}","${t.customerName || "Umum"}","${t.paymentMethod}",${t.totalAmount},${modal},${profit}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-transaksi-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const handlePrintPDF = () => {
    const doc = new jsPDF();
    const centerX = doc.internal.pageSize.getWidth() / 2;

    doc.setFontSize(18);
    doc.text(settings.storeName, centerX, 20, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Laporan Penjualan & Laba Rugi: ${range.toUpperCase()}`, centerX, 28, { align: "center" });

    doc.setLineWidth(0.5);
    doc.line(15, 35, 195, 35);

    doc.setFontSize(12);
    doc.text("Ringkasan Finansial", 15, 45);
    doc.setFontSize(10);
    doc.text(`Total Omzet: Rp ${stats.totalRevenue.toLocaleString("id-ID")}`, 15, 52);
    doc.text(`Total HPP (Modal): Rp ${stats.totalCostOfGoodsSold.toLocaleString("id-ID")}`, 15, 59);
    doc.setFontSize(12);
    doc.setTextColor(16, 185, 129); // Green
    doc.text(`LABA KOTOR: Rp ${stats.grossProfit.toLocaleString("id-ID")}`, 15, 68);
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(12);
    doc.text("Top 5 Produk Terlaris", 15, 85);
    let y = 92;
    stats.topProducts.forEach((p, i) => {
      doc.setFontSize(10);
      doc.text(`${i + 1}. ${p.name} (${p.qty} pcs)`, 15, y);
      doc.text(`Rp ${p.revenue.toLocaleString("id-ID")}`, 180, y, { align: "right" });
      y += 7;
    });

    doc.setFontSize(8);
    doc.text(`Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 15, 280);
    doc.save(`Laporan_${settings.storeName}_${range}.pdf`);
  };

  const formatRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Laporan Bisnis</h1>
          <p className="text-slate-500">Monitor kesehatan finansial warung Anda</p>
        </div>
        <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
          {(["today", "week", "month", "all"] as DateRange[]).map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${range === r ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-50"}`}>
              {r === "today" ? "Hari Ini" : r === "week" ? "7 Hari" : r === "month" ? "Bulan" : "Semua"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 border-l-4 border-l-blue-500">
          <div className="flex items-center gap-3 text-blue-600 mb-2">
            <i className="fa-solid fa-money-bill-wave"></i>
            <span className="text-xs font-bold uppercase tracking-widest">Total Omzet</span>
          </div>
          <h3 className="text-2xl font-black text-slate-800">{formatRp(stats.totalRevenue)}</h3>
          <p className="text-[10px] text-slate-400 mt-2">Uang masuk dari kasir</p>
        </Card>

        <Card className="p-6 border-l-4 border-l-red-400">
          <div className="flex items-center gap-3 text-red-500 mb-2">
            <i className="fa-solid fa-truck-loading"></i>
            <span className="text-xs font-bold uppercase tracking-widest">Biaya Modal (HPP)</span>
          </div>
          <h3 className="text-2xl font-black text-slate-800">{formatRp(stats.totalCostOfGoodsSold)}</h3>
          <p className="text-[10px] text-slate-400 mt-2">Harga beli barang yang terjual</p>
        </Card>

        <Card className="p-6 border-l-4 border-l-emerald-500 bg-emerald-50/20">
          <div className="flex items-center gap-3 text-emerald-600 mb-2">
            <i className="fa-solid fa-hand-holding-dollar"></i>
            <span className="text-xs font-bold uppercase tracking-widest">Laba Kotor</span>
          </div>
          <h3 className="text-2xl font-black text-emerald-700">{formatRp(stats.grossProfit)}</h3>
          <p className="text-[10px] text-emerald-600 font-bold mt-2">Margin: {stats.totalRevenue > 0 ? ((stats.grossProfit / stats.totalRevenue) * 100).toFixed(1) : 0}%</p>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" icon="fa-file-pdf" onClick={handlePrintPDF}>
          Cetak PDF
        </Button>
        <Button icon="fa-file-excel" onClick={handleExportCSV}>
          Ekspor Excel
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
            <i className="fa-solid fa-chart-line text-blue-500"></i>
            Grafik Penjualan
          </h3>
          <div className="h-72 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} dy={10} tick={{ fontSize: 12, fill: "#94a3b8" }} />
                  <YAxis hide />
                  <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} formatter={(value: number) => [formatRp(value), "Penjualan"]} />
                  <Bar dataKey="sales" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 italic">Data belum tersedia</div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <i className="fa-solid fa-trophy text-yellow-500"></i>5 Terlaris
          </h3>
          <div className="space-y-4">
            {stats.topProducts.map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-gray-100">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] ${i === 0 ? "bg-yellow-400 text-yellow-900" : "bg-slate-200 text-slate-600"}`}>{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-xs text-slate-800 truncate">{p.name}</p>
                  <p className="text-[10px] text-slate-500">{p.qty} terjual</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-xs text-blue-600">{formatRp(p.revenue)}</p>
                </div>
              </div>
            ))}
            {stats.topProducts.length === 0 && <p className="text-center py-10 text-gray-400 text-xs italic">Belum ada data</p>}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
          <h3 className="font-bold text-slate-800 text-sm">Rincian Transaksi Terbaru</h3>
          <Badge color="blue">{filteredTx.length} Nota</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-white text-gray-400 font-bold border-b">
              <tr>
                <th className="px-4 py-3">Nota / Waktu</th>
                <th className="px-4 py-3">Pelanggan</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right text-emerald-600">Untung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTx.map((t) => {
                let tModal = 0;
                t.items.forEach((i) => (tModal += i.buyPrice * i.quantity));
                const tProfit = t.totalAmount - tModal;
                return (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-mono text-blue-600 font-bold">{t.id.split("-")[1]}</div>
                      <div className="text-[9px] text-gray-400">{new Date(t.timestamp).toLocaleString("id-ID")}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{t.customerName || "Umum"}</td>
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
