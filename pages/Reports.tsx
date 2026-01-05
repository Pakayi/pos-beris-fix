import React, { useState, useEffect, useMemo } from "react";
import { db } from "../services/db";
import { Transaction, Product, AppSettings } from "../types";
import { Card, Button, Badge, Modal } from "../components/UI";
import { jsPDF } from "jspdf";
import { GoogleGenAI } from "@google/genai";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

type DateRange = "today" | "week" | "month" | "all";

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
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    setTransactions(db.getTransactions());
    setProducts(db.getProducts());
    setSettings(db.getSettings());
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

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return { totalRevenue, totalProfit, totalTransactions, topProducts };
  }, [filteredTx]);

  const formatRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

  // --- AI ANALYSIS FEATURE ---
  const handleAskAI = async () => {
    setShowAIModal(true);
    setAiLoading(true);
    setAiResponse("");
    setAiError(null);

    try {
      // 1. Check for AI Studio Key Selection Capability
      const aistudio = (window as any).aistudio;
      if (aistudio) {
        const hasKey = await aistudio.hasSelectedApiKey();
        // Jika di browser tidak ada key, atau process.env.API_KEY kosong, buka selector
        if (!hasKey || !process.env.API_KEY) {
          await aistudio.openSelectKey();
        }
      }

      // 2. Initialize Gemini right before calling
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Anda adalah 'Cak Warung', konsultan bisnis gaul dan ahli untuk warung kelontong di Indonesia.
Berdasarkan data warung saya periode ${range === "today" ? "Hari Ini" : range === "week" ? "Seminggu Terakhir" : "Bulan Ini"}:
- Omzet: ${formatRp(stats.totalRevenue)}
- Untung: ${formatRp(stats.totalProfit)}
- Transaksi: ${stats.totalTransactions}
- Terlaris: ${stats.topProducts.map((p) => p.name).join(", ")}

Berikan 3 saran bisnis singkat, santai, dan sangat praktis dalam bahasa Indonesia gaul pengusaha. Pakai bullet points.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      if (!response.text) throw new Error("Kosong");
      setAiResponse(response.text);
    } catch (e: any) {
      console.error("Gemini Error:", e);
      // Handle race conditions or invalid keys
      if (e.message?.includes("Requested entity was not found") || e.message?.includes("API key")) {
        setAiError("Kunci API bermasalah. Silakan klik 'Pilih Kunci' untuk memperbarui.");
        const aistudio = (window as any).aistudio;
        if (aistudio) await aistudio.openSelectKey();
      } else {
        setAiError("Gagal terhubung. Pastikan internet lancar dan kunci API sudah benar di Vercel, lalu coba lagi.");
      }
    } finally {
      setAiLoading(false);
    }
  };

  const handlePrintPDF = () => {
    setIsProcessing(true);
    try {
      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text(`Laporan ${settings.storeName}`, 14, 20);
      doc.setFontSize(12);
      doc.text(`Omzet: ${formatRp(stats.totalRevenue)}`, 14, 35);
      doc.text(`Untung: ${formatRp(stats.totalProfit)}`, 14, 45);
      doc.save(`Laporan_${range}.pdf`);
    } catch (e) {
      alert("Gagal cetak PDF");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportExcel = () => {
    const headers = ["ID", "Waktu", "Total"];
    const rows = filteredTx.map((t) => [t.id, new Date(t.timestamp).toLocaleString(), t.totalAmount]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.setAttribute("hidden", "");
    a.setAttribute("href", url);
    a.setAttribute("download", `transaksi_${range}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
          <Card className="p-6 bg-gradient-to-br from-indigo-600 to-blue-700 text-white border-none shadow-xl shadow-blue-200 group overflow-hidden relative">
            <div className="relative z-10">
              <span className="text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-2 block">Analisis Cerdas</span>
              <h4 className="text-lg font-bold mb-3">Tanya Cak Warung</h4>
              <p className="text-xs text-blue-100 mb-4 leading-relaxed opacity-90">Dapatkan saran jitu dari AI untuk tingkatkan omzet warungmu hari ini!</p>
              <Button onClick={handleAskAI} variant="secondary" className="w-full bg-white text-blue-700 border-none shadow-sm font-bold hover:bg-blue-50" icon="fa-wand-magic-sparkles">
                Minta Saran Bisnis
              </Button>
            </div>
            <i className="fa-solid fa-robot absolute -bottom-4 -right-4 text-8xl text-white/10 group-hover:scale-110 transition-transform"></i>
          </Card>

          <Card className="p-6 space-y-4">
            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2">Aksi Laporan</h3>
            <Button onClick={handlePrintPDF} disabled={isProcessing} variant="outline" className="w-full justify-start text-slate-600" icon={isProcessing ? "fa-circle-notch fa-spin" : "fa-file-pdf"}>
              {isProcessing ? "Memproses..." : "Cetak PDF"}
            </Button>
            <Button onClick={handleExportExcel} variant="outline" className="w-full justify-start text-slate-600" icon="fa-file-excel">
              Ekspor Excel
            </Button>
          </Card>
        </div>
      </div>

      <Modal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        title="Konsultan Cak Warung"
        footer={
          <Button variant="secondary" onClick={() => setShowAIModal(false)}>
            Mantap, Cak!
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100 shadow-inner min-h-[150px]">
            <div className="flex items-center gap-3 mb-4 text-indigo-700">
              <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-lg">
                <i className={`fa-solid ${aiLoading ? "fa-spinner fa-spin" : "fa-robot"}`}></i>
              </div>
              <div>
                <span className="font-black block leading-none">Cak Warung AI</span>
                <span className="text-[10px] uppercase font-bold text-indigo-400">{aiLoading ? "Sedang Berpikir..." : "Analisis Selesai"}</span>
              </div>
            </div>

            {aiLoading ? (
              <div className="flex flex-col items-center justify-center py-6 space-y-4">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce"></div>
                </div>
                <p className="text-xs text-indigo-600 font-medium italic">Bentar, lagi nerawang data warungmu...</p>
              </div>
            ) : aiError ? (
              <div className="text-center py-4">
                <i className="fa-solid fa-circle-exclamation text-2xl text-amber-500 mb-2"></i>
                <p className="text-sm text-slate-600 px-4">{aiError}</p>
                <Button size="sm" variant="outline" className="mt-4" onClick={handleAskAI}>
                  Coba Lagi
                </Button>
              </div>
            ) : (
              <div className="prose prose-sm text-slate-700 whitespace-pre-wrap leading-relaxed font-medium">{aiResponse}</div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 italic text-center px-4">*Saran dihasilkan otomatis oleh AI Gemini.</p>
        </div>
      </Modal>
    </div>
  );
};

export default Reports;
