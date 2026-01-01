import React, { useState, useEffect, useMemo, useRef } from "react";
import { db } from "../services/db";
import { Product, ProductUnit, CartItem, Transaction, AppSettings, Customer } from "../types";
import { Button, Input, Modal, Card } from "../components/UI";
import { jsPDF } from "jspdf";
import { printerService } from "../services/printer";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

const POS: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [amountPaid, setAmountPaid] = useState<string>("");

  // Customer State
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);

  // Success & Print State
  const [lastTransaction, setLastTransaction] = useState<Transaction | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [paperSize, setPaperSize] = useState<"58mm" | "80mm">("58mm");
  const [settings, setSettings] = useState<AppSettings>(db.getSettings());
  const [isPrinting, setIsPrinting] = useState(false);

  // Scanner State
  const [showScanner, setShowScanner] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Unit Selection State
  const [scanSelection, setScanSelection] = useState<Product | null>(null);

  const lastScanTimeRef = useRef<number>(0);
  const scannerInstanceRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    setProducts(db.getProducts());
    setSettings(db.getSettings());
    setAllCustomers(db.getCustomers());
  }, []);

  // AUTO-START SCANNER LOGIC
  useEffect(() => {
    if (showScanner) {
      setCameraError(null);
      // Tunggu DOM siap
      const timer = setTimeout(async () => {
        try {
          // FIX: Moved formatsToSupport from .start() config to Html5Qrcode constructor
          const html5QrCode = new Html5Qrcode("reader", {
            formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.CODE_128],
          });
          scannerInstanceRef.current = html5QrCode;

          const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          };

          // LANGSUNG START tanpa klik tombol
          await html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => onScanSuccess(decodedText),
            (errorMessage) => {
              /* ignore constant scan failures */
            }
          );
        } catch (err: any) {
          console.error("Gagal menjalankan kamera otomatis", err);
          setCameraError("Kamera tidak dapat diakses. Pastikan izin diberikan.");
        }
      }, 300);

      return () => {
        clearTimeout(timer);
        if (scannerInstanceRef.current) {
          if (scannerInstanceRef.current.isScanning) {
            scannerInstanceRef.current
              .stop()
              .then(() => {
                scannerInstanceRef.current?.clear();
              })
              .catch(console.error);
          }
        }
      };
    }
  }, [showScanner]);

  const onScanSuccess = (decodedText: string) => {
    const now = Date.now();

    // Cooldown 1.5 detik agar tidak ter-scan berkali-kali
    if (now - lastScanTimeRef.current < 1500) return;

    const currentProducts = db.getProducts();
    const product = currentProducts.find((p) => p.sku === decodedText);

    if (product) {
      playBeep();
      lastScanTimeRef.current = now;

      if (product.units.length > 1) {
        // Pause jika harus pilih satuan
        if (scannerInstanceRef.current?.isScanning) {
          scannerInstanceRef.current.pause();
        }
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
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnitSelectFromScan = (unit: ProductUnit) => {
    if (scanSelection) {
      addToCart(scanSelection, unit);
      setScanSelection(null);
      setLastScanned(scanSelection.sku);
      setTimeout(() => setLastScanned(null), 2000);
      if (scannerInstanceRef.current) {
        scannerInstanceRef.current.resume();
      }
    }
  };

  const cancelScanSelection = () => {
    setScanSelection(null);
    if (scannerInstanceRef.current) {
      scannerInstanceRef.current.resume();
    }
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
      paymentMethod: "cash" as const,
      cashPaid: paid,
      change: change,
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
        alert("Gagal mencetak ke Bluetooth: " + e.message + "\nMengalihkan ke dialog browser...");
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
    if (lastTransaction.customerName) {
      addText(`Pelanggan: ${lastTransaction.customerName}`, 8);
    }
    addLine();
    lastTransaction.items.forEach((item) => {
      doc.setFontSize(8);
      doc.text(item.productName, 2, y);
      y += 4;
      addRow(`${item.quantity} x ${item.price.toLocaleString("id-ID")}`, (item.quantity * item.price).toLocaleString("id-ID"));
    });
    addLine();
    if (lastTransaction.discountAmount && lastTransaction.discountAmount > 0) {
      addRow("Subtotal", `Rp ${(lastTransaction.totalAmount + lastTransaction.discountAmount).toLocaleString("id-ID")}`);
      addRow("Diskon", `- Rp ${lastTransaction.discountAmount.toLocaleString("id-ID")}`);
    }
    addRow("Total", `Rp ${lastTransaction.totalAmount.toLocaleString("id-ID")}`, 10);
    addRow("Tunai", `Rp ${lastTransaction.cashPaid.toLocaleString("id-ID")}`);
    addRow("Kembali", `Rp ${lastTransaction.change.toLocaleString("id-ID")}`);
    addLine();
    addText(settings.footerMessage, 8);
    addText("Simpan struk ini sebagai bukti.", 7);
    doc.save(`struk-${lastTransaction.id}.pdf`);
  };

  const handleShareWA = () => {
    if (!lastTransaction) return;
    let text = `*${settings.storeName}*\n`;
    text += `${new Date(lastTransaction.timestamp).toLocaleString("id-ID")}\n`;
    text += `No: ${lastTransaction.id}\n`;
    if (lastTransaction.customerName) text += `Pelanggan: ${lastTransaction.customerName}\n`;
    text += `--------------------------------\n`;
    lastTransaction.items.forEach((item) => {
      text += `${item.productName}\n`;
      text += `${item.quantity} x ${item.price.toLocaleString("id-ID")} = ${(item.quantity * item.price).toLocaleString("id-ID")}\n`;
    });
    text += `--------------------------------\n`;
    if (lastTransaction.discountAmount && lastTransaction.discountAmount > 0) {
      text += `Diskon: - Rp ${lastTransaction.discountAmount.toLocaleString("id-ID")}\n`;
    }
    text += `*Total: Rp ${lastTransaction.totalAmount.toLocaleString("id-ID")}*\n`;
    text += `${settings.footerMessage}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.includes(search));

  const filteredCustomers = allCustomers.filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone.includes(customerSearch));

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col lg:flex-row gap-4">
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <i className="fa-solid fa-search absolute left-3 top-3 text-gray-400"></i>
            <Input placeholder="Cari nama produk atau scan barcode..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          </div>
          <Button onClick={() => setShowScanner(true)} variant="secondary" icon="fa-barcode">
            Scan
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} onAdd={addToCart} />
            ))}
            {filteredProducts.length === 0 && (
              <div className="col-span-full text-center py-10 text-gray-400">
                <i className="fa-solid fa-box-open text-4xl mb-3"></i>
                <p>Produk tidak ditemukan</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Card className="w-full lg:w-96 flex flex-col border-l border-gray-200 rounded-none lg:rounded-xl shadow-lg h-1/2 lg:h-full">
        <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-xl space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-bold text-gray-800">
              <i className="fa-solid fa-cart-shopping mr-2"></i>Keranjang
            </h2>
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-bold">{cart.length} item</span>
          </div>
          <button
            onClick={() => {
              setCustomerSearch("");
              setShowCustomerModal(true);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors ${
              selectedCustomer ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-white border-gray-200 text-gray-500 hover:border-blue-300"
            }`}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <i className={`fa-solid ${selectedCustomer ? "fa-user-check" : "fa-user-plus"}`}></i>
              <span className="truncate font-medium">{selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.tier})` : "Pilih Pelanggan / Member"}</span>
            </div>
            {selectedCustomer && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedCustomer(null);
                }}
                className="text-amber-600 hover:text-amber-800 px-1"
              >
                <i className="fa-solid fa-times"></i>
              </span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="text-center text-gray-400 py-10">
              <p>Keranjang kosong</p>
              <p className="text-xs mt-1">Pilih produk di sebelah kiri</p>
            </div>
          ) : (
            cart.map((item, idx) => (
              <div key={idx} className="flex justify-between items-start group">
                <div className="flex-1">
                  <div className="font-medium text-sm text-gray-800">{item.productName}</div>
                  <div className="text-xs text-gray-500">
                    {item.unitName} @ {item.price.toLocaleString("id-ID")}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center border rounded-lg bg-gray-50">
                    <button onClick={() => updateQuantity(idx, -1)} className="px-2 py-1 hover:bg-gray-200 rounded-l-lg text-gray-600">
                      -
                    </button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <button onClick={() => updateQuantity(idx, 1)} className="px-2 py-1 hover:bg-gray-200 rounded-r-lg text-gray-600">
                      +
                    </button>
                  </div>
                  <button onClick={() => removeFromCart(idx)} className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-200 rounded-b-xl space-y-2">
          <div className="space-y-1 text-sm text-gray-600 pb-2 border-b border-gray-200 mb-2">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>Rp {calculations.subtotal.toLocaleString("id-ID")}</span>
            </div>
            {selectedCustomer && (
              <div className="flex justify-between text-green-600 font-medium">
                <span>
                  Diskon {selectedCustomer.tier} ({calculations.discountRate * 100}%)
                </span>
                <span>- Rp {calculations.discountAmount.toLocaleString("id-ID")}</span>
              </div>
            )}
            {settings.enableTax && (
              <div className="flex justify-between">
                <span>Pajak ({settings.taxRate}%)</span>
                <span>Rp {calculations.taxAmount.toLocaleString("id-ID")}</span>
              </div>
            )}
          </div>
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-600 font-bold">Total</span>
            <span className="text-2xl font-bold text-blue-700">Rp {calculations.total.toLocaleString("id-ID")}</span>
          </div>
          <Button className="w-full py-3 text-lg shadow-blue-200 shadow-lg" disabled={cart.length === 0} onClick={() => setShowCheckout(true)}>
            Bayar
          </Button>
        </div>
      </Card>

      <Modal
        isOpen={showCheckout}
        onClose={() => setShowCheckout(false)}
        title="Pembayaran"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCheckout(false)}>
              Batal
            </Button>
            <Button onClick={handleCheckout} disabled={!amountPaid || parseInt(amountPaid) < calculations.total}>
              Proses Pembayaran
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="text-center py-4 bg-blue-50 rounded-lg border border-blue-100 relative overflow-hidden">
            {selectedCustomer && <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-1 rounded-bl-lg">Member {selectedCustomer.tier}</div>}
            <p className="text-sm text-blue-600">Total Tagihan</p>
            <p className="text-3xl font-bold text-blue-800">Rp {calculations.total.toLocaleString("id-ID")}</p>
            {calculations.discountAmount > 0 && <p className="text-xs text-green-600 mt-1">Hemat: Rp {calculations.discountAmount.toLocaleString("id-ID")}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Uang Tunai Diterima</label>
            <Input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="0" className="text-lg font-mono" autoFocus />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[10000, 20000, 50000, 100000].map((val) => (
              <button key={val} onClick={() => setAmountPaid(val.toString())} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 text-gray-600">
                {val.toLocaleString("id-ID")}
              </button>
            ))}
            <button onClick={() => setAmountPaid(calculations.total.toString())} className="col-span-2 px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 rounded border border-blue-300 text-blue-700">
              Uang Pas
            </button>
          </div>
          {parseInt(amountPaid) >= calculations.total && (
            <div className="pt-4 border-t border-dashed">
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-700">Kembalian</span>
                <span className="text-xl font-bold text-emerald-600">Rp {change.toLocaleString("id-ID")}</span>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        title="Pilih Pelanggan"
        footer={
          <Button variant="secondary" onClick={() => setShowCustomerModal(false)}>
            Tutup
          </Button>
        }
      >
        <div className="space-y-3">
          <Input placeholder="Cari nama atau nomor HP..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} autoFocus />
          <div className="max-h-[300px] overflow-y-auto border rounded-lg divide-y">
            <button
              onClick={() => {
                setSelectedCustomer(null);
                setShowCustomerModal(false);
              }}
              className="w-full text-left p-3 hover:bg-gray-50 flex items-center gap-3 text-gray-600"
            >
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                <i className="fa-solid fa-user"></i>
              </div>
              <div>
                <p className="font-medium">Tamu (Umum)</p>
                <p className="text-xs">Harga Normal</p>
              </div>
            </button>
            {filteredCustomers.map((c) => {
              const discounts = settings.tierDiscounts || { bronze: 0, silver: 2, gold: 5 };
              const tierKey = c.tier.toLowerCase() as keyof typeof discounts;
              const discRate = discounts[tierKey];
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedCustomer(c);
                    setShowCustomerModal(false);
                  }}
                  className="w-full text-left p-3 hover:bg-blue-50 flex items-center gap-3 transition-colors"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border ${
                      c.tier === "Gold" ? "bg-yellow-100 text-yellow-700 border-yellow-300" : c.tier === "Silver" ? "bg-gray-100 text-gray-700 border-gray-300" : "bg-orange-50 text-orange-700 border-orange-200"
                    }`}
                  >
                    {c.tier[0]}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <p className="font-medium text-gray-800">{c.name}</p>
                      {discRate > 0 && <span className="text-xs font-bold text-green-600">Disc. {discRate}%</span>}
                    </div>
                    <p className="text-xs text-gray-500">{c.phone}</p>
                  </div>
                </button>
              );
            })}
            {filteredCustomers.length === 0 && <div className="p-4 text-center text-gray-500 text-sm">Pelanggan tidak ditemukan</div>}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showSuccessModal}
        onClose={() => {}}
        title="Transaksi Berhasil!"
        footer={
          <Button className="w-full" onClick={() => setShowSuccessModal(false)}>
            Selesai & Transaksi Baru
          </Button>
        }
      >
        <div className="text-center space-y-6">
          <div className="flex flex-col items-center justify-center pt-2">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-3 text-green-600 text-3xl animate-bounce">
              <i className="fa-solid fa-check"></i>
            </div>
            <p className="text-gray-600">Kembalian</p>
            <p className="text-3xl font-bold text-gray-800">Rp {lastTransaction?.change.toLocaleString("id-ID")}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3">
            <div className="flex justify-between items-center pb-3 border-b border-gray-200">
              <span className="text-sm font-semibold text-gray-700">Opsi Cetak</span>
              <select className="text-xs border rounded p-1 bg-white" value={paperSize} onChange={(e) => setPaperSize(e.target.value as any)}>
                <option value="58mm">Kertas 58mm</option>
                <option value="80mm">Kertas 80mm</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={handlePrint} disabled={isPrinting} variant="outline" icon={isPrinting ? "fa-circle-notch fa-spin" : "fa-print"} className="h-12 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
                {isPrinting ? "Mencetak..." : "Cetak Struk"}
              </Button>
              <Button onClick={handleDownloadPDF} variant="outline" icon="fa-file-pdf" className="h-12 border-red-200 bg-red-50 text-red-700 hover:bg-red-100">
                Unduh PDF
              </Button>
              <Button onClick={handleShareWA} variant="outline" icon="fa-whatsapp" className="col-span-2 h-12 border-green-200 bg-green-50 text-green-700 hover:bg-green-100">
                Kirim ke WhatsApp
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        title="Scan Barcode (Auto-Start)"
        footer={
          <Button variant="secondary" onClick={() => setShowScanner(false)}>
            Tutup
          </Button>
        }
      >
        <div className="flex flex-col items-center justify-center relative">
          {!scanSelection && !cameraError && (
            <>
              <div id="reader" className="w-full max-w-[300px] bg-black rounded-lg overflow-hidden min-h-[250px] border-2 border-blue-500"></div>
              {lastScanned && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-bounce">
                  <i className="fa-solid fa-check"></i>
                  <span>Berhasil!</span>
                </div>
              )}
              <p className="text-xs text-blue-600 font-bold mt-4 text-center animate-pulse">
                <i className="fa-solid fa-video mr-2"></i> Kamera Aktif - Siap Scan
              </p>
            </>
          )}

          {cameraError && (
            <div className="text-center p-6 bg-red-50 rounded-xl border border-red-100">
              <i className="fa-solid fa-video-slash text-4xl text-red-400 mb-3"></i>
              <h3 className="font-bold text-red-800 mb-2">Akses Kamera Bermasalah</h3>
              <p className="text-sm text-red-600">{cameraError}</p>
            </div>
          )}

          {scanSelection && (
            <div className="w-full max-w-[300px] py-4">
              <div className="text-center mb-4">
                <p className="text-sm text-gray-500">Produk Terdeteksi:</p>
                <h3 className="font-bold text-lg text-gray-800">{scanSelection.name}</h3>
                <p className="text-xs text-blue-600 mt-1">Pilih satuan:</p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {scanSelection.units.map((unit, idx) => (
                  <button key={idx} onClick={() => handleUnitSelectFromScan(unit)} className="flex justify-between items-center p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors">
                    <span className="font-bold text-blue-900">{unit.name}</span>
                    <span className="font-mono text-sm text-gray-600">Rp {unit.price.toLocaleString("id-ID")}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4 border-t pt-4">
                <Button variant="danger" size="sm" className="w-full" onClick={cancelScanSelection}>
                  Batal
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

const ProductCard: React.FC<{ product: Product; onAdd: (p: Product, u: ProductUnit) => void }> = ({ product, onAdd }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow flex flex-col justify-between h-full">
      <div>
        <div className="flex justify-between items-start mb-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{product.category}</span>
          <span className={`w-2 h-2 rounded-full ${product.stock <= product.minStockAlert ? "bg-red-500" : "bg-emerald-500"}`}></span>
        </div>
        <h3 className="font-semibold text-gray-800 leading-tight mb-1 line-clamp-2">{product.name}</h3>
        <p className="text-xs text-gray-500 mb-3">
          Stok: {Math.floor(product.stock)} {product.baseUnit}
        </p>
      </div>
      <div className="space-y-1">
        {product.units.map((unit, idx) => (
          <button
            key={idx}
            onClick={() => onAdd(product, unit)}
            className="w-full flex justify-between items-center px-2 py-1.5 text-xs bg-gray-50 hover:bg-blue-50 hover:text-blue-700 border border-gray-100 rounded transition-colors group"
          >
            <span className="font-medium">{unit.name}</span>
            <span className="font-bold text-gray-700 group-hover:text-blue-700">{unit.price.toLocaleString("id-ID", { notation: "compact", compactDisplay: "short" })}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

const generateReceiptHTML = (tx: Transaction, settings: AppSettings, size: "58mm" | "80mm") => {
  const width = size === "58mm" ? "58mm" : "80mm";
  const fontSize = size === "58mm" ? "10px" : "12px";
  const itemsHtml = tx.items
    .map(
      (item) => `
    <div style="display:flex; justify-content:space-between; margin-bottom: 2px;"><span>${item.productName}</span></div>
    <div style="display:flex; justify-content:space-between; margin-bottom: 4px; color: #555;">
       <span>${item.quantity} x ${item.price.toLocaleString("id-ID")}</span>
       <span>${(item.quantity * item.price).toLocaleString("id-ID")}</span>
    </div>
  `
    )
    .join("");
  return `<html><head><style>@page { margin: 0; size: ${width} auto; }body { font-family: 'Courier New', monospace; width: ${width}; margin: 0; padding: 5px; font-size: ${fontSize}; color: #000; }.center { text-align: center; }.bold { font-weight: bold; }.line { border-top: 1px dashed #000; margin: 5px 0; }.row { display: flex; justify-content: space-between; }</style></head><body><div class="center bold">${
    settings.storeName
  }</div><div class="center">${settings.storeAddress}</div><div class="center">${settings.storePhone}</div><div class="line"></div><div class="row"><span>${new Date(tx.timestamp).toLocaleString(
    "id-ID"
  )}</span></div><div class="row"><span>No: ${tx.id}</span></div><div class="line"></div>${itemsHtml}<div class="line"></div><div class="row bold"><span>TOTAL</span><span>Rp ${tx.totalAmount.toLocaleString(
    "id-ID"
  )}</span></div><div class="row"><span>Tunai</span><span>Rp ${tx.cashPaid.toLocaleString("id-ID")}</span></div><div class="row"><span>Kembali</span><span>Rp ${tx.change.toLocaleString(
    "id-ID"
  )}</span></div><div class="line"></div><div class="center">${settings.footerMessage}</div></body></html>`;
};

export default POS;
