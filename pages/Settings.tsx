import React, { useState, useEffect, useRef } from "react";
import { db } from "../services/db";
import { AppSettings, UserProfile } from "../types";
import { Button, Input, Card, Modal, Toast, Badge } from "../components/UI";
import { printerService } from "../services/printer";

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>({
    storeName: "",
    storeAddress: "",
    storePhone: "",
    enableTax: false,
    taxRate: 0,
    footerMessage: "",
    showLogo: true,
    logoUrl: null,
    securityPin: null,
    printerName: null,
    tierDiscounts: { bronze: 0, silver: 0, gold: 0 },
  });
  const [profile, setProfile] = useState<UserProfile | null>(db.getUserProfile());
  const [isSaved, setIsSaved] = useState(false);
  const [showAutoSaveToast, setShowAutoSaveToast] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const [isConnectingPrinter, setIsConnectingPrinter] = useState(false);
  const [printerStatus, setPrinterStatus] = useState<"disconnected" | "connected">("disconnected");

  useEffect(() => {
    setSettings(db.getSettings());
    setProfile(db.getUserProfile());
    if (printerService.isConnected()) {
      setPrinterStatus("connected");
    }
  }, []);

  const handleSave = () => {
    db.saveSettings(settings);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const copyWarungId = () => {
    if (profile?.warungId) {
      navigator.clipboard.writeText(profile.warungId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleConnectPrinter = async () => {
    setIsConnectingPrinter(true);
    try {
      const deviceName = await printerService.connect();
      const updated = { ...settings, printerName: deviceName };
      setSettings(updated);
      db.saveSettings(updated);
      setPrinterStatus("connected");
    } catch (error: any) {
      alert(`Gagal: ${error.message}`);
    } finally {
      setIsConnectingPrinter(false);
    }
  };

  const handleDisconnectPrinter = async () => {
    await printerService.disconnect();
    const updated = { ...settings, printerName: null };
    setSettings(updated);
    db.saveSettings(updated);
    setPrinterStatus("disconnected");
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500 * 1024) {
        alert("Maksimal 500KB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Logo = reader.result as string;
        const newSettings = { ...settings, logoUrl: base64Logo };
        setSettings(newSettings);
        db.saveSettings(newSettings);
        setShowAutoSaveToast(true);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pengaturan</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge color={profile?.role === "owner" ? "blue" : "green"}>Role: {profile?.role?.toUpperCase()}</Badge>
            <p className="text-slate-500 text-xs">Kelola identitas dan operasional toko</p>
          </div>
        </div>
        <Button onClick={handleSave} icon="fa-save" className={isSaved ? "bg-green-600" : ""}>
          {isSaved ? "Tersimpan!" : "Simpan Perubahan"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* Multi-User / Warung ID Card */}
          <Card className="p-6 bg-gradient-to-br from-slate-800 to-slate-900 text-white border-none shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm uppercase tracking-widest text-blue-400">Warung ID</h3>
              <i className="fa-solid fa-users text-slate-600"></i>
            </div>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">Gunakan ID ini untuk mendaftarkan akun Kasir (Staff) agar data produk dan transaksi tersinkronisasi.</p>
            <div className="flex gap-2">
              <div className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 font-mono text-sm flex items-center overflow-hidden">
                <span className="truncate">{profile?.warungId || "Loading..."}</span>
              </div>
              <Button onClick={copyWarungId} variant="secondary" size="sm" className="bg-slate-600 hover:bg-slate-500 text-white border-none shrink-0">
                <i className={`fa-solid ${copiedId ? "fa-check" : "fa-copy"}`}></i>
              </Button>
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800 border-b border-gray-100 pb-2 mb-4">
              <i className="fa-solid fa-store mr-2 text-blue-500"></i> Profil Warung
            </h2>

            <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <div className="relative group">
                <div className="w-24 h-24 bg-white rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden shadow-sm">
                  {settings.logoUrl ? <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" /> : <i className="fa-solid fa-camera text-gray-300 text-3xl"></i>}
                </div>
              </div>

              <div className="flex-1 text-center sm:text-left">
                <h3 className="font-bold text-gray-800 text-sm">Logo Warung</h3>
                <input type="file" id="logo-input" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                <label htmlFor="logo-input" className="inline-block mt-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-700 cursor-pointer shadow-sm hover:bg-gray-50">
                  Ganti Logo
                </label>
              </div>
            </div>

            <Input label="Nama Toko" value={settings.storeName} onChange={(e) => setSettings({ ...settings, storeName: e.target.value })} />
            <Input label="Alamat" value={settings.storeAddress} onChange={(e) => setSettings({ ...settings, storeAddress: e.target.value })} />
            <Input label="Telepon" value={settings.storePhone} onChange={(e) => setSettings({ ...settings, storePhone: e.target.value })} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800 border-b border-gray-100 pb-2 mb-4">
              <i className="fa-solid fa-receipt mr-2 text-blue-500"></i> Format Struk
            </h2>
            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-indigo-900 text-sm">Printer Bluetooth</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${printerStatus === "connected" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>{printerStatus === "connected" ? "Aktif" : "Terputus"}</span>
              </div>
              {printerStatus === "connected" ? (
                <button onClick={handleDisconnectPrinter} className="w-full py-2 bg-white text-red-500 rounded-lg text-xs border font-bold hover:bg-red-50 transition-colors">
                  Putus Koneksi
                </button>
              ) : (
                <Button onClick={handleConnectPrinter} disabled={isConnectingPrinter} size="sm" className="w-full">
                  Hubungkan Printer
                </Button>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Pesan Footer Struk</label>
              <textarea
                className="w-full mt-1 p-3 border border-gray-200 rounded-xl text-sm min-h-[100px] focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all"
                placeholder="Pesan yang muncul di bagian bawah struk..."
                value={settings.footerMessage}
                onChange={(e) => setSettings({ ...settings, footerMessage: e.target.value })}
              />
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-bold text-gray-800 border-b border-gray-100 pb-2 mb-4">
              <i className="fa-solid fa-tags mr-2 text-blue-500"></i> Diskon Member (%)
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Gold" type="number" value={settings.tierDiscounts.gold} onChange={(e) => setSettings({ ...settings, tierDiscounts: { ...settings.tierDiscounts, gold: Number(e.target.value) } })} />
              <Input label="Silver" type="number" value={settings.tierDiscounts.silver} onChange={(e) => setSettings({ ...settings, tierDiscounts: { ...settings.tierDiscounts, silver: Number(e.target.value) } })} />
              <Input label="Bronze" type="number" value={settings.tierDiscounts.bronze} onChange={(e) => setSettings({ ...settings, tierDiscounts: { ...settings.tierDiscounts, bronze: Number(e.target.value) } })} />
            </div>
          </Card>
        </div>
      </div>

      <Toast isOpen={showAutoSaveToast} onClose={() => setShowAutoSaveToast(false)} type="success" message="Logo berhasil diupdate!" />
    </div>
  );
};

export default Settings;
