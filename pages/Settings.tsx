import React, { useState, useEffect, useRef } from "react";
import { db } from "../services/db";
import { AppSettings } from "../types";
import { Button, Input, Card, Modal, Toast } from "../components/UI";
import { PinPad } from "../components/Security";
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
  const [isSaved, setIsSaved] = useState(false);
  const [showAutoSaveToast, setShowAutoSaveToast] = useState(false);

  // Printer State
  const [isConnectingPrinter, setIsConnectingPrinter] = useState(false);
  const [printerStatus, setPrinterStatus] = useState<"disconnected" | "connected">("disconnected");

  // PIN Modal State
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinMode, setPinMode] = useState<"create" | "confirm_create" | "verify_disable" | "verify_change">("create");
  const [tempPin, setTempPin] = useState("");
  const [pinError, setPinError] = useState("");

  // Backup Import Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSettings(db.getSettings());
    if (printerService.isConnected()) {
      setPrinterStatus("connected");
    }
  }, []);

  const handleSave = () => {
    db.saveSettings(settings);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
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
      alert(`Gagal menghubungkan printer: ${error.message}`);
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
        alert("Ukuran file terlalu besar. Maksimal 500KB.");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Logo = reader.result as string;
        const newSettings = { ...settings, logoUrl: base64Logo };
        setSettings(newSettings);

        // AUTO-SAVE LOGO agar langsung muncul di sidebar
        db.saveSettings(newSettings);
        setShowAutoSaveToast(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    const newSettings = { ...settings, logoUrl: null };
    setSettings(newSettings);
    db.saveSettings(newSettings);
    setShowAutoSaveToast(true);
  };

  const handlePinAction = (inputPin: string) => {
    setPinError("");
    if (pinMode === "create") {
      setTempPin(inputPin);
      setPinMode("confirm_create");
    } else if (pinMode === "confirm_create") {
      if (inputPin === tempPin) {
        const newSettings = { ...settings, securityPin: inputPin };
        setSettings(newSettings);
        db.saveSettings(newSettings);
        setShowPinModal(false);
        setTempPin("");
        sessionStorage.setItem("warung_pin_unlocked", "true");
      } else {
        setPinError("PIN tidak cocok. Silakan ulangi.");
        setPinMode("create");
        setTempPin("");
      }
    } else if (pinMode === "verify_disable") {
      if (inputPin === settings.securityPin) {
        const newSettings = { ...settings, securityPin: null };
        setSettings(newSettings);
        db.saveSettings(newSettings);
        setShowPinModal(false);
      } else {
        setPinError("PIN Salah.");
      }
    }
  };

  const handleResetData = () => {
    if (confirm("Hapus semua data & load simulasi?")) {
      db.resetWithDemoData();
    }
  };

  const handleExportData = () => {
    const jsonString = db.exportDatabase();
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `warung-pos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content && db.importDatabase(content)) {
        alert("Data berhasil dipulihkan!");
        window.location.reload();
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pengaturan</h1>
          <p className="text-slate-500">Konfigurasi toko, struk, dan keamanan</p>
        </div>
        <Button onClick={handleSave} icon="fa-save" className={isSaved ? "bg-green-600" : ""}>
          {isSaved ? "Tersimpan!" : "Simpan Perubahan"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-800 border-b border-gray-100 pb-2 mb-4">
            <i className="fa-solid fa-store mr-2 text-blue-500"></i> Profil Warung
          </h2>

          <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <div className="relative group">
              <div className="w-24 h-24 bg-white rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden shadow-sm group-hover:border-blue-400 transition-colors">
                {settings.logoUrl ? (
                  <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <div className="text-center">
                    <i className="fa-solid fa-camera text-gray-300 text-3xl mb-1"></i>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Logo</p>
                  </div>
                )}
              </div>
              {settings.logoUrl && (
                <button onClick={removeLogo} className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-red-600 transition-transform hover:scale-110">
                  <i className="fa-solid fa-times text-xs"></i>
                </button>
              )}
            </div>

            <div className="flex-1 space-y-2 text-center sm:text-left">
              <h3 className="font-bold text-gray-800">Logo Warung</h3>
              <p className="text-xs text-gray-500">Logo akan tampil di Sidebar, Kasir, dan Struk belanja.</p>
              <input type="file" id="logo-input" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              <label
                htmlFor="logo-input"
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 cursor-pointer shadow-sm transition-all"
              >
                <i className="fa-solid fa-upload"></i>
                {settings.logoUrl ? "Ganti Logo" : "Pilih File Logo"}
              </label>
            </div>
          </div>

          <Input label="Nama Toko" value={settings.storeName} onChange={(e) => setSettings({ ...settings, storeName: e.target.value })} />
          <Input label="Alamat" value={settings.storeAddress} onChange={(e) => setSettings({ ...settings, storeAddress: e.target.value })} />
          <Input label="Telepon" value={settings.storePhone} onChange={(e) => setSettings({ ...settings, storePhone: e.target.value })} />
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-800 border-b border-gray-100 pb-2 mb-4">
            <i className="fa-solid fa-receipt mr-2 text-blue-500"></i> Format Struk
          </h2>
          <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-indigo-900">
                <i className="fa-brands fa-bluetooth mr-2"></i>Printer Bluetooth
              </h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${printerStatus === "connected" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>
                {printerStatus === "connected" ? "Connected" : "Disconnected"}
              </span>
            </div>
            {printerStatus === "connected" ? (
              <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-indigo-100 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
                    <i className="fa-solid fa-print"></i>
                  </div>
                  <span className="text-sm font-bold text-gray-700">{settings.printerName}</span>
                </div>
                <button onClick={handleDisconnectPrinter} className="text-xs text-red-500 font-bold hover:underline">
                  Putuskan
                </button>
              </div>
            ) : (
              <Button onClick={handleConnectPrinter} disabled={isConnectingPrinter} className="w-full bg-indigo-600 hover:bg-indigo-700">
                {isConnectingPrinter ? "Mencari..." : "Hubungkan Printer"}
              </Button>
            )}
          </div>
          <div className="space-y-4 pt-2">
            <label className="block">
              <span className="text-xs font-bold text-gray-500">Pesan Footer</span>
              <textarea
                className="w-full mt-1 p-3 bg-white border border-gray-200 rounded-xl text-sm min-h-[100px] focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all"
                value={settings.footerMessage}
                onChange={(e) => setSettings({ ...settings, footerMessage: e.target.value })}
              />
            </label>
          </div>
        </Card>
      </div>

      {/* PIN & Backup Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <i className="fa-solid fa-shield-halved text-emerald-500"></i> Keamanan PIN
          </h2>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <div>
              <p className="text-sm font-bold text-gray-700">Kunci Kasir & Pengaturan</p>
              <p className="text-xs text-gray-500">Gunakan PIN 6-digit untuk proteksi data.</p>
            </div>
            {settings.securityPin ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setPinMode("verify_disable");
                  setShowPinModal(true);
                }}
              >
                Nonaktifkan
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  setPinMode("create");
                  setShowPinModal(true);
                }}
              >
                Aktifkan PIN
              </Button>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <i className="fa-solid fa-database text-amber-500"></i> Sistem & Data
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={handleExportData} icon="fa-download" className="border-amber-200 text-amber-700 bg-amber-50">
              Backup
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} icon="fa-upload" className="border-blue-200 text-blue-700 bg-blue-50">
              Restore
            </Button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
            <Button variant="danger" onClick={handleResetData} icon="fa-trash-can" className="col-span-2">
              Reset & Load Simulasi
            </Button>
          </div>
        </Card>
      </div>

      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <PinPad title={pinMode === "create" ? "Buat PIN Baru" : pinMode === "confirm_create" ? "Konfirmasi PIN" : "Verifikasi PIN"} error={pinError} onComplete={handlePinAction} onCancel={() => setShowPinModal(false)} />
        </div>
      )}

      <Toast isOpen={showAutoSaveToast} onClose={() => setShowAutoSaveToast(false)} type="success" message="Logo warung berhasil diperbarui secara otomatis!" />
    </div>
  );
};

export default Settings;
