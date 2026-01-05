import React, { useState, useEffect, useMemo, useRef } from "react";
import { db } from "../services/db";
import { Product, ProductUnit, CartItem, Transaction, AppSettings, Customer } from "../types";
// Fixed: Added Badge to the UI components import
import { Button, Input, Modal, Card, Badge } from "../components/UI";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import { printerService } from "../services/printer";
// @ts-ignore
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "https://esm.sh/html5-qrcode@2.3.8";

const POS: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [amountPaid, setAmountPaid] = useState<string>("");

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);

  const [lastTransaction, setLastTransaction] = useState<Transaction | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [paperSize, setPaperSize] = useState<"58mm" | "80mm">("58mm");
  const [settings, setSettings] = useState<AppSettings>(db.getSettings());
  const [isPrinting, setIsPrinting] = useState(false);

  const [showScanner, setShowScanner] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanSelection, setScanSelection] = useState<Product | null>(null);

  const lastScanTimeRef = useRef<number>(0);
  const scannerInstanceRef = useRef<any>(null);

  useEffect(() => {
    setProducts(db.getProducts());
    setSettings(db.getSettings());
    setAllCustomers(db.getCustomers());
  }, []);

  useEffect(() => {
    if (showScanner) {
      setCameraError(null);
      const timer = setTimeout(async () => {
        try {
          const html5QrCode = new Html5Qrcode("reader");
          scannerInstanceRef.current = html5QrCode;
          await html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText: string) => onScanSuccess(decodedText),
            () => {}
          );
        } catch (err: any) {
          setCameraError("Kamera tidak dapat diakses.");
        }
      }, 300);
      return () => {
        if (scannerInstanceRef.current?.isScanning) {
          scannerInstanceRef.current.stop().then(() => scannerInstanceRef.current?.clear());
        }
      };
    }
  }, [showScanner]);

  const onScanSuccess = (decodedText: string) => {
    const now = Date.now();
    if (now - lastScanTimeRef.current < 1500) return;

    const product = products.find((p) => p.sku === decodedText);
    if (product) {
      playBeep();
      lastScanTimeRef.current = now;
      if (product.units.length > 1) {
        scannerInstanceRef.current.pause();
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
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {}
  };

  const addToCart = (product: Product, unit: ProductUnit) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id && item.unitName === unit.name);
      if (existing) {
        return prev.map((item) => (item.productId === product.id && item.unitName === unit.name ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          unitName: unit.name,
          price: unit.price,
          buyPrice: unit.buyPrice || 0,
          conversion: unit.conversion,
          quantity: 1,
        },
      ];
    });
  };

  const calculations = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    let discRate = 0;
    if (selectedCustomer) {
      const discounts = settings.tierDiscounts || { bronze: 0, silver: 2, gold: 5 };
      discRate = (discounts[selectedCustomer.tier.toLowerCase() as keyof typeof discounts] || 0) / 100;
    }
    const discountAmount = subtotal * discRate;
    const total = subtotal - discountAmount;
    return { subtotal, discountAmount, total };
  }, [cart, settings, selectedCustomer]);

  const handleCheckout = () => {
    const paid = parseInt(amountPaid) || 0;
    if (paid < calculations.total) {
      alert("Pembayaran kurang!");
      return;
    }

    const transaction: Transaction = {
      id: `TX-${Date.now()}`,
      timestamp: Date.now(),
      items: cart,
      totalAmount: calculations.total,
      paymentMethod: "cash",
      cashPaid: paid,
      change: paid - calculations.total,
      customerId: selectedCustomer?.id || undefined,
      customerName: selectedCustomer?.name || undefined,
      discountAmount: calculations.discountAmount,
    };

    db.createTransaction(transaction);
    setLastTransaction(transaction);
    setShowCheckout(false);
    setShowSuccessModal(true);
    setCart([]);
    setAmountPaid("");
    setSelectedCustomer(null);
  };

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.includes(search));

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col lg:flex-row gap-4">
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="flex gap-2">
          <Input placeholder="Cari barang atau scan..." className="flex-1" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus prefix="fa-search" />
          <Button onClick={() => setShowScanner(true)} variant="secondary" icon="fa-barcode">
            Scan
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 pb-10">
            {filteredProducts.map((p) => (
              <div key={p.id} className="bg-white border rounded-lg p-3 hover:shadow-md transition-shadow flex flex-col justify-between h-full">
                <div>
                  <h3 className="font-bold text-gray-800 text-sm line-clamp-2">{p.name}</h3>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Stok: {p.stock} {p.baseUnit}
                  </p>
                </div>
                <div className="mt-3 space-y-1">
                  {p.units.map((u, idx) => (
                    <button key={idx} onClick={() => addToCart(p, u)} className="w-full flex justify-between p-1.5 text-[10px] bg-gray-50 border rounded hover:bg-blue-50">
                      <span>{u.name}</span>
                      <b>Rp {u.price.toLocaleString("id-ID")}</b>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Card className="w-full lg:w-96 flex flex-col shadow-xl h-1/2 lg:h-full">
        <div className="p-4 bg-gray-50 rounded-t-xl border-b flex justify-between items-center">
          <h2 className="font-bold text-gray-800">Keranjang</h2>
          <button onClick={() => setShowCustomerModal(true)} className="text-xs bg-white border px-2 py-1 rounded-lg text-blue-600 font-bold">
            {selectedCustomer ? selectedCustomer.name : "+ Pelanggan"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {cart.map((item, idx) => (
            <div key={idx} className="flex justify-between items-center bg-white border-b pb-2">
              <div className="flex-1 pr-2">
                <p className="text-xs font-bold truncate">{item.productName}</p>
                <p className="text-[10px] text-gray-400">
                  {item.quantity} {item.unitName}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold">Rp {(item.price * item.quantity).toLocaleString("id-ID")}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 bg-gray-100 rounded-b-xl">
          <div className="flex justify-between text-sm mb-1">
            <span>Subtotal</span>
            <span>Rp {calculations.subtotal.toLocaleString("id-ID")}</span>
          </div>
          {calculations.discountAmount > 0 && (
            <div className="flex justify-between text-xs text-green-600 mb-1">
              <span>Diskon Member</span>
              <span>- Rp {calculations.discountAmount.toLocaleString("id-ID")}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg text-blue-700 mt-2 border-t pt-2">
            <span>Total</span>
            <span>Rp {calculations.total.toLocaleString("id-ID")}</span>
          </div>
          <Button className="w-full mt-4 py-3 text-lg" disabled={cart.length === 0} onClick={() => setShowCheckout(true)}>
            Bayar
          </Button>
        </div>
      </Card>

      <Modal isOpen={showCheckout} onClose={() => setShowCheckout(false)} title="Kasir: Bayar">
        <div className="space-y-4">
          <div className="p-4 bg-blue-600 text-white rounded-xl text-center">
            <p className="text-xs opacity-80">Total Tagihan</p>
            <p className="text-3xl font-black">Rp {calculations.total.toLocaleString("id-ID")}</p>
          </div>
          <Input label="Uang Tunai" type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} autoFocus />
          <div className="flex gap-2">
            <button onClick={() => setAmountPaid(calculations.total.toString())} className="flex-1 py-2 bg-slate-100 rounded-lg text-xs font-bold">
              Uang Pas
            </button>
            <button onClick={() => setAmountPaid("50000")} className="flex-1 py-2 bg-slate-100 rounded-lg text-xs font-bold">
              50.000
            </button>
            <button onClick={() => setAmountPaid("100000")} className="flex-1 py-2 bg-slate-100 rounded-lg text-xs font-bold">
              100.000
            </button>
          </div>
          <Button className="w-full py-4 font-bold text-lg" onClick={handleCheckout} disabled={!amountPaid}>
            PROSES BAYAR
          </Button>
        </div>
      </Modal>

      <Modal isOpen={showSuccessModal} onClose={() => setShowSuccessModal(false)} title="Transaksi Sukses!">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto text-3xl">
            <i className="fa-solid fa-check"></i>
          </div>
          <p className="text-sm text-gray-500">Kembalian Anda:</p>
          <p className="text-3xl font-black text-slate-800">Rp {lastTransaction?.change.toLocaleString("id-ID")}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setShowSuccessModal(false)}>
              Selesai
            </Button>
            <Button onClick={() => alert("Cetak Struk...")}>Cetak Struk</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showCustomerModal} onClose={() => setShowCustomerModal(false)} title="Pilih Member">
        <Input placeholder="Cari nama..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
        <div className="mt-4 space-y-2 max-h-[300px] overflow-y-auto">
          {allCustomers
            .filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
            .map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedCustomer(c);
                  setShowCustomerModal(false);
                }}
                className="w-full flex justify-between p-3 border rounded-xl hover:bg-blue-50"
              >
                <span className="font-bold">{c.name}</span>
                <Badge>{c.tier}</Badge>
              </button>
            ))}
        </div>
      </Modal>

      <Modal isOpen={showScanner} onClose={() => setShowScanner(false)} title="Scan Barcode">
        <div id="reader" className="w-full max-w-[300px] min-h-[250px] mx-auto bg-black rounded-lg"></div>
      </Modal>
    </div>
  );
};
export default POS;
