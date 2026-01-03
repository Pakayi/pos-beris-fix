import React, { useState, useEffect, useMemo } from "react";
import { db } from "../services/db";
import { Transaction, Product } from "../types";
import { Card } from "../components/UI";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

type DateRange = "today" | "week" | "month" | "all";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const Reports: React.FC = () => {
  const [range, setRange] = useState<DateRange>("week");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredTx, setFilteredTx] = useState<Transaction[]>([]);

  useEffect(() => {
    setTransactions(db.getTransactions());
    setProducts(db.getProducts());
  }, []);

  // Filter Data based on Range
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

  // Statistics Calculation
  const stats = useMemo(() => {
    // --- Sales Stats ---
    const totalRevenue = filteredTx.reduce((sum, t) => sum + t.totalAmount, 0);
    const totalTransactions = filteredTx.length;
    const avgTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    // Profit Calculation
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

    // --- Inventory / Assets Stats ---
    let totalAssetValue = 0; // Modal tertanam
    let totalPotentialRevenue = 0; // Estimasi jika laku semua

    products.forEach((p) => {
      // Find base unit (conversion === 1) or fallback to first unit
      const baseUnit = p.units.find((u) => u.conversion === 1) || p.units[0];
      // Normalize price if fallback unit wasn't actually base (rare case in this logic but safe)
      const conversionFactor = baseUnit.conversion;

      // Stock is stored in base units.
      // We need price per base unit.
      const buyPricePerBase = (baseUnit.buyPrice || 0) / conversionFactor;
      const sellPricePerBase = baseUnit.price / conversionFactor;

      totalAssetValue += p.stock * buyPricePerBase;
      totalPotentialRevenue += p.stock * sellPricePerBase;
    });

    const potentialProfit = totalPotentialRevenue - totalAssetValue;

    // --- Chart Data Helpers ---
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
      totalProfit,
      totalTransactions,
      avgTransaction,
      topProducts,
      categoryData,
      totalAssetValue,
      totalPotentialRevenue,
      potentialProfit,
    };
  }, [filteredTx, products]);

  // Chart Data Preparation (Daily)
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

  const formatRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Laporan Penjualan</h1>
          <p className="text-slate-500">Analisis performa & keuangan toko</p>
        </div>
        <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
          {(["today", "week", "month", "all"] as DateRange[]).map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${range === r ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"}`}>
              {r === "today" ? "Hari Ini" : r === "week" ? "7 Hari" : r === "month" ? "Bulan Ini" : "Semua"}
            </button>
          ))}
        </div>
      </div>

      {/* --- Section 1: Sales Performance --- */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-gray-700 flex items-center gap-2">
          <i className="fa-solid fa-cash-register text-blue-500"></i>
          Performa Penjualan
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-6 border-l-4 border-l-blue-500">
            <p className="text-sm text-gray-500 font-medium">Omzet (Pendapatan)</p>
            <h3 className="text-2xl font-bold text-gray-800 mt-1">{formatRp(stats.totalRevenue)}</h3>
          </Card>

          <Card className="p-6 border-l-4 border-l-green-500 bg-green-50/50">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-green-700 font-bold">Keuntungan Bersih</p>
                <h3 className="text-2xl font-bold text-green-800 mt-1">{formatRp(stats.totalProfit)}</h3>
              </div>
              <div className="bg-green-100 p-2 rounded-lg text-green-600">
                <i className="fa-solid fa-money-bill-trend-up"></i>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-l-4 border-l-indigo-500">
            <p className="text-sm text-gray-500 font-medium">Total Transaksi</p>
            <h3 className="text-2xl font-bold text-gray-800 mt-1">{stats.totalTransactions}</h3>
          </Card>
          <Card className="p-6 border-l-4 border-l-purple-500">
            <p className="text-sm text-gray-500 font-medium">Rata-rata Transaksi</p>
            <h3 className="text-2xl font-bold text-gray-800 mt-1">{formatRp(stats.avgTransaction)}</h3>
          </Card>
        </div>
      </div>

      {/* --- Section 2: Inventory Valuation --- */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-gray-700">
            <i className="fa-solid fa-boxes-stacked text-amber-500 mr-2"></i>
            Valuasi Stok Barang
          </h2>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded border border-gray-200">Data Real-time</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5 border border-amber-200 bg-amber-50">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-200 rounded text-amber-700">
                <i className="fa-solid fa-coins"></i>
              </div>
              <span className="font-semibold text-amber-900">Total Aset (Modal)</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-800">{formatRp(stats.totalAssetValue)}</h3>
            <p className="text-xs text-amber-700 mt-1">Uang modal yang tertanam dalam stok gudang saat ini.</p>
          </Card>

          <Card className="p-5 border border-blue-200 bg-blue-50">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-200 rounded text-blue-700">
                <i className="fa-solid fa-tags"></i>
              </div>
              <span className="font-semibold text-blue-900">Potensi Omzet</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-800">{formatRp(stats.totalPotentialRevenue)}</h3>
            <p className="text-xs text-blue-700 mt-1">Estimasi uang masuk jika seluruh stok habis terjual.</p>
          </Card>

          <Card className="p-5 border border-emerald-200 bg-emerald-50">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-200 rounded text-emerald-700">
                <i className="fa-solid fa-piggy-bank"></i>
              </div>
              <span className="font-semibold text-emerald-900">Potensi Laba</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-800">{formatRp(stats.potentialProfit)}</h3>
            <p className="text-xs text-emerald-700 mt-1">Estimasi keuntungan kotor dari stok yang tersedia.</p>
          </Card>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Sales Chart */}
        <Card className="lg:col-span-2 p-6">
          <h3 className="font-bold text-gray-800 mb-6">Grafik Tren Penjualan</h3>
          <div className="h-72 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} dy={10} tick={{ fontSize: 12 }} />
                  <YAxis hide />
                  <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} formatter={(value: number) => [formatRp(value), "Pendapatan"]} />
                  <Bar dataKey="sales" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">Belum ada data untuk periode ini</div>
            )}
          </div>
        </Card>

        {/* Category Pie Chart */}
        <Card className="p-6 flex flex-col">
          <h3 className="font-bold text-gray-800 mb-2">Penjualan per Kategori</h3>
          <div className="flex-1 min-h-[250px] relative">
            {stats.categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {stats.categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatRp(value)} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">Belum ada data</div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="font-bold text-gray-800">Produk Terlaris</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 font-medium">
                <tr>
                  <th className="px-4 py-3 text-left">Nama Produk</th>
                  <th className="px-4 py-3 text-right">Terjual</th>
                  <th className="px-4 py-3 text-right">Omzet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.topProducts.map((p, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs text-white font-bold ${i < 3 ? "bg-amber-400" : "bg-gray-300"}`}>{i + 1}</span>
                        {p.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{p.qty}</td>
                    <td className="px-4 py-3 text-right font-medium text-blue-600">{formatRp(p.revenue)}</td>
                  </tr>
                ))}
                {stats.topProducts.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center py-6 text-gray-400">
                      Belum ada data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Recent Transactions Table */}
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Riwayat Transaksi</h3>
            <span className="text-xs text-gray-500">Terbaru 10</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 font-medium">
                <tr>
                  <th className="px-4 py-3 text-left">Waktu</th>
                  <th className="px-4 py-3 text-left">ID</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredTx.slice(0, 10).map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(t.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      <br />
                      <span className="text-[10px] text-gray-400">{new Date(t.timestamp).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-gray-500">{t.id.split("-")[1]}</div>
                      <div className="text-xs text-gray-400">{t.items.length} item</div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-800">{formatRp(t.totalAmount)}</td>
                  </tr>
                ))}
                {filteredTx.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center py-6 text-gray-400">
                      Belum ada transaksi
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Reports;
