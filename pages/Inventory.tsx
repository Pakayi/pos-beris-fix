import React, { useState, useEffect } from "react";
import { db } from "../services/db";
import { StockLog } from "../types";
import { Card, Badge, Input } from "../components/UI";

const Inventory: React.FC = () => {
  const [logs, setLogs] = useState<StockLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    // Coba ambil dari cloud dulu
    const data = await db.fetchRemoteStockLogs();
    setLogs(data);
    setLoading(false);
  };

  const getLogTypeBadge = (type: string) => {
    switch (type) {
      case "SALE":
        return <Badge color="blue">PENJUALAN</Badge>;
      case "RESTOCK":
        return <Badge color="green">RESTOCK</Badge>;
      case "ADJUSTMENT":
        return <Badge color="red">PENYESUAIAN</Badge>;
      case "INITIAL":
        return <Badge color="yellow">AWAL</Badge>;
      default:
        return <Badge color="blue">{type}</Badge>;
    }
  };

  const filtered = logs.filter((log) => log.productName.toLowerCase().includes(searchTerm.toLowerCase()) || log.reason.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Log Inventaris</h1>
          <p className="text-slate-500">Riwayat lengkap pergerakan stok barang</p>
        </div>
        <button onClick={loadLogs} className="p-2 bg-white border rounded-lg text-slate-600 hover:bg-slate-50 flex items-center gap-2 text-sm font-medium shadow-sm">
          <i className={`fa-solid fa-rotate ${loading ? "fa-spin" : ""}`}></i>
          Refresh Data
        </button>
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
          <Input placeholder="Cari berdasarkan nama produk atau alasan..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="max-w-md" prefix="fa-search" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3">Produk</th>
                <th className="px-4 py-3">Tipe</th>
                <th className="px-4 py-3 text-right">Jumlah</th>
                <th className="px-4 py-3 text-right">Stok Akhir</th>
                <th className="px-4 py-3">Keterangan / Operator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-400">
                    Menghubungkan ke cloud...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-400">
                    Belum ada riwayat pergerakan stok.
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-gray-900 font-medium">{new Date(log.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>
                      <div className="text-[10px] text-gray-400">{new Date(log.timestamp).toLocaleDateString("id-ID")}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-700">{log.productName}</div>
                    </td>
                    <td className="px-4 py-3">{getLogTypeBadge(log.logType)}</td>
                    <td className={`px-4 py-3 text-right font-bold ${log.type === "IN" ? "text-emerald-600" : "text-red-600"}`}>
                      {log.type === "IN" ? "+" : "-"}
                      {log.quantity} <span className="text-[10px] font-normal">{log.unitName}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-500">{log.currentStock}</td>
                    <td className="px-4 py-3">
                      <div className="text-gray-700 font-medium line-clamp-1">{log.reason}</div>
                      <div className="text-[10px] text-blue-500 font-bold uppercase">
                        <i className="fa-solid fa-user-circle mr-1"></i> {log.operatorName}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default Inventory;
