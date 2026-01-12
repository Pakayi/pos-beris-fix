import React, { useState, useEffect } from "react";
import { db } from "../services/db";
import { AppSettings, UserProfile } from "../types";
import { Button, Input, Card, Toast, Badge } from "../components/UI";
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

  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);

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

  const handleGenerateNewWarungId = async () => {
    if (!profile || profile.role !== "owner") return;
    if (confirm("Ingin mengubah ID Warung menjadi format profesional?")) {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let newId = "W-";
      for (let i = 0; i < 6; i++) newId += chars.charAt(Math.floor(Math.random() * chars.length));
      const updatedProfile = { ...profile, warungId: newId };
      await db.saveUserProfile(updatedProfile);
      setProfile(updatedProfile);
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

  const handleInjectDemo = async () => {
    if (confirm("Gunakan Data Demo? Semua data transaksi/stok Anda saat ini akan dihapus.")) {
      setIsMaintenanceMode(true);
      try {
        await db.injectDemoData();
        alert("Data demo berhasil dimuat!");
        window.location.hash = "#/";
      } catch (err: any) {
        console.error(err);
        alert("Gagal memuat data: " + (err.message || "Cek koneksi atau izin Firebase."));
      } finally {
        setIsMaintenanceMode(false);
      }
    }
  };

  const handleResetApp = async () => {
    const confirmation = prompt("Ketik 'KONFIRMASI' untuk reset data.");
    if (confirmation === "KONFIRMASI") {
      setIsMaintenanceMode(true);
      try {
        await db.wipeAllData();
        alert("Reset berhasil.");
        window.location.hash = "#/";
      } catch (err: any) {
        alert("Gagal reset: " + err.message);
      } finally {
        setIsMaintenanceMode(false);
      }
    }
  };

  const isOldIdFormat = profile?.warungId && profile.warungId.length > 15 && !profile.warungId.startsWith("W-");

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pengaturan</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge color={profile?.role === "owner" ? "blue" : "green"}>Role: {profile?.role?.toUpperCase()}</Badge>
          </div>
        </div>
        <Button onClick={handleSave} icon="fa-save" className={isSaved ? "bg-green-600" : ""}>
          {isSaved ? "Tersimpan!" : "Simpan Perubahan"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card className="p-6 bg-slate-900 text-white border-none shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm uppercase tracking-widest text-blue-400">Warung ID</h3>
              <i className="fa-solid fa-users text-slate-600"></i>
            </div>
            <div className="flex gap-2 mb-3">
              <div className={`flex-1 bg-slate-700/50 border ${isOldIdFormat ? "border-red-500/50" : "border-slate-600"} rounded-lg px-3 py-2 font-mono text-sm flex items-center overflow-hidden`}>
                <span className="truncate">{profile?.warungId || "Loading..."}</span>
              </div>
              <Button onClick={copyWarungId} variant="secondary" size="sm" className="bg-slate-600 border-none shrink-0">
                <i className={`fa-solid ${copiedId ? "fa-check" : "fa-copy"}`}></i>
              </Button>
            </div>
            {isOldIdFormat && profile?.role === "owner" && (
              <button onClick={handleGenerateNewWarungId} className="w-full py-2 bg-blue-600 text-white text-[10px] font-bold rounded-lg shadow-lg">
                UBAH KE ID PROFESIONAL
              </button>
            )}
          </Card>

          <Card className="p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800 border-b border-gray-100 pb-2 mb-4">Profil Warung</h2>
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <div className="w-16 h-16 bg-white rounded-xl border flex items-center justify-center overflow-hidden">
                {settings.logoUrl ? <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain" /> : <i className="fa-solid fa-camera text-gray-300"></i>}
              </div>
              <label className="px-4 py-2 bg-white border rounded-lg text-xs font-bold cursor-pointer shadow-sm">
                Unggah Logo <input type="file" className="hidden" onChange={handleLogoUpload} />
              </label>
            </div>
            <Input label="Nama Toko" value={settings.storeName} onChange={(e) => setSettings({ ...settings, storeName: e.target.value })} />
            <Input label="Alamat" value={settings.storeAddress} onChange={(e) => setSettings({ ...settings, storeAddress: e.target.value })} />
            <Input label="Telepon (WA)" value={settings.storePhone} onChange={(e) => setSettings({ ...settings, storePhone: e.target.value })} />
          </Card>

          <Card className="p-6 border-red-200 bg-red-50/30">
            <h2 className="text-lg font-bold text-red-800 border-b border-red-100 pb-2 mb-4">Manajemen Data</h2>
            <p className="text-xs text-slate-500 mb-4 italic">Gunakan fitur ini untuk demo atau membersihkan database toko Anda.</p>
            <div className="space-y-3">
              <Button onClick={handleInjectDemo} variant="outline" className="w-full bg-white text-blue-600 border-blue-200" icon="fa-solid fa-flask">
                Isi Data Demo (Simulasi)
              </Button>
              <Button onClick={handleResetApp} variant="danger" className="w-full" icon="fa-solid fa-triangle-exclamation">
                Reset Semua Data (Pabrik)
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800 border-b border-gray-100 pb-2 mb-4">Pembayaran & Printer</h2>
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-blue-900 text-xs uppercase tracking-wider">Metode QRIS</h3>
                <i className="fa-solid fa-qrcode text-blue-400"></i>
              </div>
              <Input placeholder="Contoh: 08123456789 atau ID Merchant" value={settings.storePhone} label="Nomor E-Wallet/ID Merchant" onChange={(e) => setSettings({ ...settings, storePhone: e.target.value })} />
              <p className="text-[10px] text-blue-700 italic">Data ini akan digunakan untuk simulasi QRIS dinamis di kasir.</p>
            </div>

            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-indigo-900 text-sm">Printer Bluetooth</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${printerStatus === "connected" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>{printerStatus === "connected" ? "Aktif" : "Terputus"}</span>
              </div>
              {printerStatus === "connected" ? (
                <button onClick={handleDisconnectPrinter} className="w-full py-2 bg-white text-red-500 rounded-lg text-xs border font-bold">
                  Putus Koneksi
                </button>
              ) : (
                <Button onClick={handleConnectPrinter} disabled={isConnectingPrinter} size="sm" className="w-full">
                  Hubungkan Printer
                </Button>
              )}
            </div>
            <Input label="Pesan Footer Struk" value={settings.footerMessage} onChange={(e) => setSettings({ ...settings, footerMessage: e.target.value })} />
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-bold text-gray-800 border-b border-gray-100 pb-2 mb-4">Diskon Member (%)</h2>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Gold" type="number" value={settings.tierDiscounts.gold} onChange={(e) => setSettings({ ...settings, tierDiscounts: { ...settings.tierDiscounts, gold: Number(e.target.value) } })} />
              <Input label="Silver" type="number" value={settings.tierDiscounts.silver} onChange={(e) => setSettings({ ...settings, tierDiscounts: { ...settings.tierDiscounts, silver: Number(e.target.value) } })} />
              <Input label="Bronze" type="number" value={settings.tierDiscounts.bronze} onChange={(e) => setSettings({ ...settings, tierDiscounts: { ...settings.tierDiscounts, bronze: Number(e.target.value) } })} />
            </div>
          </Card>
        </div>
      </div>

      {isMaintenanceMode && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 text-center">
          <Card className="p-8 max-w-sm w-full space-y-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <h3 className="font-bold">Memproses Data...</h3>
            <p className="text-xs text-slate-500 italic">Mohon tunggu sebentar, kami sedang mengatur ulang database Anda.</p>
          </Card>
        </div>
      )}

      <Toast isOpen={showAutoSaveToast} onClose={() => setShowAutoSaveToast(false)} type="success" message="Logo berhasil diupdate!" />
    </div>
  );
};

export default Settings;
