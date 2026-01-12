import { Transaction, AppSettings } from '../types';

// --- Web Bluetooth Type Definitions ---
interface BluetoothLEScanFilter {
  name?: string;
  namePrefix?: string;
  services?: string[];
}

interface RequestDeviceOptions {
  filters?: BluetoothLEScanFilter[];
  optionalServices?: string[];
  acceptAllDevices?: boolean;
}

interface BluetoothRemoteGATTCharacteristic {
  writeValue(value: BufferSource): Promise<void>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  device: BluetoothDevice;
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
}

interface Bluetooth {
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
}

declare global {
  interface Navigator {
    bluetooth: Bluetooth;
  }
}
// --------------------------------------

// Constants for ESC/POS Commands
const ESC = 0x1B;
const GS = 0x1D;

const COMMANDS = {
  INIT: [ESC, 0x40], // Initialize printer
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  TEXT_NORMAL: [GS, 0x21, 0x00],
  TEXT_DOUBLE_HEIGHT: [GS, 0x21, 0x01],
  TEXT_DOUBLE_WIDTH: [GS, 0x21, 0x10],
  TEXT_DOUBLE_BOTH: [GS, 0x21, 0x11],
  FEED_LINES: (n: number) => [ESC, 0x64, n], // Feed n lines
  CUT_PAPER: [GS, 0x56, 0x41, 0x10] // Cut paper
};

class PrinterService {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;

  // Generic UUIDs often used by thermal printers
  private readonly SERVICE_UUIDS = [
    '000018f0-0000-1000-8000-00805f9b34fb', // Generic Printer Service
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Some generic thermal printers
    '0000ff00-0000-1000-8000-00805f9b34fb', // Specific manufacturers
  ];
  
  // Characteristic UUIDs for Writing
  private readonly CHAR_UUIDS = [
    '00002af1-0000-1000-8000-00805f9b34fb',
    'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
    '0000ff02-0000-1000-8000-00805f9b34fb',
  ];

  isSupported(): boolean {
    return !!navigator.bluetooth;
  }

  isConnected(): boolean {
    return !!this.device && !!this.device.gatt?.connected;
  }

  getDeviceName(): string | undefined {
    return this.device?.name;
  }

