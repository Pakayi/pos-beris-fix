import React, { useState, useEffect, useMemo } from "react";
import { db } from "../services/db";
import { Transaction, Product, AppSettings } from "../types";
import { Card, Button, Badge, Modal } from "../components/UI";
import { jsPDF } from "jspdf";
import { GoogleGenAI } from "@google/genai";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

type DateRange = "today" | "week" | "month" | "all";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const Reports: React.FC = () => {
  const [range, setRange] = useState<DateRange>("week");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredTx, setFilteredTx] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<AppSettings>(db.getSettings());
  const [isProcessing, setIsProcessing] = useState(false);

  // AI State
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("");

  useEffect(() => {
    setTransactions(db.getTransactions());
    setProducts(db.getProducts());
    setSettings(db.getSettings());
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

  const stats = useMemo(() => {
    const totalRevenue = filteredTx.reduce((sum, t) => sum + t.totalAmount, 0);
    const totalTransactions = filteredTx.length;
    const avgTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

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
    };
  }, [filteredTx, products]);

  const formatRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

  // --- AI ANALYSIS FEATURE ---
  const handleAskAI = async () => {
    setShowAIModal(true);
    setAiLoading(true);
    setAiResponse("");

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Anda adalah konsultan bisnis ahli untuk sebuah 'Warung' (toko kelontong kecil) di Indonesia.
Berdasarkan data performa warung berikut untuk periode (${range}):
- Total Omzet: ${formatRp(stats.totalRevenue)}
- Estimasi Keuntungan: ${formatRp(stats.totalProfit)}
- Jumlah Transaksi: ${stats.totalTransactions}
- Produk Terlaris: ${stats.topProducts.map((p) => `${p.name} (${p.qty} terjual)`).join(", ")}
- Kategori Dominan: ${stats.categoryData.map((c) => c.name).join(", ")}

Berikan 3-4 saran bisnis yang konkret, profesional, dan menyemangat dalam bahasa Indonesia. Fokus pada manajemen stok, strategi harga, dan cara meningkatkan kunjungan pelanggan. Gunakan format poin-poin yang mudah dibaca.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      setAiResponse(response.text || "Maaf, AI tidak dapat memberikan saran saat ini.");
    } catch (e) {
      console.error(e);
      setAiResponse("Gagal terhubung ke AI. Pastikan koneksi internet Anda stabil.");
    } finally {
      setAiLoading(false);
    }
  };

  const handlePrintPDF = () => {
    setIsProcessing(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const rangeText = range === "today" ? "Hari Ini" : range === "week" ? "7 Hari Terakhir" : range === "month" ? "Bulan Ini" : "Semua Waktu";

      doc.setFontSize(22);
      doc.setTextColor(15, 23, 42);
      doc.text(settings.storeName, 14, 20);

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Laporan Bisnis - Periode: ${rangeText}`, 14, 28);
      doc.text(`Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 14, 33);

      doc.setLineWidth(0.5);
      doc.setDrawColor(226, 232, 240);
      doc.line(14, 38, pageWidth - 14, 38);

      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text("RINGKASAN PERFORMA", 14, 50);

      const summaryY = 58;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14, summaryY, pageWidth - 28, 40, 3, 3, "F");

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text("Total Omzet:", 20, summaryY + 12);
      doc.text("Total Transaksi:", 20, summaryY + 22);
      doc.text("Keuntungan Bersih:", 20, summaryY + 32);

      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text(formatRp(stats.totalRevenue), 70, summaryY + 12);
      doc.text(stats.totalTransactions.toString(), 70, summaryY + 22);
      doc.setTextColor(16, 185, 129);
      doc.text(formatRp(stats.totalProfit), 70, summaryY + 32);

      let tableY = 125;
      doc.setFillColor(241, 245, 249);
      doc.rect(14, tableY, pageWidth - 28, 8, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("No", 18, tableY + 6);
      doc.text("Nama Produk", 30, tableY + 6);
      doc.text("Terjual", 120, tableY + 6);
      doc.text("Omzet", pageWidth - 20, tableY + 6, { align: "right" });

      doc.setFont("helvetica", "normal");
      tableY += 8;
      stats.topProducts.forEach((p, i) => {
        doc.text((i + 1).toString(), 18, tableY + 7);
        doc.text(p.name, 30, tableY + 7);
        doc.text(p.qty.toString(), 120, tableY + 7);
        doc.text(formatRp(p.revenue), pageWidth - 20, tableY + 7, { align: "right" });
        doc.setDrawColor(241, 245, 249);
        doc.line(14, tableY + 10, pageWidth - 14, tableY + 10);
        tableY += 10;
      });

      doc.save(`Laporan_${settings.storeName.replace(/\s+/g, "_")}_${range}.pdf`);
    } catch (e) {
      console.error(e);
      alert("Gagal mencetak PDF");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportExcel = () => {
    setIsProcessing(true);
    try {
      const headers = ["Waktu", "ID Transaksi", "Pelanggan", "Total Belanja", "Potongan Diskon", "Metode Pembayaran"];
      const rows = filteredTx.map((t) => [new Date(t.timestamp).toLocaleString("id-ID"), t.id, t.customerName || "Umum", t.totalAmount.toString(), (t.discountAmount || 0).toString(), t.paymentMethod.toUpperCase()]);

      let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map((e) => e.join(",")).join("\n");

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Data_Transaksi_${range}_${new Date().getTime()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error(e);
      alert("Gagal ekspor data");
    } finally {
      setIsProcessing(false);
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
          </Card>

          <Card className="p-6 border-l-4 border-l-emerald-500 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Estimasi Untung</span>
            <h3 className="text-3xl font-black text-slate-800 mt-2">{formatRp(stats.totalProfit)}</h3>
          </Card>

          <Card className="lg:col-span-2 p-0 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-bold text-slate-800 text-sm">Top 5 Produk Terlaris</h3>
            </div>
            <div className="p-4 space-y-3">
              {stats.topProducts.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 font-bold">{i + 1}.</span>
                    <span className="font-bold text-slate-700">{p.name}</span>
                  </div>
                  <Badge color="blue">{p.qty} terjual</Badge>
                </div>
              ))}
              {stats.topProducts.length === 0 && <p className="text-center py-4 text-slate-400 text-sm italic">Belum ada data penjualan</p>}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 bg-gradient-to-br from-indigo-600 to-blue-700 text-white border-none shadow-xl shadow-blue-200">
            <span className="text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-2 block">Punya Pertanyaan Bisnis?</span>
            <Button onClick={handleAskAI} variant="secondary" className="w-full bg-white text-blue-700 border-none shadow-sm font-bold mt-2 hover:bg-blue-50" icon="fa-wand-magic-sparkles">
              Tanya AI Konsultan
            </Button>
          </Card>

          <Card className="p-6 space-y-4">
            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2">Aksi Laporan</h3>
            <Button onClick={handlePrintPDF} disabled={isProcessing} variant="outline" className="w-full justify-start text-slate-600" icon={isProcessing ? "fa-circle-notch fa-spin" : "fa-file-pdf"}>
              {isProcessing ? "Memproses..." : "Cetak PDF"}
            </Button>
            <Button onClick={handleExportExcel} disabled={isProcessing} variant="outline" className="w-full justify-start text-slate-600" icon={isProcessing ? "fa-circle-notch fa-spin" : "fa-file-excel"}>
              {isProcessing ? "Memproses..." : "Ekspor Excel"}
            </Button>
          </Card>
        </div>
      </div>

      {/* AI Modal */}
      <Modal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        title="AI Konsultan Bisnis"
        footer={
          <Button variant="secondary" onClick={() => setShowAIModal(false)}>
            Tutup
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
            <div className="flex items-center gap-3 mb-3 text-indigo-700">
              <i className="fa-solid fa-robot text-xl animate-bounce"></i>
              <span className="font-bold">Analisis Data Selesai</span>
            </div>
            {aiLoading ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-4">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm text-indigo-600 font-medium animate-pulse">Menghitung strategi terbaik untuk warung Anda...</p>
              </div>
            ) : (
              <div className="prose prose-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{aiResponse}</div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 italic text-center">*AI memberikan saran berdasarkan data yang ada. Selalu gunakan pertimbangan pribadi dalam mengambil keputusan bisnis.</p>
        </div>
      </Modal>
    </div>
  );
};

export default Reports;
