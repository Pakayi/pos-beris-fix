import { Transaction, AppSettings } from "../types";

const ESC = 0x1b;
const GS = 0x1d;

const COMMANDS = {
  INIT: [ESC, 0x40],
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  FEED_LINES: (n: number) => [ESC, 0x64, n],
};

class PrinterService {
  private device: any | null = null;
  private characteristic: any | null = null;

  private readonly SERVICE_UUIDS = ["000018f0-0000-1000-8000-00805f9b34fb", "e7810a71-73ae-499d-8c15-faa9aef0c3f2", "0000ff00-0000-1000-8000-00805f9b34fb"];

  private readonly CHAR_UUIDS = ["00002af1-0000-1000-8000-00805f9b34fb", "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f", "0000ff02-0000-1000-8000-00805f9b34fb"];

  isSupported(): boolean {
    return !!(navigator as any).bluetooth;
  }

  isConnected(): boolean {
    return !!this.device && !!this.device.gatt?.connected;
  }

  async connect(): Promise<string> {
    try {
      this.device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: this.SERVICE_UUIDS }, { namePrefix: "MPT" }, { namePrefix: "RPP" }, { namePrefix: "Printer" }],
        optionalServices: [...this.SERVICE_UUIDS],
      });
      const server = await this.device.gatt.connect();
      let service: any;
      for (const uuid of this.SERVICE_UUIDS) {
        try {
          service = await server.getPrimaryService(uuid);
          if (service) break;
        } catch (e) {}
      }
      if (!service) throw new Error("Service printer tidak ditemukan.");
      for (const uuid of this.CHAR_UUIDS) {
        try {
          this.characteristic = await service.getCharacteristic(uuid);
          if (this.characteristic) break;
        } catch (e) {}
      }
      if (!this.characteristic) throw new Error("Karakteristik Write tidak ditemukan.");
      return this.device.name || "Printer Bluetooth";
    } catch (error: any) {
      throw error;
    }
  }

  async disconnect() {
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.device = null;
    this.characteristic = null;
  }

  generateReceiptData(tx: Transaction, settings: AppSettings, width: "58mm" | "80mm"): Uint8Array {
    const commands: number[] = [];
    const MAX_CHARS = width === "58mm" ? 32 : 48;

    const addText = (text: string) => {
      const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      for (let i = 0; i < normalized.length; i++) commands.push(normalized.charCodeAt(i));
    };
    const addLine = (left: string, right: string) => {
      const spaces = Math.max(1, MAX_CHARS - left.length - right.length);
      addText(left + " ".repeat(spaces) + right + "\n");
    };
    const addSeparator = () => addText("-".repeat(MAX_CHARS) + "\n");

    commands.push(...COMMANDS.INIT);
    commands.push(...COMMANDS.ALIGN_CENTER);
    commands.push(...COMMANDS.BOLD_ON);
    addText(settings.storeName + "\n");
    commands.push(...COMMANDS.BOLD_OFF);
    addText(settings.storeAddress + "\n");
    addText(settings.storePhone + "\n\n");

    commands.push(...COMMANDS.ALIGN_LEFT);
    addText(`Tgl : ${new Date(tx.timestamp).toLocaleString("id-ID")}\n`);
    addText(`No  : ${tx.id}\n`);
    addSeparator();

    tx.items.forEach((item) => {
      addText(item.productName + "\n");
      addLine(`${item.quantity}x ${item.price.toLocaleString("id-ID")}`, (item.quantity * item.price).toLocaleString("id-ID"));
    });
    addSeparator();

    addLine("Metode", tx.paymentMethod.toUpperCase());
    commands.push(...COMMANDS.BOLD_ON);
    addLine("TOTAL", `Rp ${tx.totalAmount.toLocaleString("id-ID")}`);
    commands.push(...COMMANDS.BOLD_OFF);

    if (tx.paymentMethod === "cash") {
      addLine("Tunai", `Rp ${tx.cashPaid.toLocaleString("id-ID")}`);
      addLine("Kembali", `Rp ${tx.change.toLocaleString("id-ID")}`);
    }

    addText("\n");
    commands.push(...COMMANDS.ALIGN_CENTER);
    addText(settings.footerMessage + "\n");
    addText("Terima Kasih\n");
    commands.push(...COMMANDS.FEED_LINES(3));

    return new Uint8Array(commands);
  }

  async printTransaction(tx: Transaction, settings: AppSettings, width: "58mm" | "80mm") {
    if (!this.characteristic) throw new Error("Printer tidak terhubung");
    const data = this.generateReceiptData(tx, settings, width);
    const CHUNK_SIZE = 100;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      await this.characteristic.writeValue(data.slice(i, i + CHUNK_SIZE));
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}

export const printerService = new PrinterService();
