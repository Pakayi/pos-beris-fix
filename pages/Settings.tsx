import React, { useState, useEffect, useRef } from "react";
import { db } from "../services/db";
import { AppSettings, UserProfile } from "../types";
import { Button, Input, Card, Modal, Toast, Badge } from "../components/UI";
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
  const [profile, setProfile] = useState<UserProfile | null>(db.getUserProfile());
  const [isSaved, setIsSaved] = useState(false);
  const [showAutoSaveToast, setShowAutoSaveToast] = useState(false);

  const [isConnectingPrinter, setIsConnectingPrinter] = useState(false);
  const [printerStatus, setPrinterStatus] = useState<"disconnected" | "connected">("disconnected");

  const [showPinModal, setShowPinModal] = useState(false);
  const [pinMode, setPinMode] = useState<"create" | "confirm_create" | "verify_disable" | "verify_change">("create");
  const [tempPin, setTempPin] = useState("");
  const [pinError, setPinError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pengaturan</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-slate-500 text-sm">Konfigurasi toko dan keamanan</p>
            <Badge color="blue">Role: {profile?.role?.toUpperCase()}</Badge>
          </div>
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
              <div className="w-24 h-24 bg-white rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden shadow-sm">
                {settings.logoUrl ? <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" /> : <i className="fa-solid fa-camera text-gray-300 text-3xl"></i>}
              </div>
            </div>

            <div className="flex-1 text-center sm:text-left">
              <h3 className="font-bold text-gray-800">Logo Warung</h3>
              <input type="file" id="logo-input" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              <label htmlFor="logo-input" className="inline-block mt-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 cursor-pointer shadow-sm">
                Upload Logo
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
              <h3 className="font-semibold text-indigo-900">Printer Bluetooth</h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${printerStatus === "connected" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>
                {printerStatus === "connected" ? "Connected" : "Disconnected"}
              </span>
            </div>
            {printerStatus === "connected" ? (
              <button onClick={handleDisconnectPrinter} className="w-full py-2 bg-white text-red-500 rounded-lg text-sm border font-bold">
                Disconnect
              </button>
            ) : (
              <Button onClick={handleConnectPrinter} disabled={isConnectingPrinter} className="w-full">
                Hubungkan Printer
              </Button>
            )}
          </div>
          <textarea className="w-full mt-1 p-3 border rounded-xl text-sm min-h-[100px]" placeholder="Pesan footer struk..." value={settings.footerMessage} onChange={(e) => setSettings({ ...settings, footerMessage: e.target.value })} />
        </Card>
      </div>

      <Toast isOpen={showAutoSaveToast} onClose={() => setShowAutoSaveToast(false)} type="success" message="Pengaturan diperbarui!" />
    </div>
  );
};

export default Settings;
