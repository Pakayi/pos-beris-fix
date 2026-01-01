import React, { useState, useEffect, useRef } from 'react';
import { db } from '../services/db';
import { AppSettings } from '../types';
import { Button, Input, Card, Modal } from '../components/UI';
import { PinPad } from '../components/Security';
import { printerService } from '../services/printer';

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>({
    storeName: '',
    storeAddress: '',
    storePhone: '',
    enableTax: false,
    taxRate: 0,
    footerMessage: '',
    showLogo: true,
    logoUrl: null,
    securityPin: null,
    printerName: null,
    tierDiscounts: { bronze: 0, silver: 0, gold: 0 }
  });
  const [isSaved, setIsSaved] = useState(false);
  
  // Printer State
  const [isConnectingPrinter, setIsConnectingPrinter] = useState(false);
  const [printerStatus, setPrinterStatus] = useState<'disconnected' | 'connected'>('disconnected');

  // PIN Modal State
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinMode, setPinMode] = useState<'create' | 'confirm_create' | 'verify_disable' | 'verify_change'>('create');
  const [tempPin, setTempPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Backup Import Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSettings(db.getSettings());
    // Check initial printer status (conceptual, as WebBluetooth disconnects on reload usually)
    if (printerService.isConnected()) {
      setPrinterStatus('connected');
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
      setSettings(prev => ({ ...prev, printerName: deviceName }));
      // Save the name for UI reference, though reconnection needs user gesture again later
      db.saveSettings({ ...settings, printerName: deviceName });
      setPrinterStatus('connected');
      alert(`Berhasil terhubung ke: ${deviceName}`);
    } catch (error: any) {
      alert(`Gagal menghubungkan printer: ${error.message}`);
    } finally {
      setIsConnectingPrinter(false);
    }
  };

  const handleDisconnectPrinter = async () => {
    await printerService.disconnect();
    setSettings(prev => ({ ...prev, printerName: null }));
    db.saveSettings({ ...settings, printerName: null });
    setPrinterStatus('disconnected');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (max 300KB to save localStorage space)
      if (file.size > 300 * 1024) {
        alert("Ukuran file terlalu besar. Maksimal 300KB.");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setSettings({ ...settings, logoUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    setSettings({ ...settings, logoUrl: null });
  };

  const handlePinAction = (inputPin: string) => {
    setPinError('');
    
    if (pinMode === 'create') {
      setTempPin(inputPin);
      setPinMode('confirm_create');
      // Reset PinPad input visually if possible, or simple transition
    } else if (pinMode === 'confirm_create') {
      if (inputPin === tempPin) {
        const newSettings = { ...settings, securityPin: inputPin };
        setSettings(newSettings);
        db.saveSettings(newSettings);
        setShowPinModal(false);
        setTempPin('');
        // Auto unlock session so they don't get locked out immediately
        sessionStorage.setItem('warung_pin_unlocked', 'true');
        alert("PIN Keamanan berhasil diaktifkan!");
      } else {
        setPinError("PIN tidak cocok. Silakan ulangi.");
        setPinMode('create');
        setTempPin('');
      }
    } else if (pinMode === 'verify_disable') {
      if (inputPin === settings.securityPin) {
        const newSettings = { ...settings, securityPin: null };
        setSettings(newSettings);
        db.saveSettings(newSettings);
        setShowPinModal(false);
        alert("PIN Keamanan dinonaktifkan.");
      } else {
        setPinError("PIN Salah.");
      }
    }
  };

  const startEnablePin = () => {
    setPinMode('create');
    setTempPin('');
    setPinError('');
    setShowPinModal(true);
  };

  const startDisablePin = () => {
    setPinMode('verify_disable');
    setPinError('');
    setShowPinModal(true);
  };

  const handleResetData = () => {
    if (confirm("PERINGATAN: Semua data transaksi, produk, dan pengaturan akan dihapus dan diganti dengan data simulasi. Lanjutkan?")) {
      db.resetWithDemoData();
      window.location.reload();
    }
  };

  // --- Backup Functions ---
  const handleExportData = () => {
    const jsonString = db.exportDatabase();
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `warung-pos-backup-${date}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm("PERINGATAN: Mengembalikan data backup akan MENIMPA semua data yang ada sekarang. Apakah Anda yakin?")) {
      // Reset input so change event triggers again if same file selected
      e.target.value = ''; 
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = db.importDatabase(content);
        if (success) {
          alert("Data berhasil dipulihkan! Aplikasi akan dimuat ulang.");
          window.location.reload();
        } else {
          alert("Gagal memulihkan data. Format file tidak valid.");
        }
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = ''; 
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pengaturan</h1>
          <p className="text-slate-500">Konfigurasi toko, struk, dan keamanan</p>
        </div>
        <Button onClick={handleSave} icon="fa-save" className={isSaved ? "bg-green-600 hover:bg-green-700" : ""}>
          {isSaved ? "Tersimpan!" : "Simpan Perubahan"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Store Info */}
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-800 border-b border-gray-100 pb-2 mb-4">
            <i className="fa-solid fa-store mr-2 text-blue-500"></i> Informasi Toko
          </h2>
          
          {/* Logo Upload Section */}
          <div className="flex items-start gap-4 mb-4">
            <div className="w-20 h-20 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden shrink-0 relative group">
              {settings.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <i className="fa-solid fa-image text-gray-400 text-2xl"></i>
              )}
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Logo Toko</label>
              <div className="flex flex-col gap-2">
                 <input 
                   type="file" 
                   accept="image/*" 
                   onChange={handleLogoUpload}
                   className="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                 />
                 {settings.logoUrl && (
                    <button onClick={removeLogo} className="text-xs text-red-500 text-left hover:underline">
                      Hapus Logo
                    </button>
                 )}
                 <p className="text-[10px] text-gray-400">Maks. 300KB (Disarankan rasio 1:1)</p>
              </div>
            </div>
          </div>

          <Input 
            label="Nama Toko" 
            value={settings.storeName} 
            onChange={(e) => setSettings({...settings, storeName: e.target.value})}
            placeholder="Contoh: Warung Sejahtera"
          />

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Alamat Toko</label>
            <textarea 
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all min-h-[80px]"
              value={settings.storeAddress}
              onChange={(e) => setSettings({...settings, storeAddress: e.target.value})}
              placeholder="Alamat lengkap..."
            />
          </div>

          <Input 
            label="Nomor Telepon" 
            value={settings.storePhone} 
            onChange={(e) => setSettings({...settings, storePhone: e.target.value})}
            placeholder="0812..."
          />
        </Card>

        {/* Loyalty Program Settings */}
        <Card className="p-6 space-y-4">
           <h2 className="text-lg font-bold text-gray-800 border-b border-gray-100 pb-2 mb-4">
            <i className="fa-solid fa-users-gear mr-2 text-amber-500"></i> Loyalty & Diskon Member
          </h2>
          <p className="text-xs text-gray-500">
             Atur persentase potongan harga otomatis untuk setiap tingkatan member. Isi 0 jika tidak ada diskon.
          </p>

          <div className="grid grid-cols-3 gap-4">
             <div>
                <label className="block text-xs font-bold text-amber-700 mb-1">Bronze (%)</label>
                <div className="relative">
                    <input
                       type="number"
                       min="0"
                       max="100"
                       className="w-full pl-2 pr-6 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
                       value={settings.tierDiscounts.bronze}
                       onChange={(e) => setSettings({
                           ...settings, 
                           tierDiscounts: { ...settings.tierDiscounts, bronze: parseFloat(e.target.value) || 0 } 
                       })}
                    />
                    <span className="absolute right-3 top-2 text-xs text-gray-500">%</span>
                </div>
             </div>
             <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Silver (%)</label>
                 <div className="relative">
                    <input
                       type="number"
                       min="0"
                       max="100"
                       className="w-full pl-2 pr-6 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                       value={settings.tierDiscounts.silver}
                       onChange={(e) => setSettings({
                           ...settings, 
                           tierDiscounts: { ...settings.tierDiscounts, silver: parseFloat(e.target.value) || 0 } 
                       })}
                    />
                    <span className="absolute right-3 top-2 text-xs text-gray-500">%</span>
                </div>
             </div>
             <div>
                <label className="block text-xs font-bold text-yellow-600 mb-1">Gold (%)</label>
                 <div className="relative">
                    <input
                       type="number"
                       min="0"
                       max="100"
                       className="w-full pl-2 pr-6 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-200"
                       value={settings.tierDiscounts.gold}
                       onChange={(e) => setSettings({
                           ...settings, 
                           tierDiscounts: { ...settings.tierDiscounts, gold: parseFloat(e.target.value) || 0 } 
                       })}
                    />
                    <span className="absolute right-3 top-2 text-xs text-gray-500">%</span>
                </div>
             </div>
          </div>
        </Card>

        {/* Receipt Settings */}
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-800 border-b border-gray-100 pb-2 mb-4">
            <i className="fa-solid fa-receipt mr-2 text-blue-500"></i> Format Struk
          </h2>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
            <div>
              <span className="block text-sm font-medium text-gray-700">Tampilkan Logo</span>
              <span className="block text-xs text-gray-500">Tampilkan logo di header struk</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={settings.showLogo}
                onChange={(e) => setSettings({...settings, showLogo: e.target.checked})}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

           {/* Printer Connection */}
           <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
             <div className="flex justify-between items-center mb-2">
               <div>
                  <h3 className="font-semibold text-indigo-900"><i className="fa-brands fa-bluetooth mr-2"></i>Printer Bluetooth</h3>
                  <p className="text-xs text-indigo-700">Koneksi langsung tanpa dialog browser</p>
               </div>
               <div className="flex items-center gap-2">
                 {printerStatus === 'connected' ? (
                   <span className="text-xs font-bold text-green-600 flex items-center gap-1">
                     <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                     Terhubung
                   </span>
                 ) : (
                    <span className="text-xs font-medium text-gray-500">Terputus</span>
                 )}
               </div>
             </div>
             
             {printerStatus === 'connected' ? (
                <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-indigo-100">
                   <span className="font-mono text-sm font-bold text-gray-700">{settings.printerName || 'Device'}</span>
                   <Button size="sm" variant="danger" onClick={handleDisconnectPrinter}>Putuskan</Button>
                </div>
             ) : (
                <Button 
                  onClick={handleConnectPrinter} 
                  disabled={isConnectingPrinter}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                  icon={isConnectingPrinter ? "fa-circle-notch fa-spin" : "fa-plug"}
                >
                  {isConnectingPrinter ? "Mencari Printer..." : "Hubungkan Printer Thermal"}
                </Button>
             )}
             {!printerService.isSupported() && (
               <p className="text-[10px] text-red-500 mt-2 text-center">
                 Browser ini tidak mendukung Web Bluetooth. Gunakan Chrome/Edge.
               </p>
             )}
           </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 mt-2">
            <div>
              <span className="block text-sm font-medium text-gray-700">Aktifkan PPN/Pajak</span>
              <span className="block text-xs text-gray-500">Hitung pajak otomatis pada transaksi</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={settings.enableTax}
                onChange={(e) => setSettings({...settings, enableTax: e.target.checked})}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {settings.enableTax && (
            <div className="pl-4 border-l-2 border-blue-100 animate-in fade-in slide-in-from-top-2">
               <Input 
                label="Persentase Pajak (%)" 
                type="number"
                value={settings.taxRate} 
                onChange={(e) => setSettings({...settings, taxRate: parseFloat(e.target.value) || 0})}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Pesan Footer Struk</label>
            <textarea 
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all min-h-[80px]"
              value={settings.footerMessage}
              onChange={(e) => setSettings({...settings, footerMessage: e.target.value})}
              placeholder="Pesan di bagian bawah struk..."
            />
          </div>
        </Card>
        
        {/* Security Settings */}
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-800 border-b border-gray-100 pb-2 mb-4">
            <i className="fa-solid fa-lock mr-2 text-blue-500"></i> Keamanan Lokal
          </h2>
          
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-800">PIN Keamanan</h3>
              <p className="text-sm text-gray-500 mt-1">
                Batasi akses ke halaman Kasir dan Pengaturan menggunakan PIN 6 digit. 
                Berguna jika perangkat kasir digunakan oleh orang lain.
              </p>
            </div>
            
            <div>
              {settings.securityPin ? (
                <div className="flex gap-3 items-center">
                  <span className="text-sm font-medium text-green-600 bg-green-50 px-3 py-1 rounded-full border border-green-100">
                    <i className="fa-solid fa-check-circle mr-2"></i> Aktif
                  </span>
                  <Button variant="danger" size="sm" onClick={startDisablePin}>
                    Nonaktifkan
                  </Button>
                </div>
              ) : (
                <Button onClick={startEnablePin}>
                  Aktifkan PIN
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Data Management (Backup & Restore) */}
        <Card className="p-6 space-y-4 border-amber-200 bg-amber-50/30">
           <h2 className="text-lg font-bold text-amber-700 border-b border-amber-100 pb-2 mb-4">
            <i className="fa-solid fa-database mr-2"></i> Backup & Restore Data
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {/* Export */}
             <div className="p-4 bg-white rounded-xl border border-amber-100 flex flex-col justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800"><i className="fa-solid fa-download text-amber-500 mr-2"></i>Backup Data (Download)</h3>
                  <p className="text-xs text-gray-500 mt-1 mb-4">
                    Unduh seluruh data (Produk, Transaksi, Pelanggan) ke dalam file JSON untuk disimpan.
                  </p>
                </div>
                <Button variant="outline" onClick={handleExportData} className="w-full border-amber-300 text-amber-800 hover:bg-amber-50">
                  Download Backup
                </Button>
             </div>

             {/* Import */}
             <div className="p-4 bg-white rounded-xl border border-amber-100 flex flex-col justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800"><i className="fa-solid fa-upload text-blue-500 mr-2"></i>Restore Data (Upload)</h3>
                  <p className="text-xs text-gray-500 mt-1 mb-4">
                    Pulihkan data dari file backup. <span className="font-bold text-red-500">Peringatan: Data saat ini akan ditimpa.</span>
                  </p>
                </div>
                <input 
                  type="file" 
                  accept=".json" 
                  ref={fileInputRef} 
                  onChange={handleFileChange}
                  className="hidden" 
                />
                <Button variant="outline" onClick={handleImportClick} className="w-full border-blue-300 text-blue-800 hover:bg-blue-50">
                  Upload Backup
                </Button>
             </div>
          </div>
        </Card>

        {/* Danger Zone (Reset) */}
        <Card className="p-6 space-y-4 border-red-200 bg-red-50/30">
           <h2 className="text-lg font-bold text-red-700 border-b border-red-100 pb-2 mb-4">
            <i className="fa-solid fa-triangle-exclamation mr-2"></i> Zona Bahaya
          </h2>
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 p-4 bg-white rounded-xl border border-red-100">
             <div className="flex-1">
                <h3 className="font-semibold text-red-900">Reset & Load Data Simulasi</h3>
                <p className="text-sm text-red-700 mt-1">
                  Menghapus semua produk dan transaksi saat ini, lalu mengisi dengan data simulasi (Produk + Riwayat Transaksi 1 bulan).
                  <br/><span className="font-bold">Gunakan ini untuk uji coba aplikasi.</span>
                </p>
             </div>
             <Button variant="danger" onClick={handleResetData}>
                Reset Data
             </Button>
          </div>
        </Card>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-700">
        <i className="fa-solid fa-circle-info mr-2"></i>
        Pengaturan ini akan diterapkan secara otomatis.
      </div>

      {/* PIN Modal Wrapper */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="animate-in zoom-in-95 duration-200">
             <PinPad 
                key={pinMode} // Force re-mount on mode change to clear input
                length={6}
                title={
                   pinMode === 'create' ? "Buat PIN Baru" : 
                   pinMode === 'confirm_create' ? "Konfirmasi PIN" : 
                   "Masukkan PIN Lama"
                }
                subtitle={
                  pinMode === 'create' ? "Masukkan 6 digit angka" :
                  pinMode === 'confirm_create' ? "Masukkan ulang PIN untuk konfirmasi" :
                  "Verifikasi untuk menonaktifkan keamanan"
                }
                error={pinError}
                onComplete={handlePinAction}
                onCancel={() => setShowPinModal(false)}
             />
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;