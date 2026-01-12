import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../services/db';
import { Transaction, AppSettings } from '../types';
import { Card, Button, Badge, Modal } from '../components/UI';
// @ts-ignore
import { GoogleGenAI } from "https://esm.sh/@google/genai@1.34.0";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'https://esm.sh/recharts';

const Reports: React.FC = () => {
  const [range, setRange] = useState<'today' | 'week' | 'month' | 'all'>('week');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTx, setFilteredTx] = useState<Transaction[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  useEffect(() => { setTransactions(db.getTransactions()); }, []);

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
    const revenue = filteredTx.reduce((sum, t) => sum + t.totalAmount, 0);
    const pMap = new Map();
    filteredTx.forEach(t => t.items.forEach(i => pMap.set(i.productName, (pMap.get(i.productName) || 0) + i.quantity)));
    return { revenue, top: Array.from(pMap.entries()).sort((a,b) => b[1]-a[1]).slice(0, 5) };
  }, [filteredTx]);

  const runAiAnalysis = async () => {
    setIsAiLoading(true);
    setShowAiModal(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Analisis data warung: Omzet Rp ${stats.revenue.toLocaleString()}, Terlaris: ${stats.top.map(p => p[0]).join(', ')}. Berikan 3 tips singkat untuk pemilik warung.`;
      const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
      setAiAnalysis(response.text);
    } catch (err) { setAiAnalysis("Kunci API Gemini tidak valid atau sedang sibuk."); }
    finally { setIsAiLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Laporan Penjualan</h1>
        <div className="flex bg-white rounded-lg p-1 border">
           {['today', 'week', 'month'].map((r: any) => (
             <button key={r} onClick={() => setRange(r)} className={`px-4 py-1.5 text-xs font-bold rounded-md ${range === r ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>{r}</button>
           ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-6 border-l-4 border-blue-500"><p className="text-xs text-gray-400 font-bold uppercase">Omzet Periode Ini</p><p className="text-2xl font-black">Rp {stats.revenue.toLocaleString('id-ID')}</p></Card>
          <Card className="p-6 bg-blue-700 text-white flex justify-between items-center">
            <div><p className="font-bold">Analisis AI</p><p className="text-xs opacity-70">Dapatkan saran bisnis</p></div>
            <Button onClick={runAiAnalysis} variant="secondary" size="sm">Tanya AI</Button>
          </Card>
      </div>
      <Card className="p-6"><h3 className="font-bold mb-4">Top Produk</h3><div className="space-y-2">{stats.top.map((p, i) => (<div key={i} className="flex justify-between p-3 bg-gray-50 rounded-lg"><span className="font-bold">{p[0]}</span><Badge>{p[1]} terjual</Badge></div>))}</div></Card>
      <Modal isOpen={showAiModal} onClose={() => setShowAiModal(false)} title="AI Bisnis Konsultan">
          {isAiLoading ? <p className="text-center py-10 animate-pulse">Berpikir...</p> : <div className="prose text-sm p-4 bg-indigo-50 rounded-xl border border-indigo-100 font-medium">{aiAnalysis}</div>}
      </Modal>
    </div>
  );
};
export default Reports;