import React, { useEffect, useState } from "react";
import { db } from "../services/db";
import { db_fs } from "../services/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Card, Toast, Badge, Button } from "../components/UI";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    todaySales: 0,
    monthSales: 0,
    totalTransactions: 0,
    lowStockCount: 0,
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [showLowStockToast, setShowLowStockToast] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);

  const profile = JSON.parse(localStorage.getItem("warung_user_profile") || "{}");

  useEffect(() => {
    const checkTrial = async () => {
      if (profile.warungId && profile.role === "owner") {
        const warungSnap = await getDoc(doc(db_fs, "warungs", profile.warungId));
        if (warungSnap.exists()) {
          const data = warungSnap.data();
          if (data.plan === "free" && data.trialEndsAt) {
            const diff = data.trialEndsAt - Date.now();
            const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
            setTrialDaysLeft(days);
          }
        }
      }
    };
    checkTrial();

    const transactions = db.getTransactions();
    const products = db.getProducts();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const todayTx = transactions.filter((t) => t.timestamp >= startOfDay);
    const monthTx = transactions.filter((t) => t.timestamp >= startOfMonth);
    const lowStock = products.filter((p) => p.stock <= p.minStockAlert).length;

    if (lowStock > 0) setShowLowStockToast(true);

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
      {trialDaysLeft !== null && trialDaysLeft <= 7 && (
        <div className="bg-amber-100 border-l-4 border-amber-500 p-4 rounded-r-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <i className="fa-solid fa-hourglass-half text-amber-600 text-xl"></i>
            <div>
              <p className="text-sm font-bold text-amber-900">Masa Percobaan Hampir Berakhir!</p>
              <p className="text-xs text-amber-700">
                Tersisa <b>{trialDaysLeft} hari</b> lagi. Hubungi kami untuk aktivasi permanen.
              </p>
            </div>
          </div>
          <Button size="sm" variant="primary" className="bg-amber-600 hover:bg-amber-700 text-xs" onClick={() => window.open("https://wa.me/628123456789", "_blank")}>
            Aktivasi Sekarang
          </Button>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-800">Dashboard Toko</h1>
            <Badge color={profile.plan === "pro" ? "green" : "blue"}>{profile.plan === "pro" ? "PRO PLAN" : trialDaysLeft !== null ? `TRIAL: ${trialDaysLeft} HARI` : "FREE PLAN"}</Badge>
          </div>
          <p className="text-slate-500 text-sm">
            Selamat datang kembali, <b>{profile.displayName}</b>
          </p>
        </div>
        <div className="text-xs font-bold text-slate-500 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100 flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          Sistem Online & Terkoneksi
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Omzet Hari Ini" value={formatRp(stats.todaySales)} icon="fa-coins" color="bg-emerald-500" />
        <StatsCard title="Omzet Bulan Ini" value={formatRp(stats.monthSales)} icon="fa-chart-line" color="bg-blue-500" />
        <StatsCard title="Total Transaksi" value={stats.totalTransactions.toString()} icon="fa-receipt" color="bg-indigo-500" />
        <StatsCard
          title="Status Stok"
          value={stats.lowStockCount > 0 ? `${stats.lowStockCount} Menipis` : "Semua Aman"}
          icon={stats.lowStockCount > 0 ? "fa-box-open" : "fa-check-double"}
          color={stats.lowStockCount > 0 ? "bg-red-500" : "bg-emerald-500"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-gray-800">Tren Penjualan (7 Hari Terakhir)</h3>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Update Realtime</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#94a3b8" }} dy={10} />
                <YAxis hide />
                <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} formatter={(value: number) => [formatRp(value), "Penjualan"]} />
                <Bar dataKey="sales" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 6 ? "#2563eb" : "#e2e8f0"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-6 bg-gradient-to-br from-slate-800 to-slate-900 text-white border-none overflow-hidden relative">
            <div className="relative z-10">
              <h3 className="font-bold mb-2">Punya Masalah?</h3>
              <p className="text-xs text-slate-300 mb-4">Tim support kami siap membantu operasional warung Anda 24/7.</p>
              <Button variant="primary" size="sm" className="bg-white text-slate-900 hover:bg-slate-100 border-none font-bold">
                Bantuan Cepat
              </Button>
            </div>
            <i className="fa-solid fa-headset absolute -right-4 -bottom-4 text-7xl opacity-10"></i>
          </Card>

          <Card className="p-4 border border-blue-100 bg-blue-50/30">
            <h4 className="text-xs font-bold text-blue-600 uppercase mb-3">Menu Cepat</h4>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => (window.location.hash = "#pos")} className="p-3 bg-white border rounded-xl hover:shadow-md transition-all text-center">
                <i className="fa-solid fa-cash-register text-blue-500 mb-1"></i>
                <p className="text-[10px] font-bold text-gray-600">Kasir Baru</p>
              </button>
              <button onClick={() => (window.location.hash = "#products")} className="p-3 bg-white border rounded-xl hover:shadow-md transition-all text-center">
                <i className="fa-solid fa-plus text-emerald-500 mb-1"></i>
                <p className="text-[10px] font-bold text-gray-600">Produk Baru</p>
              </button>
            </div>
          </Card>
        </div>
      </div>

      <Toast
        isOpen={showLowStockToast}
        onClose={() => setShowLowStockToast(false)}
        type="warning"
        message={`Ada ${stats.lowStockCount} produk yang hampir habis!`}
        action={{ label: "Cek Stok", onClick: () => (window.location.hash = "#products") }}
      />
    </div>
  );
};

const StatsCard = ({ title, value, icon, color }: { title: string; value: string; icon: string; color: string }) => (
  <Card className="p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
    <div className={`w-12 h-12 rounded-xl ${color} bg-opacity-10 flex items-center justify-center text-xl shrink-0 ${color.replace("bg-", "text-")}`}>
      <i className={`fa-solid ${icon}`}></i>
    </div>
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</p>
      <p className="text-xl font-black text-slate-800">{value}</p>
    </div>
  </Card>
);

export default Dashboard;
