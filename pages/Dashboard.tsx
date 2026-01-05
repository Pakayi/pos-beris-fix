import React, { useEffect, useState } from "react";
import { db } from "../services/db";
import { Transaction, Product } from "../types";
import { Card, Toast } from "../components/UI";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    todaySales: 0,
    monthSales: 0,
    totalTransactions: 0,
    lowStockCount: 0,
  });
  const [chartData, setChartData] = useState<any[]>([]);

  // Toast State
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

    if (lowStock > 0) {
      setShowLowStockToast(true);
    }

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

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Omzet Hari Ini" value={formatRp(stats.todaySales)} icon="fa-coins" color="bg-emerald-500" />
        <StatsCard title="Omzet Bulan Ini" value={formatRp(stats.monthSales)} icon="fa-chart-line" color="bg-blue-500" />
        <StatsCard title="Total Transaksi" value={stats.totalTransactions.toString()} icon="fa-receipt" color="bg-indigo-500" />
        <StatsCard
          title={stats.lowStockCount > 0 ? "Stok Menipis" : "Stok Aman"}
          value={stats.lowStockCount > 0 ? stats.lowStockCount.toString() : "Aman"}
          icon={stats.lowStockCount > 0 ? "fa-triangle-exclamation" : "fa-circle-check"}
          color={stats.lowStockCount > 0 ? "bg-red-500" : "bg-emerald-500"}
          className={stats.lowStockCount > 0 ? "bg-red-50 border border-red-200 shadow-md shadow-red-100 animate-pulse" : "bg-emerald-50 border border-emerald-200"}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <h3 className="font-bold text-lg mb-6">Grafik Penjualan 7 Hari</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#94a3b8" }} dy={10} />
                <YAxis hide />
                <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} formatter={(value: number) => [formatRp(value), "Penjualan"]} />
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
          <h3 className="font-bold text-lg mb-4">Aksi Cepat</h3>
          <div className="grid grid-cols-1 gap-3">
            <button onClick={() => (window.location.hash = "#pos")} className="flex items-center p-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors">
              <div className="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center mr-3">
                <i className="fa-solid fa-cash-register"></i>
              </div>
              <div className="text-left">
                <div className="font-semibold">Buka Kasir</div>
                <div className="text-xs opacity-80">Mulai transaksi baru</div>
              </div>
            </button>
            <button onClick={() => (window.location.hash = "#products")} className="flex items-center p-3 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors">
              <div className="w-10 h-10 rounded-full bg-emerald-200 flex items-center justify-center mr-3">
                <i className="fa-solid fa-box"></i>
              </div>
              <div className="text-left">
                <div className="font-semibold">Kelola Produk</div>
                <div className="text-xs opacity-80">Update stok barang</div>
              </div>
            </button>
          </div>
        </Card>
      </div>

      {/* Toast Notification for Low Stock */}
      <Toast
        isOpen={showLowStockToast}
        onClose={() => setShowLowStockToast(false)}
        type="warning"
        message={`Perhatian: Ada ${stats.lowStockCount} produk dengan stok menipis!`}
        action={{
          label: "Cek Inventaris",
          onClick: () => (window.location.hash = "#products"),
        }}
      />
    </div>
  );
};

const StatsCard = ({ title, value, icon, color, className = "" }: { title: string; value: string; icon: string; color: string; className?: string }) => (
  <Card className={`p-5 flex items-center gap-4 relative overflow-hidden transition-all duration-300 ${className}`}>
    <div className={`w-12 h-12 rounded-lg ${color} bg-opacity-10 flex items-center justify-center text-xl shrink-0 ${color.replace("bg-", "text-")}`}>
      <i className={`fa-solid ${icon}`}></i>
    </div>
    <div className="z-10">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
    </div>
    <div className={`absolute -right-4 -bottom-4 opacity-5 text-8xl ${color.replace("bg-", "text-")}`}>
      <i className={`fa-solid ${icon}`}></i>
    </div>
  </Card>
);

export default Dashboard;
