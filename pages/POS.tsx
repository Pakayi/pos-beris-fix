import React, { useState, useEffect, useMemo, useRef } from "react";
import { db } from "../services/db";
import { Product, ProductUnit, CartItem, Transaction, AppSettings, Customer } from "../types";
import { Button, Input, Modal, Card } from "../components/UI";
import { jsPDF } from "https://aistudiocdn.com/jspdf@^2.5.1";
import { printerService } from "../services/printer";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "https://esm.sh/html5-qrcode@2.3.8";

const POS: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "qris">("cash");

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
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [scanSelection, setScanSelection] = useState<Product | null>(null);

  const lastScanTimeRef = useRef<number>(0);
  const scannerInstanceRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    setProducts(db.getProducts());
    setSettings(db.getSettings());
    setAllCustomers(db.getCustomers());
  }, []);

  useEffect(() => {
    if (showCheckout) {
      setPaymentMethod("cash");
      setAmountPaid("");
    }
  }, [showCheckout]);

  useEffect(() => {
    if (showScanner) {
      setCameraError(null);
      const timer = setTimeout(async () => {
        try {
          const html5QrCode = new Html5Qrcode("reader", {
            formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.CODE_128],
            verbose: false,
          });
          scannerInstanceRef.current = html5QrCode;
          const config = { fps: 10, qrbox: { width: 250, height: 250 } };
          await html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => onScanSuccess(decodedText),
            () => {}
          );
        } catch (err: any) {
          setCameraError("Kamera tidak dapat diakses.");
        }
      }, 300);
      return () => {
        clearTimeout(timer);
        if (scannerInstanceRef.current?.isScanning) {
          scannerInstanceRef.current
            .stop()
            .then(() => scannerInstanceRef.current?.clear())
            .catch(console.error);
        }
      };
    }
  }, [showScanner]);

  const onScanSuccess = (decodedText: string) => {
    const now = Date.now();
    if (now - lastScanTimeRef.current < 1500) return;
    const currentProducts = db.getProducts();
    const product = currentProducts.find((p) => p.sku === decodedText);
    if (product) {
      playBeep();
      lastScanTimeRef.current = now;
      if (product.units.length > 1) {
        if (scannerInstanceRef.current?.isScanning) scannerInstanceRef.current.pause();
        setScanSelection(product);
      } else {
        addToCart(product, product.units[0]);
        setLastScanned(decodedText);
        setTimeout(() => setLastScanned(null), 2000);
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
      oscillator.type = "sine";
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

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const updateQuantity = (index: number, delta: number) => {
    setCart((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          const newQty = Math.max(1, item.quantity + delta);
          return { ...item, quantity: newQty };
        }
        return item;
      })
    );
  };

  const calculations = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    let discountRate = 0;
    if (selectedCustomer) {
      const discounts = settings.tierDiscounts || { bronze: 0, silver: 2, gold: 5 };
      const tierKey = selectedCustomer.tier.toLowerCase() as keyof typeof discounts;
      discountRate = (discounts[tierKey] || 0) / 100;
    }
    const discountAmount = subtotal * discountRate;
    const taxableAmount = subtotal - discountAmount;
    let taxAmount = 0;
    if (settings.enableTax && settings.taxRate > 0) {
      taxAmount = taxableAmount * (settings.taxRate / 100);
    }
    const total = taxableAmount + taxAmount;
    return { subtotal, discountAmount, discountRate, taxAmount, total };
  }, [cart, settings, selectedCustomer]);

  const change = (parseInt(amountPaid) || 0) - calculations.total;

  const handleCheckout = () => {
    const paid = paymentMethod === "cash" ? calculations.total : parseInt(amountPaid) || 0;
    if (paymentMethod === "cash" && paid < calculations.total) {
      alert("Pembayaran kurang!");
      return;
    }

    const transaction: Transaction = {
      id: `TX-${Date.now()}`,
      timestamp: Date.now(),
      items: cart,
      totalAmount: calculations.total,
      paymentMethod: paymentMethod,
      cashPaid: paid,
      change: paymentMethod === "qris" ? 0 : change,
      customerId: selectedCustomer?.id || null,
      customerName: selectedCustomer?.name || null,
      discountAmount: calculations.discountAmount || 0,
    };

    db.createTransaction(transaction);
    setLastTransaction(transaction);
    setProducts(db.getProducts());
    setAllCustomers(db.getCustomers());
    setShowCheckout(false);
    setShowSuccessModal(true);
    setCart([]);
    setAmountPaid("");
    setSelectedCustomer(null);
  };

  const handlePrint = async () => {
    if (!lastTransaction) return;
    if (printerService.isConnected()) {
      try {
        setIsPrinting(true);
        await printerService.printTransaction(lastTransaction, settings, paperSize);
      } catch (e: any) {
        alert("Gagal mencetak ke Bluetooth. Mengalihkan ke browser...");
        fallbackPrint();
      } finally {
        setIsPrinting(false);
      }
    } else {
      fallbackPrint();
    }
  };

  const fallbackPrint = () => {
    if (!lastTransaction) return;
    const printContent = generateReceiptHTML(lastTransaction, settings, paperSize);
    const iframe = document.getElementById("printFrame") as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(printContent);
      doc.close();
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }
  };

  const handleDownloadPDF = () => {
    if (!lastTransaction) return;
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [paperSize === "58mm" ? 58 : 80, 200],
    });
    const centerX = paperSize === "58mm" ? 29 : 40;
    let y = 10;
    const addText = (text: string, size = 9, isBold = false) => {
      doc.setFontSize(size);
      doc.setFont("helvetica", isBold ? "bold" : "normal");
      doc.text(text, centerX, y, { align: "center" });
      y += size * 0.5;
    };
    const addRow = (left: string, right: string, size = 8) => {
      doc.setFontSize(size);
      doc.setFont("helvetica", "normal");
      doc.text(left, 2, y);
      doc.text(right, paperSize === "58mm" ? 56 : 78, y, { align: "right" });
      y += size * 0.5;
    };
    const addLine = () => {
      y += 2;
      doc.setLineWidth(0.1);
      doc.line(2, y, paperSize === "58mm" ? 56 : 78, y);
      y += 4;
    };
    addText(settings.storeName, 12, true);
    y += 1;
    addText(settings.storeAddress, 8);
    addText(settings.storePhone, 8);
    addLine();
    addText(`No: ${lastTransaction.id}`, 8);
    addText(new Date(lastTransaction.timestamp).toLocaleString("id-ID"), 8);
    addLine();
    lastTransaction.items.forEach((item) => {
      doc.setFontSize(8);
      doc.text(item.productName, 2, y);
      y += 4;
      addRow(`${item.quantity} x ${item.price.toLocaleString("id-ID")}`, (item.quantity * item.price).toLocaleString("id-ID"));
    });
    addLine();
    addRow("Metode", lastTransaction.paymentMethod.toUpperCase());
    addRow("Total", `Rp ${lastTransaction.totalAmount.toLocaleString("id-ID")}`, 10);
    if (lastTransaction.paymentMethod === "cash") {
      addRow("Tunai", `Rp ${lastTransaction.cashPaid.toLocaleString("id-ID")}`);
      addRow("Kembali", `Rp ${lastTransaction.change.toLocaleString("id-ID")}`);
    }
    addLine();
    addText(settings.footerMessage, 8);
    doc.save(`struk-${lastTransaction.id}.pdf`);
  };

  const handleShareWA = () => {
    if (!lastTransaction) return;
    let text = `*${settings.storeName}*\n`;
    text += `${new Date(lastTransaction.timestamp).toLocaleString("id-ID")}\n`;
    text += `No: ${lastTransaction.id}\n`;
    text += `--------------------------------\n`;
    lastTransaction.items.forEach((item) => {
      text += `${item.productName}\n`;
      text += `${item.quantity} x ${item.price.toLocaleString("id-ID")} = ${(item.quantity * item.price).toLocaleString("id-ID")}\n`;
    });
    text += `--------------------------------\n`;
    text += `*Total: Rp ${lastTransaction.totalAmount.toLocaleString("id-ID")}*\n`;
    text += `Metode: ${lastTransaction.paymentMethod.toUpperCase()}\n`;
    text += `--------------------------------\n`;
    text += `${settings.footerMessage}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.includes(search));
  const filteredCustomers = allCustomers.filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone.includes(customerSearch));
  const qrisUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=PRO_WARUNG_POS_${calculations.total}`;

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col lg:flex-row gap-4">
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <i className="fa-solid fa-search absolute left-3 top-3 text-gray-400"></i>
            <Input placeholder="Cari produk atau scan..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button onClick={() => setShowScanner(true)} variant="secondary" icon="fa-solid fa-barcode">
            Scan
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto pr-2">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} onAdd={addToCart} />
            ))}
          </div>
        </div>
      </div>

      <Card className="w-full lg:w-96 flex flex-col border-l border-gray-200 shadow-lg h-1/2 lg:h-full">
        <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-xl space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-bold text-gray-800">Keranjang</h2>
            {lastTransaction && (
              <button onClick={handlePrint} disabled={isPrinting} className="text-blue-600 text-[10px] flex items-center gap-1 bg-blue-50 border border-blue-100 px-2 py-1 rounded-lg font-bold">
                <i className={`fa-solid ${isPrinting ? "fa-spinner fa-spin" : "fa-print"}`}></i> Struk Terakhir
              </button>
            )}
          </div>
          <button onClick={() => setShowCustomerModal(true)} className="w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm bg-white border-gray-200">
            <span className="truncate">{selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.tier})` : "Pilih Pelanggan"}</span>
            <i className="fa-solid fa-chevron-right text-[10px] text-gray-400"></i>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.map((item, idx) => (
            <div key={idx} className="flex justify-between items-start">
              <div className="flex-1">
                <div className="font-medium text-sm text-gray-800">{item.productName}</div>
                <div className="text-xs text-gray-500">
                  {item.unitName} @ {item.price.toLocaleString("id-ID")}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center border rounded-lg bg-gray-50">
                  <button onClick={() => updateQuantity(idx, -1)} className="px-2 py-1 text-gray-600">
                    -
                  </button>
                  <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                  <button onClick={() => updateQuantity(idx, 1)} className="px-2 py-1 text-gray-600">
                    +
                  </button>
                </div>
                <button onClick={() => removeFromCart(idx)} className="text-red-400">
                  <i className="fa-solid fa-trash"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 bg-gray-50 border-t border-gray-200 rounded-b-xl">
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-600 font-bold">Total</span>
            <span className="text-2xl font-bold text-blue-700">Rp {calculations.total.toLocaleString("id-ID")}</span>
          </div>
          <Button className="w-full py-3 text-lg" disabled={cart.length === 0} onClick={() => setShowCheckout(true)}>
            Bayar
          </Button>
        </div>
      </Card>

      <Modal isOpen={showCheckout} onClose={() => setShowCheckout(false)} title="Pembayaran">
        <div className="space-y-4">
          <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
            <button onClick={() => setPaymentMethod("cash")} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${paymentMethod === "cash" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}>
              TUNAI
            </button>
            <button onClick={() => setPaymentMethod("qris")} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${paymentMethod === "qris" ? "bg-blue-600 text-white shadow-sm" : "text-slate-500"}`}>
              QRIS
            </button>
          </div>
          <div className="text-center py-4 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-sm text-blue-600">Total Tagihan</p>
            <p className="text-3xl font-bold text-blue-800">Rp {calculations.total.toLocaleString("id-ID")}</p>
          </div>
          {paymentMethod === "cash" ? (
            <div className="space-y-4">
              <Input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} label="Uang Diterima" placeholder="0" className="text-lg" autoFocus />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setAmountPaid(calculations.total.toString())} className="col-span-2 py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-black">
                  UANG PAS
                </button>
                {[50000, 100000].map((val) => (
                  <button key={val} onClick={() => setAmountPaid(val.toString())} className="py-2 bg-gray-100 rounded-lg text-xs font-bold">
                    Rp {val.toLocaleString("id-ID")}
                  </button>
                ))}
              </div>
              {parseInt(amountPaid) >= calculations.total && (
                <div className="pt-2 flex justify-between items-center">
                  <span className="text-gray-600">Kembalian</span>
                  <span className="text-xl font-bold text-green-600">Rp {change.toLocaleString("id-ID")}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center space-y-4 py-2">
              <div className="mx-auto w-48 h-48 bg-white p-2 rounded-xl border-2 border-slate-200 flex items-center justify-center relative">
                <img src={qrisUrl} alt="QRIS" className="w-full h-full object-contain" />
                <div className="absolute inset-0 flex items-center justify-center bg-white/10 pointer-events-none">
                  <div className="bg-white px-2 py-0.5 rounded text-[8px] font-black text-blue-900 border border-blue-900 shadow-sm">QRIS</div>
                </div>
              </div>
              <p className="text-xs text-slate-500 px-6">Tunjukkan QR ini ke pelanggan. Pastikan dana sudah masuk ke aplikasi merchant Anda sebelum klik tombol di bawah.</p>
            </div>
          )}
          <Button onClick={handleCheckout} className="w-full py-3 mt-2" disabled={paymentMethod === "cash" && (!amountPaid || parseInt(amountPaid) < calculations.total)}>
            {paymentMethod === "cash" ? "Proses Tunai" : "Konfirmasi QRIS Terbayar"}
          </Button>
        </div>
      </Modal>

      <Modal isOpen={showScanner} onClose={() => setShowScanner(false)} title="Scanner">
        <div id="reader" className="w-full max-w-[300px] mx-auto bg-black rounded-xl overflow-hidden min-h-[250px] border-2 border-blue-500"></div>
        {cameraError && <p className="text-center text-red-500 text-sm mt-4">{cameraError}</p>}
      </Modal>
    </div>
  );
};

