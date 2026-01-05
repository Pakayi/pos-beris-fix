
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../services/db';
import { Transaction, Product, AppSettings } from '../types';
import { Card, Button, Badge, Modal } from '../components/UI';
import { jsPDF } from 'jspdf';
import { GoogleGenAI } from "@google/genai";
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';

type DateRange = 'today' | 'week' | 'month' | 'all';

const Reports: React.FC = () => {
  const [range, setRange] = useState<DateRange>('week');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTx, setFilteredTx] = useState<Transaction[]>([]);
  const [settings] = useState<AppSettings>(db.getSettings());
  
  // AI States
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  useEffect(() => {
    setTransactions(db.getTransactions());
  }, []);

  useEffect(() => {
    const now = new Date();
    let startDate = 0;
    if (range === 'today') startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    else if (range === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      startDate = d.getTime();
    } else if (range === 'month') startDate = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    setFilteredTx(transactions.filter(t => t.timestamp >= startDate));
  }, [range, transactions]);

  const stats = useMemo(() => {
    const totalRevenue = filteredTx.reduce((sum, t) => sum + t.totalAmount, 0);
    let totalCOGS = 0;
    filteredTx.forEach(t => t.items.forEach(i => totalCOGS += (i.buyPrice * i.quantity)));
    const grossProfit = totalRevenue - totalCOGS;

    const productMap = new Map<string, { name: string, qty: number, revenue: number }>();
    filteredTx.forEach(t => {
      t.items.forEach(item => {
        const existing = productMap.get(item.productName) || { name: item.productName, qty: 0, revenue: 0 };
        productMap.set(item.productName, {
          name: item.productName,
          qty: existing.qty + item.quantity,
          revenue: existing.revenue + (item.price * item.quantity)
        });
      });
    });

    return { 
      totalRevenue, totalCOGS, grossProfit, 
      topProducts: Array.from(productMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 5)
    };
  }, [filteredTx]);

  const runAiAnalysis = async () => {
    setIsAiLoading(true);
    setShowAiModal(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Anda adalah konsultan bisnis warung digital. Analisis data penjualan berikut:
        - Total Omzet: Rp ${stats.totalRevenue.toLocaleString()}
        - Laba Kotor: Rp ${stats.grossProfit.toLocaleString()}
        - Produk Terlaris: ${stats.topProducts.map(p => `${p.name} (${p.qty} terjual)`).join(', ')}
        
        Berikan 3 saran singkat dan praktis dalam bahasa Indonesia untuk meningkatkan keuntungan warung ini. Gunakan gaya bahasa yang ramah dan menyemangati pemilik warung.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });

      setAiAnalysis(response.text || "Gagal mendapatkan analisis.");
    } catch (err) {
      setAiAnalysis("Maaf, AI sedang sibuk. Pastikan kunci API Gemini tersedia.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const formatRp = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Laporan Bisnis</h1>
          <p className="text-slate-500">Analisis performa warung Anda</p>
        </div>
        <div className="flex gap-2 bg-white rounded-lg p-1 border border-gray-200">
          {(['today', 'week', 'month', 'all'] as DateRange[]).map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${range === r ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>
              {r === 'today' ? 'Hari Ini' : r === 'week' ? '7 Hari' : r === 'month' ? 'Bulan' : 'Semua'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 border-l-4 border-l-blue-500">
             <p className="text-xs font-bold text-blue-500 uppercase mb-1">Total Omzet</p>
             <h3 className="text-2xl font-black text-slate-800">{formatRp(stats.totalRevenue)}</h3>
          </Card>
          <Card className="p-6 border-l-4 border-l-emerald-500 bg-emerald-50/20">
             <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Estimasi Untung</p>
             <h3 className="text-2xl font-black text-emerald-700">{formatRp(stats.grossProfit)}</h3>
          </Card>
          <Card className="p-6 bg-gradient-to-br from-indigo-600 to-blue-700 text-white border-none">
             <p className="text-xs font-bold opacity-80 uppercase mb-2">Punya Pertanyaan Bisnis?</p>
             <Button variant="primary" size="sm" onClick={runAiAnalysis} className="bg-white text-indigo-600 border-none font-bold w-full">
                <i className="fa-solid fa-wand-magic-sparkles mr-2"></i> Tanya AI Konsultan
             </Button>
          </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
           <h3 className="font-bold text-gray-800 mb-4">Top 5 Produk Terlaris</h3>
           <div className="space-y-3">
             {stats.topProducts.map((p, i) => (
                <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                   <span className="font-bold text-slate-700">{i+1}. {p.name}</span>
                   <Badge color="blue">{p.qty} terjual</Badge>
                </div>
             ))}
             {stats.topProducts.length === 0 && <p className="text-center py-10 text-gray-400">Belum ada transaksi</p>}
           </div>
        </Card>
        
        <Card className="p-6">
           <h3 className="font-bold text-gray-800 mb-4">Aksi Laporan</h3>
           <div className="space-y-2">
              <Button className="w-full" variant="outline" icon="fa-file-pdf">Cetak PDF</Button>
              <Button className="w-full" variant="outline" icon="fa-file-excel">Ekspor Excel</Button>
           </div>
        </Card>
      </div>

      <Modal isOpen={showAiModal} onClose={() => setShowAiModal(false)} title="AI Bisnis Konsultan">
         <div className="space-y-4">
            {isAiLoading ? (
               <div className="text-center py-10">
                  <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-slate-600 font-medium">Menganalisis data warung Bapak...</p>
               </div>
            ) : (
               <div className="prose prose-sm text-slate-700 leading-relaxed">
                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 mb-4">
                     <i className="fa-solid fa-quote-left text-indigo-300 text-2xl mb-2"></i>
                     <div className="whitespace-pre-wrap font-medium">{aiAnalysis}</div>
                  </div>
                  <Button className="w-full" onClick={() => setShowAiModal(false)}>Terima Kasih, AI!</Button>
               </div>
            )}
         </div>
      </Modal>
    </div>
  );
};

export default Reports;