  async connect(): Promise<string> {
    if (!this.isSupported()) {
      throw new Error('Bluetooth tidak didukung di browser ini.');
    }

    try {
      // 1. Request Device
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: this.SERVICE_UUIDS },
          // Allow all devices as fallback since many cheap printers don't advertise correctly
          { namePrefix: 'MPT' }, 
          { namePrefix: 'RPP' }, 
          { namePrefix: 'BlueTooth' },
          { namePrefix: 'Printer' }
        ],
        optionalServices: [...this.SERVICE_UUIDS]
      });

      if (!this.device.gatt) throw new Error('Device GATT server not found');

      // 2. Connect to Server
      this.server = await this.device.gatt.connect();

      // 3. Find Service & Characteristic
      let service: BluetoothRemoteGATTService | undefined;
      
      // Try finding a known service
      for (const uuid of this.SERVICE_UUIDS) {
        try {
          service = await this.server.getPrimaryService(uuid);
          if (service) break;
        } catch (e) { /* continue */ }
      }

      // If generic lookup failed, try to get ANY service (rarely needed but good fallback)
      if (!service) {
         // This part is tricky in standard Web Bluetooth, usually we must specify UUID
         throw new Error('Service printer tidak ditemukan.');
      }

      // Try finding write characteristic
      for (const uuid of this.CHAR_UUIDS) {
        try {
          this.characteristic = await service.getCharacteristic(uuid);
          if (this.characteristic) break;
        } catch (e) { /* continue */ }
      }

      if (!this.characteristic) {
        throw new Error('Karakteristik Write tidak ditemukan.');
      }

      this.device.addEventListener('gattserverdisconnected', this.handleDisconnect);
      
      return this.device.name || 'Printer Unknown';

    } catch (error: any) {
      console.error('Connection failed', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.device && this.device.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.server = null;
    this.characteristic = null;
  }

  private handleDisconnect = () => {
    console.log('Printer disconnected');
    // Optionally trigger a UI update event here
  };

  /**
   * Convert string to Uint8Array using code page logic (Simplified to ASCII for MVP)
   */
  private encode(text: string): Uint8Array {
    // Basic text encoder. For full POS support, we'd need a specific library to handle
    // code pages (like PC437) for special characters (Rp, etc). 
    // Here we strip accents to be safe.
    const encoder = new TextEncoder();
    return encoder.encode(text);
  }

  /**
   * Generate ESC/POS commands for a transaction
   */
  generateReceiptData(tx: Transaction, settings: AppSettings, width: '58mm' | '80mm'): Uint8Array {
    const commands: number[] = [];
    const MAX_CHARS = width === '58mm' ? 32 : 48; // Approximate char width for standard font

    const addCmd = (cmd: number[]) => commands.push(...cmd);
    const addText = (text: string) => {
      // Simple ASCII normalization
      const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      for (let i = 0; i < normalized.length; i++) {
        commands.push(normalized.charCodeAt(i));
      }
    };
    const addLine = (left: string, right: string) => {
      const leftLen = left.length;
      const rightLen = right.length;
      const spaces = Math.max(1, MAX_CHARS - leftLen - rightLen);
      addText(left + ' '.repeat(spaces) + right + '\n');
    };
    const addSeparator = () => addText('-'.repeat(MAX_CHARS) + '\n');

    // --- Start Receipt ---
    addCmd(COMMANDS.INIT);
    
    // Header
    addCmd(COMMANDS.ALIGN_CENTER);
    addCmd(COMMANDS.BOLD_ON);
    // addCmd(COMMANDS.TEXT_DOUBLE_HEIGHT);
    addText(settings.storeName + '\n');
    // addCmd(COMMANDS.TEXT_NORMAL);
    addCmd(COMMANDS.BOLD_OFF);
    addText(settings.storeAddress + '\n');
    addText(settings.storePhone + '\n');
    addText('\n');

    // Meta
    addCmd(COMMANDS.ALIGN_LEFT);
    addText(`Tgl : ${new Date(tx.timestamp).toLocaleString('id-ID')}\n`);
    addText(`No  : ${tx.id}\n`);
    addSeparator();

    // Items
    tx.items.forEach(item => {
      addText(item.productName + '\n');
      const priceStr = `${item.quantity}x ${item.price.toLocaleString('id-ID')}`;
      const totalStr = (item.quantity * item.price).toLocaleString('id-ID');
      addLine(priceStr, totalStr);
    });
    
    addSeparator();

    // Totals
    addCmd(COMMANDS.BOLD_ON);
    addLine('TOTAL', `Rp ${tx.totalAmount.toLocaleString('id-ID')}`);
    addCmd(COMMANDS.BOLD_OFF);
    addLine('Tunai', `Rp ${tx.cashPaid.toLocaleString('id-ID')}`);
    addLine('Kembali', `Rp ${tx.change.toLocaleString('id-ID')}`);
    
    addText('\n');

    // Footer
    addCmd(COMMANDS.ALIGN_CENTER);
    addText(settings.footerMessage + '\n');
    addText('Terima Kasih\n');
    
    // Feed and Cut (if supported)
    addCmd(COMMANDS.FEED_LINES(3));
    // addCmd(COMMANDS.CUT_PAPER); // Many mobile printers don't support auto-cut

    return new Uint8Array(commands);
  }

  async printTransaction(tx: Transaction, settings: AppSettings, width: '58mm' | '80mm') {
    if (!this.characteristic) {
      throw new Error('Printer tidak terhubung');
    }

    const data = this.generateReceiptData(tx, settings, width);
    
    // Send in chunks (BLE has max MTU, typically 512 bytes, but safer to go lower like 100)
    const CHUNK_SIZE = 100; 
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      await this.characteristic.writeValue(chunk);
      // Small delay to prevent buffer overflow on cheap printers
      await new Promise(r => setTimeout(r, 20)); 
    }
  }
}

export const printerService = new PrinterService();