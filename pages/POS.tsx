
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../services/db';
import { Product, ProductUnit, CartItem, Transaction, AppSettings, Customer } from '../types';
import { Button, Input, Modal, Card, Badge } from '../components/UI';
import { jsPDF } from 'jspdf';
import { printerService } from '../services/printer';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const POS: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'qris' | 'debt'>('cash');
  
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  
  const [lastTransaction, setLastTransaction] = useState<Transaction | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [paperSize, setPaperSize] = useState<'58mm' | '80mm'>('58mm');
  const [settings, setSettings] = useState<AppSettings>(db.getSettings());
  const [isPrinting, setIsPrinting] = useState(false);
  const [printerStatus, setPrinterStatus] = useState<'disconnected' | 'connected'>(
    printerService.isConnected() ? 'connected' : 'disconnected'
  );

  const [showScanner, setShowScanner] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanSelection, setScanSelection] = useState<Product | null>(null);

  const lastScanTimeRef = useRef<number>(0);
  const scannerInstanceRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    refresh();
    const handleProducts = () => setProducts(db.getProducts());
    const handleCustomers = () => setAllCustomers(db.getCustomers());
    const handleSettings = () => setSettings(db.getSettings());

    window.addEventListener('products-updated', handleProducts);
    window.addEventListener('customers-updated', handleCustomers);
    window.addEventListener('settings-updated', handleSettings);

    // Monitor status printer setiap 5 detik
    const checkPrinter = setInterval(() => {
      setPrinterStatus(printerService.isConnected() ? 'connected' : 'disconnected');
    }, 5000);

    return () => {
      window.removeEventListener('products-updated', handleProducts);
      window.removeEventListener('customers-updated', handleCustomers);
      window.removeEventListener('settings-updated', handleSettings);
      clearInterval(checkPrinter);
    };
  }, []);

  const refresh = () => {
    setProducts(db.getProducts());
    setSettings(db.getSettings());
    setAllCustomers(db.getCustomers());
  };

  const handleConnectPrinter = async () => {
    try {
      const deviceName = await printerService.connect();
      const updatedSettings = { ...settings, printerName: deviceName };
      setSettings(updatedSettings);
      await db.saveSettings(updatedSettings);
      setPrinterStatus('connected');
    } catch (error: any) {
      if (error.name !== 'NotFoundError' && error.name !== 'AbortError') {
        alert(`Gagal menyambungkan printer: ${error.message}`);
      }
    }
  };

  useEffect(() => {
    if (showCheckout) {
      setPaymentMethod('cash');
      setAmountPaid('');
    }
  }, [showCheckout]);

  useEffect(() => {
    if (showScanner) {
      setCameraError(null);
      const timer = setTimeout(async () => {
        try {
          const html5QrCode = new Html5Qrcode("reader", {
            formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.CODE_128],
            verbose: false
          });
          scannerInstanceRef.current = html5QrCode;
          await html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, (decodedText) => onScanSuccess(decodedText), () => {});
        } catch (err: any) { setCameraError("Kamera tidak dapat diakses."); }
      }, 300);
      return () => {
        clearTimeout(timer);
        if (scannerInstanceRef.current?.isScanning) scannerInstanceRef.current.stop().then(() => scannerInstanceRef.current?.clear()).catch(console.error);
      };
    }
  }, [showScanner]);

  const onScanSuccess = (decodedText: string) => {
    const now = Date.now();
    if ((now - lastScanTimeRef.current) < 1500) return;
    const currentProducts = db.getProducts(); 
    const product = currentProducts.find(p => p.sku === decodedText);
    if (product) {
      playBeep();
      lastScanTimeRef.current = now;
      if (product.units.length > 1) {
          if (scannerInstanceRef.current?.isScanning) scannerInstanceRef.current.pause(); 
          setScanSelection(product);
      } else {
          addToCart(product, product.units[0]);
      }
    }
  };

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode); gainNode.connect(audioCtx.destination);
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {}
  };

  const addToCart = (product: Product, unit: ProductUnit) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id && item.unitName === unit.name);
      if (existing) {
        return prev.map(item => (item.productId === product.id && item.unitName === unit.name) ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, {
        productId: product.id, productName: product.name, unitName: unit.name,
        price: unit.price, buyPrice: unit.buyPrice || 0, conversion: unit.conversion, quantity: 1
      }];
    });
    setScanSelection(null);
    if (scannerInstanceRef.current?.isPaused()) scannerInstanceRef.current.resume();
  };

  const removeFromCart = (index: number) => setCart(prev => prev.filter((_, i) => i !== index));
  const updateQuantity = (index: number, delta: number) => {
    setCart(prev => prev.map((item, i) => i === index ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item));
  };

  const calculations = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    let discountRate = 0;
    if (selectedCustomer) {
        const discounts = settings.tierDiscounts || { bronze: 0, silver: 2, gold: 5 };
        const tierKey = selectedCustomer.tier.toLowerCase() as keyof typeof discounts;
        discountRate = (discounts[tierKey] || 0) / 100;
    }
    const discountAmount = subtotal * discountRate;
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = settings.enableTax ? taxableAmount * (settings.taxRate / 100) : 0;
    const total = taxableAmount + taxAmount;
    return { subtotal, discountAmount, discountRate, taxAmount, total };
  }, [cart, settings, selectedCustomer]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => cats.add(p.category || 'Umum'));
    return ['Semua', ...Array.from(cats)];
  }, [products]);

  const change = (parseInt(amountPaid) || 0) - calculations.total;

  const handleCheckout = async () => {
    if (paymentMethod === 'debt' && !selectedCustomer) {
        alert("Pilih pelanggan terlebih dahulu untuk transaksi hutang!");
        return;
    }

    const paid = paymentMethod === 'cash' ? (parseInt(amountPaid) || 0) : calculations.total;
    if (paymentMethod === 'cash' && paid < calculations.total) {
      alert("Pembayaran kurang!");
      return;
    }

    const transaction: Transaction = {
      id: `TX-${Date.now()}`, timestamp: Date.now(), items: cart,
      totalAmount: calculations.total, paymentMethod: paymentMethod,
      cashPaid: paymentMethod === 'debt' ? 0 : paid,
      change: paymentMethod === 'cash' ? change : 0,
      customerId: selectedCustomer?.id || undefined,
      customerName: selectedCustomer?.name || undefined,
      discountAmount: calculations.discountAmount || 0
    };

    await db.createTransaction(transaction);
    setLastTransaction(transaction);
    setShowCheckout(false);
    setShowSuccessModal(true);
    setCart([]); setAmountPaid(''); setSelectedCustomer(null);
  };

  const handlePrint = async () => {
    if (!lastTransaction) return;
    try {
      setIsPrinting(true);
      if (printerService.isConnected()) {
        await printerService.printTransaction(lastTransaction, settings, paperSize);
      } else {
        fallbackPrint();
      }
    } finally { setIsPrinting(false); }
  };

  const fallbackPrint = () => {
     if (!lastTransaction) return;
     const printContent = generateReceiptHTML(lastTransaction, settings, paperSize);
     const iframe = document.getElementById('printFrame') as HTMLIFrameElement;
     if (iframe?.contentWindow) {
       const doc = iframe.contentWindow.document;
       doc.open(); doc.write(printContent); doc.close();
       iframe.contentWindow.focus(); iframe.contentWindow.print();
     }
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.includes(search);
    const matchesCategory = selectedCategory === 'Semua' || (p.category || 'Umum') === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredCustomers = allCustomers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone.includes(customerSearch));
  const qrisUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=PRO_WARUNG_POS_${calculations.total}`;

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col lg:flex-row gap-4">
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <i className="fa-solid fa-search absolute left-3 top-3 text-gray-400"></i>
            <Input placeholder="Cari produk atau scan..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button onClick={() => setShowScanner(true)} variant="secondary" icon="fa-solid fa-barcode">Scan</Button>
        </div>
        
        {/* Category Bar */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
                selectedCategory === cat 
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md' 
                  : 'bg-white text-slate-500 border-gray-200 hover:border-blue-300'
              }`}
            >
              {cat.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredProducts.map(product => (
              <div key={product.id} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow h-full flex flex-col justify-between">
                <div>
                  <span className="text-[9px] font-black text-blue-500 uppercase">{product.category || 'Umum'}</span>
                  <h3 className="font-bold text-gray-800 text-sm leading-tight mb-2">{product.name}</h3>
                </div>
                <div className="space-y-1">
                  {product.units.map((unit, idx) => (
                    <button key={idx} onClick={() => addToCart(product, unit)} className="w-full flex justify-between items-center px-2 py-1.5 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors border border-gray-100">
                      <span className="text-[10px] font-bold text-gray-600">{unit.name}</span>
                      <span className="text-xs font-black text-slate-800">{unit.price.toLocaleString('id-ID', { notation: 'compact' })}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {filteredProducts.length === 0 && (
              <div className="col-span-full py-20 text-center text-slate-400 italic text-sm">
                Produk tidak ditemukan
              </div>
            )}
          </div>
        </div>
      </div>

      <Card className="w-full lg:w-96 flex flex-col border-l border-gray-200 shadow-lg h-1/2 lg:h-full">
        <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-xl shrink-0">
          <div className="flex justify-between items-center">
            <h2 className="font-bold text-gray-800">Keranjang</h2>
            <div className="flex gap-1.5">
              {/* Tombol Printer Langsung di POS */}
              {printerService.isSupported() && (
                <button 
                  onClick={handleConnectPrinter}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-black transition-all ${
                    printerStatus === 'connected' 
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                      : 'bg-white text-gray-400 border-gray-200 hover:border-blue-300 hover:text-blue-500 animate-pulse'
                  }`}
                >
                  <i className="fa-solid fa-print"></i>
                  {printerStatus === 'connected' ? (settings.printerName?.split(' ')[0] || 'READY') : 'KONEK PRINTER'}
                </button>
              )}
              
              {/* Tombol Pelanggan yang lebih compact */}
              <button 
                onClick={() => setShowCustomerModal(true)} 
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-black transition-all ${
                  selectedCustomer 
                    ? 'bg-blue-50 text-blue-600 border-blue-200' 
                    : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-500'
                }`}
              >
                <i className="fa-solid fa-user"></i>
                {selectedCustomer ? selectedCustomer.name.split(' ')[0].toUpperCase() : 'PELANGGAN'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.map((item, idx) => (
            <div key={idx} className="flex justify-between items-start">
              <div className="flex-1">
                <div className="font-medium text-sm text-gray-800">{item.productName}</div>
                <div className="text-xs text-gray-500">{item.unitName} @ {item.price.toLocaleString('id-ID')}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center border rounded-lg bg-gray-50">
                  <button onClick={() => updateQuantity(idx, -1)} className="px-2 py-1 text-gray-600">-</button>
                  <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                  <button onClick={() => updateQuantity(idx, 1)} className="px-2 py-1 text-gray-600">+</button>
                </div>
                <button onClick={() => removeFromCart(idx)} className="text-red-400"><i className="fa-solid fa-trash"></i></button>
              </div>
            </div>
          ))}
          {cart.length === 0 && <div className="text-center py-20 text-gray-400 text-sm italic">Keranjang kosong</div>}
        </div>
        <div className="p-4 bg-gray-50 border-t border-gray-200 rounded-b-xl">
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-600 font-bold">Total</span>
            <span className="text-2xl font-bold text-blue-700">Rp {calculations.total.toLocaleString('id-ID')}</span>
          </div>
          <Button className="w-full py-3 text-lg shadow-lg shadow-blue-500/20" disabled={cart.length === 0} onClick={() => setShowCheckout(true)}>Bayar</Button>
        </div>
      </Card>

      {/* Modal Checkout */}
      <Modal isOpen={showCheckout} onClose={() => setShowCheckout(false)} title="Metode Pembayaran">
        <div className="space-y-4">
          <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
             <button onClick={() => setPaymentMethod('cash')} className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${paymentMethod === 'cash' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>TUNAI</button>
             <button onClick={() => setPaymentMethod('qris')} className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${paymentMethod === 'qris' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>QRIS</button>
             <button onClick={() => setPaymentMethod('debt')} className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${paymentMethod === 'debt' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-500'}`}>HUTANG</button>
          </div>
          
          <div className="text-center py-4 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-xs text-blue-600 font-bold uppercase">Total Tagihan</p>
            <p className="text-3xl font-black text-blue-800">Rp {calculations.total.toLocaleString('id-ID')}</p>
          </div>

          {paymentMethod === 'cash' && (
            <div className="space-y-4">
              <Input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} label="Uang Diterima" placeholder="0" className="text-lg" autoFocus />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setAmountPaid(calculations.total.toString())} className="col-span-2 py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-black">UANG PAS</button>
                {[50000, 100000].map(val => (
                  <button key={val} onClick={() => setAmountPaid(val.toString())} className="py-2 bg-gray-100 rounded-lg text-xs font-bold">Rp {val.toLocaleString('id-ID')}</button>
                ))}
              </div>
              {parseInt(amountPaid) >= calculations.total && (
                <div className="pt-2 flex justify-between items-center">
                  <span className="text-gray-600">Kembalian</span>
                  <span className="text-xl font-bold text-green-600">Rp {change.toLocaleString('id-ID')}</span>
                </div>
              )}
            </div>
          )}

          {paymentMethod === 'qris' && (
            <div className="text-center space-y-4">
               <div className="mx-auto w-48 h-48 bg-white p-2 rounded-xl border-2 border-slate-200 flex items-center justify-center relative">
                  <img src={qrisUrl} alt="QRIS" className="w-full h-full object-contain" />
               </div>
               <p className="text-[10px] text-slate-500">Tunjukkan QR ini ke pelanggan.</p>
            </div>
          )}

          {paymentMethod === 'debt' && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl space-y-2">
               <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-red-700 uppercase">Debitur</span>
                  <Badge color="red">Pilih Pelanggan Wajib</Badge>
               </div>
               {selectedCustomer ? (
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800">{selectedCustomer.name}</span>
                    <span className="text-xs text-red-600">Hutang Lama: Rp {selectedCustomer.debtBalance.toLocaleString('id-ID')}</span>
                  </div>
               ) : (
                  <button onClick={() => { setShowCheckout(false); setShowCustomerModal(true); }} className="w-full py-2 bg-white text-red-600 text-xs font-bold border border-red-200 rounded-lg">PILIH PELANGGAN SEKARANG</button>
               )}
            </div>
          )}

          <Button onClick={handleCheckout} className="w-full py-3 mt-2" disabled={(paymentMethod === 'cash' && (parseInt(amountPaid) || 0) < calculations.total) || (paymentMethod === 'debt' && !selectedCustomer)}>
            {paymentMethod === 'debt' ? 'Simpan Sebagai Hutang' : 'Konfirmasi Pembayaran'}
          </Button>
        </div>
      </Modal>

      {/* Modal Pilih Pelanggan */}
      <Modal isOpen={showCustomerModal} onClose={() => setShowCustomerModal(false)} title="Pilih Pelanggan">
         <Input placeholder="Cari nama atau HP..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} prefix={<i className="fa-solid fa-search"></i>} />
         <div className="mt-4 max-h-60 overflow-y-auto divide-y">
            {filteredCustomers.map(c => (
              <button key={c.id} onClick={() => { setSelectedCustomer(c); setShowCustomerModal(false); if (paymentMethod === 'debt') setShowCheckout(true); }} className="w-full flex justify-between items-center py-3 px-2 hover:bg-slate-50">
                <div className="text-left">
                  <div className="font-bold text-sm text-slate-800">{c.name}</div>
                  <div className="text-[10px] text-slate-400">{c.phone} | {c.tier}</div>
                </div>
                {c.debtBalance > 0 && <Badge color="red">Hutang: Rp {c.debtBalance.toLocaleString('id-ID')}</Badge>}
              </button>
            ))}
         </div>
      </Modal>

      <Modal isOpen={showScanner} onClose={() => setShowScanner(false)} title="Scanner Barcode">
        <div id="reader" className="w-full max-w-[300px] mx-auto bg-black rounded-xl overflow-hidden min-h-[250px] border-2 border-blue-500"></div>
      </Modal>

      {/* Modal Sukses Transaksi */}
      <Modal isOpen={showSuccessModal} onClose={() => setShowSuccessModal(false)} title="Transaksi Berhasil!">
         <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto text-4xl animate-bounce">
               <i className="fa-solid fa-check-double"></i>
            </div>
            <div>
               <p className="text-slate-500 text-sm">Pembayaran via <span className="font-bold text-slate-800 uppercase">{lastTransaction?.paymentMethod}</span></p>
               <p className="text-3xl font-black text-slate-900">Rp {lastTransaction?.totalAmount.toLocaleString('id-ID')}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
               <Button onClick={handlePrint} icon="fa-solid fa-print" className="w-full">Cetak Struk</Button>
               <Button onClick={() => setShowSuccessModal(false)} variant="secondary" className="w-full">Tutup</Button>
            </div>
         </div>
      </Modal>
    </div>
  );
};

const generateReceiptHTML = (tx: Transaction, settings: AppSettings, size: '58mm' | '80mm') => {
  const width = size === '58mm' ? '58mm' : '80mm';
  const itemsHtml = tx.items.map(item => `
    <div style="display:flex; justify-content:space-between; margin-bottom:2px;"><span>${item.productName}</span></div>
    <div style="display:flex; justify-content:space-between; margin-bottom:4px; color:#444;"><span>${item.quantity} x ${item.price.toLocaleString('id-ID')}</span><span>${(item.quantity * item.price).toLocaleString('id-ID')}</span></div>
  `).join('');
  return `<html><head><style>@page{margin:0;size:${width} auto;}body{font-family:'Courier New',monospace;width:${width};margin:0;padding:5px;font-size:10px;}.center{text-align:center;}.bold{font-weight:bold;}.line{border-top:1px dashed #000;margin:5px 0;}.row{display:flex;justify-content:space-between;}</style></head><body><div class="center bold">${settings.storeName}</div><div class="line"></div><div class="row"><span>No: ${tx.id}</span></div><div class="line"></div>${itemsHtml}<div class="line"></div><div class="row"><span>Metode</span><span>${tx.paymentMethod.toUpperCase()}</span></div><div class="row bold"><span>TOTAL</span><span>Rp ${tx.totalAmount.toLocaleString('id-ID')}</span></div><div class="line"></div><div class="center">${settings.footerMessage}</div></body></html>`;
};

export default POS;