const ProductCard: React.FC<{ product: Product; onAdd: (p: Product, u: ProductUnit) => void }> = ({ product, onAdd }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow h-full flex flex-col justify-between">
    <div>
      <span className="text-[9px] font-black text-blue-500 uppercase">{product.category}</span>
      <h3 className="font-bold text-gray-800 text-sm leading-tight mb-2">{product.name}</h3>
    </div>
    <div className="space-y-1">
      {product.units.map((unit, idx) => (
        <button key={idx} onClick={() => onAdd(product, unit)} className="w-full flex justify-between items-center px-2 py-1.5 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors border border-gray-100">
          <span className="text-[10px] font-bold text-gray-600">{unit.name}</span>
          <span className="text-xs font-black text-slate-800">{unit.price.toLocaleString("id-ID", { notation: "compact" })}</span>
        </button>
      ))}
    </div>
  </div>
);

const generateReceiptHTML = (tx: Transaction, settings: AppSettings, size: "58mm" | "80mm") => {
  const width = size === "58mm" ? "58mm" : "80mm";
  const itemsHtml = tx.items
    .map(
      (item) => `
    <div style="display:flex; justify-content:space-between; margin-bottom:2px;"><span>${item.productName}</span></div>
    <div style="display:flex; justify-content:space-between; margin-bottom:4px; color:#444;"><span>${item.quantity} x ${item.price.toLocaleString("id-ID")}</span><span>${(item.quantity * item.price).toLocaleString("id-ID")}</span></div>
  `
    )
    .join("");
  return `<html><head><style>@page{margin:0;size:${width} auto;}body{font-family:'Courier New',monospace;width:${width};margin:0;padding:5px;font-size:10px;}.center{text-align:center;}.bold{font-weight:bold;}.line{border-top:1px dashed #000;margin:5px 0;}.row{display:flex;justify-content:space-between;}</style></head><body><div class="center bold">${
    settings.storeName
  }</div><div class="center">${settings.storeAddress}</div><div class="line"></div><div class="row"><span>${new Date(tx.timestamp).toLocaleString("id-ID")}</span></div><div class="row"><span>No: ${
    tx.id
  }</span></div><div class="line"></div>${itemsHtml}<div class="line"></div><div class="row"><span>Metode</span><span>${tx.paymentMethod.toUpperCase()}</span></div><div class="row bold"><span>TOTAL</span><span>Rp ${tx.totalAmount.toLocaleString(
    "id-ID"
  )}</span></div>${
    tx.paymentMethod === "cash" ? `<div class="row"><span>Tunai</span><span>Rp ${tx.cashPaid.toLocaleString("id-ID")}</span></div><div class="row"><span>Kembali</span><span>Rp ${tx.change.toLocaleString("id-ID")}</span></div>` : ""
  }<div class="line"></div><div class="center">${settings.footerMessage}</div></body></html>`;
};

export default POS;
