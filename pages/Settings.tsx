import React, { useState, useEffect, useRef } from "react";
import { db } from "../services/db";
import { AppSettings, UserProfile } from "../types";
import { Button, Input, Card, Modal, Badge } from "../components/UI";
import { PinPad } from "../components/Security";
import { printerService } from "../services/printer";

type SettingsTab = "store" | "loyalty" | "staff" | "system";

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("store");
  const [settings, setSettings] = useState<AppSettings>(db.getSettings());
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(false);

  // Printer State
  const [isConnectingPrinter, setIsConnectingPrinter] = useState(false);
  const [printerStatus, setPrinterStatus] = useState<"disconnected" | "connected">("disconnected");

  // PIN Modal State
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinMode, setPinMode] = useState<"create" | "confirm_create" | "verify_disable">("create");
  const [tempPin, setTempPin] = useState("");
  const [pinError, setPinError] = useState("");

  // Backup Import Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSettings(db.getSettings());
    if (printerService.isConnected()) setPrinterStatus("connected");
    if (activeTab === "staff") fetchStaff();
  }, [activeTab]);

  const fetchStaff = async () => {
    setLoadingStaff(true);
    try {
      const data = await db.getStaff();
      setStaff(data);
    } finally {
      setLoadingStaff(false);
    }
  };

  const handleToggleStaffStatus = async (uid: string, currentStatus: boolean) => {
    if (confirm(`Apakah Anda ingin ${currentStatus ? "Menonaktifkan" : "Mengaktifkan"} kasir ini?`)) {
      await db.updateUserStatus(uid, !currentStatus);
      fetchStaff();
    }
  };

  const handleSave = () => {
    db.saveSettings(settings);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  // ... (Printer & Logo & PIN functions same as before)
  const handleConnectPrinter = async () => {
    setIsConnectingPrinter(true);
    try {
      const deviceName = await printerService.connect();
      setSettings((prev) => ({ ...prev, printerName: deviceName }));
      db.saveSettings({ ...settings, printerName: deviceName });
      setPrinterStatus("connected");
      alert(`Berhasil terhubung ke: ${deviceName}`);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsConnectingPrinter(false);
    }
  };

  const handleDisconnectPrinter = async () => {
    await printerService.disconnect();
    setSettings((prev) => ({ ...prev, printerName: null }));
    db.saveSettings({ ...settings, printerName: null });
    setPrinterStatus("disconnected");
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.size <= 300 * 1024) {
      const reader = new FileReader();
      reader.onloadend = () => setSettings({ ...settings, logoUrl: reader.result as string });
      reader.readAsDataURL(file);
    } else if (file) alert("File terlalu besar (Maks 300KB)");
  };

  const handlePinAction = (inputPin: string) => {
    if (pinMode === "create") {
      setTempPin(inputPin);
      setPinMode("confirm_create");
    } else if (pinMode === "confirm_create") {
      if (inputPin === tempPin) {
        db.saveSettings({ ...settings, securityPin: inputPin });
        setSettings({ ...settings, securityPin: inputPin });
        setShowPinModal(false);
        sessionStorage.setItem("warung_pin_unlocked", "true");
      } else {
        setPinError("PIN tidak cocok.");
        setPinMode("create");
      }
    } else if (pinMode === "verify_disable") {
      if (inputPin === settings.securityPin) {
        db.saveSettings({ ...settings, securityPin: null });
        setSettings({ ...settings, securityPin: null });
        setShowPinModal(false);
      } else setPinError("PIN Salah.");
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">Pengaturan</h1>
        {activeTab !== "staff" && (
          <Button onClick={handleSave} icon="fa-save" className={isSaved ? "bg-green-600" : ""}>
            {isSaved ? "Tersimpan!" : "Simpan Perubahan"}
          </Button>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm overflow-x-auto no-scrollbar">
        {[
          { id: "store", label: "Toko", icon: "fa-store" },
          { id: "loyalty", label: "Member", icon: "fa-users" },
          { id: "staff", label: "Staf Kasir", icon: "fa-user-tie" },
          { id: "system", label: "Sistem & Data", icon: "fa-server" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as SettingsTab)}
            className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${activeTab === tab.id ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30" : "text-slate-500 hover:bg-slate-50"}`}
          >
            <i className={`fa-solid ${tab.icon}`}></i> {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Tab: Store */}
        {activeTab === "store" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 space-y-4">
              <h3 className="font-bold text-gray-800 border-b pb-2 mb-4">Profil Warung</h3>
              <div className="flex gap-4 mb-4">
                <div className="w-20 h-20 bg-gray-100 rounded-lg border flex items-center justify-center overflow-hidden shrink-0">
                  {settings.logoUrl ? <img src={settings.logoUrl} className="w-full h-full object-contain" /> : <i className="fa-solid fa-image text-gray-300 text-2xl"></i>}
                </div>
                <div className="flex-1">
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="text-xs mb-2 w-full" />
                  {settings.logoUrl && (
                    <button onClick={() => setSettings({ ...settings, logoUrl: null })} className="text-xs text-red-500">
                      Hapus Logo
                    </button>
                  )}
                </div>
              </div>
              <Input label="Nama Toko" value={settings.storeName} onChange={(e) => setSettings({ ...settings, storeName: e.target.value })} />
              <Input label="Alamat" value={settings.storeAddress} onChange={(e) => setSettings({ ...settings, storeAddress: e.target.value })} />
              <Input label="Telepon" value={settings.storePhone} onChange={(e) => setSettings({ ...settings, storePhone: e.target.value })} />
            </Card>

            <Card className="p-6 space-y-4">
              <h3 className="font-bold text-gray-800 border-b pb-2 mb-4">Format Struk</h3>
              <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-sm font-bold text-indigo-900">Printer Bluetooth</p>
                  <Badge color={printerStatus === "connected" ? "green" : "blue"}>{printerStatus === "connected" ? "Connected" : "Disconnected"}</Badge>
                </div>
                {printerStatus === "connected" ? (
                  <Button size="sm" variant="danger" onClick={handleDisconnectPrinter}>
                    Putus Koneksi
                  </Button>
                ) : (
                  <Button size="sm" onClick={handleConnectPrinter} disabled={isConnectingPrinter}>
                    {isConnectingPrinter ? "Searching..." : "Hubungkan Printer"}
                  </Button>
                )}
              </div>
              {/* Removed invalid 'label' prop from textarea and added a proper label element */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-500">Footer Struk</label>
                <textarea
                  className="w-full p-2 border rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  value={settings.footerMessage}
                  onChange={(e) => setSettings({ ...settings, footerMessage: e.target.value })}
                  placeholder="Pesan di bawah struk..."
                />
              </div>
            </Card>
          </div>
        )}

        {/* Tab: Staff */}
        {activeTab === "staff" && (
          <Card className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Manajemen Staf (Kasir)</h3>
                <p className="text-sm text-gray-500">Daftar pengguna yang terhubung ke Warung Anda.</p>
              </div>
              <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg border border-blue-100 font-mono text-sm">
                ID Warung: <span className="font-bold select-all cursor-pointer">{settings.securityPin ? "********" : db.getProducts().length > 0 ? JSON.parse(localStorage.getItem("warung_user_profile") || "{}").warungId : "N/A"}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3">Nama Staf</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingStaff ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-gray-400">
                        Memuat data staf...
                      </td>
                    </tr>
                  ) : (
                    staff.map((user) => (
                      <tr key={user.uid} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{user.displayName}</td>
                        <td className="px-4 py-3 text-gray-500">{user.email}</td>
                        <td className="px-4 py-3">
                          <Badge color={user.role === "owner" ? "green" : "blue"}>{user.role.toUpperCase()}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`w-2 h-2 rounded-full inline-block mr-2 ${user.active ? "bg-green-500" : "bg-red-500"}`}></span>
                          {user.active ? "Aktif" : "Terblokir"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {user.role !== "owner" && (
                            <Button variant={user.active ? "danger" : "primary"} size="sm" onClick={() => handleToggleStaffStatus(user.uid, user.active)}>
                              {user.active ? "Blokir" : "Aktifkan"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-100 text-amber-800 text-xs">
              <i className="fa-solid fa-circle-info mr-2"></i>
              Berikan <b>Warung ID</b> kepada staf Anda saat mereka mendaftar untuk menghubungkan mereka ke toko ini secara otomatis.
            </div>
          </Card>
        )}

        {/* Tab: System & Data */}
        {activeTab === "system" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 space-y-4">
              <h3 className="font-bold text-gray-800 border-b pb-2 mb-4">Keamanan</h3>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border">
                <span className="text-sm font-medium">PIN Keamanan (6 Digit)</span>
                <Button
                  variant={settings.securityPin ? "danger" : "primary"}
                  size="sm"
                  onClick={() => {
                    setPinMode(settings.securityPin ? "verify_disable" : "create");
                    setShowPinModal(true);
                  }}
                >
                  {settings.securityPin ? "Nonaktifkan PIN" : "Aktifkan PIN"}
                </Button>
              </div>
            </Card>

            <Card className="p-6 space-y-4">
              <h3 className="font-bold text-gray-800 border-b pb-2 mb-4">Pencadangan Data</h3>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const json = db.exportDatabase();
                    const blob = new Blob([json], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `backup-warung-${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                  }}
                >
                  Unduh Backup Lokal
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (confirm("Hapus semua data lokal? Pastikan Anda sudah login agar data cloud tetap aman.")) {
                      db.resetWithDemoData();
                      window.location.reload();
                    }
                  }}
                >
                  Reset Cache Lokal
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>

      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <PinPad onComplete={handlePinAction} onCancel={() => setShowPinModal(false)} title={pinMode === "create" ? "Buat PIN Baru" : pinMode === "confirm_create" ? "Ulangi PIN" : "Verifikasi PIN"} error={pinError} />
        </div>
      )}
    </div>
  );
};

export default Settings;
