import React, { useEffect, useState } from "react";
import { db } from "../services/db";
import { Transaction, Product } from "../types";
import { Card, Toast, Badge } from "../components/UI";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    todaySales: 0,
    monthSales: 0,
    totalTransactions: 0,
    lowStockCount: 0,
    todayMethods: { cash: 0, qris: 0, debt: 0 },
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [showLowStockToast, setShowLowStockToast] = useState(false);

  useEffect(() => {
    const transactions = db.getTransactions();
    const products = db.getProducts();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const todayTx = transactions.filter((t) => t.timestamp >= startOfDay);
    const monthTx = transactions.filter((t) => t.timestamp >= startOfMonth);

    const lowStock = products.filter((p) => p.stock <= p.minStockAlert).length;
    if (lowStock > 0) setShowLowStockToast(true);

    const todayMethods = {
      cash: todayTx.filter((t) => t.paymentMethod === "cash").reduce((sum, t) => sum + t.totalAmount, 0),
      qris: todayTx.filter((t) => t.paymentMethod === "qris").reduce((sum, t) => sum + t.totalAmount, 0),
      debt: todayTx.filter((t) => t.paymentMethod === "debt").reduce((sum, t) => sum + t.totalAmount, 0),
    };

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + 86400000;
      const daySales = transactions.filter((t) => t.timestamp >= dayStart && t.timestamp < dayEnd).reduce((sum, t) => sum + t.totalAmount, 0);

      last7Days.push({
        name: d.toLocaleDateString("id-ID", { weekday: "short" }),
        sales: daySales,
      });
    }

    setStats({
      todaySales: todayTx.reduce((sum, t) => sum + t.totalAmount, 0),
      monthSales: monthTx.reduce((sum, t) => sum + t.totalAmount, 0),
      totalTransactions: transactions.length,
      lowStockCount: lowStock,
      todayMethods,
    });
    setChartData(last7Days);
  }, []);

  const formatRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard Toko</h1>
          <p className="text-slate-500">Ringkasan aktivitas hari ini</p>
        </div>
        <div className="text-sm text-slate-500 bg-white px-3 py-1 rounded-full shadow-sm border border-gray-100">
          <i className="fa-regular fa-calendar mr-2"></i>
          {new Date().toLocaleDateString("id-ID", { dateStyle: "full" })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Omzet Hari Ini" value={formatRp(stats.todaySales)} icon="fa-coins" color="bg-emerald-500" />
        <StatsCard title="Omzet Bulan Ini" value={formatRp(stats.monthSales)} icon="fa-chart-line" color="bg-blue-500" />
        <StatsCard title="Total Transaksi" value={stats.totalTransactions.toString()} icon="fa-receipt" color="bg-indigo-500" />
        <StatsCard
          title={stats.lowStockCount > 0 ? "Stok Menipis" : "Stok Aman"}
          value={stats.lowStockCount > 0 ? stats.lowStockCount.toString() : "Aman"}
          icon={stats.lowStockCount > 0 ? "fa-triangle-exclamation" : "fa-circle-check"}
          color={stats.lowStockCount > 0 ? "bg-red-500" : "bg-emerald-500"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-lg">Grafik Penjualan 7 Hari</h3>
            <div className="flex gap-2">
              <Badge color="blue">Tunai: {formatRp(stats.todayMethods.cash)}</Badge>
              <Badge color="green">QRIS: {formatRp(stats.todayMethods.qris)}</Badge>
              <Badge color="red">Hutang: {formatRp(stats.todayMethods.debt)}</Badge>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#94a3b8" }} dy={10} />
                <YAxis hide />
                <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ borderRadius: "8px", border: "none" }} />
                <Bar dataKey="sales" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 6 ? "#3b82f6" : "#cbd5e1"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-bold text-lg mb-4">Metode Pembayaran (Hari Ini)</h3>
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex justify-between items-center">
              <span className="text-sm font-bold text-blue-700">Tunai</span>
              <span className="font-black text-blue-900">{formatRp(stats.todayMethods.cash)}</span>
            </div>
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex justify-between items-center">
              <span className="text-sm font-bold text-emerald-700">QRIS</span>
              <span className="font-black text-emerald-900">{formatRp(stats.todayMethods.qris)}</span>
            </div>
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex justify-between items-center">
              <span className="text-sm font-bold text-red-700">Hutang</span>
              <span className="font-black text-red-900">{formatRp(stats.todayMethods.debt)}</span>
            </div>
          </div>
          <button onClick={() => (window.location.hash = "#reports")} className="w-full mt-6 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors">
            LIHAT DETAIL LAPORAN
          </button>
        </Card>
      </div>

      <Toast isOpen={showLowStockToast} onClose={() => setShowLowStockToast(false)} type="warning" message={`Perhatian: Ada ${stats.lowStockCount} produk dengan stok menipis!`} />
    </div>
  );
};

const StatsCard = ({ title, value, icon, color }: { title: string; value: string; icon: string; color: string }) => (
  <Card className={`p-5 flex items-center gap-4 relative overflow-hidden transition-all duration-300`}>
    <div className={`w-12 h-12 rounded-lg ${color} bg-opacity-10 flex items-center justify-center text-xl shrink-0 ${color.replace("bg-", "text-")}`}>
      <i className={`fa-solid ${icon}`}></i>
    </div>
    <div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
    </div>
  </Card>
);

export default Dashboard;
