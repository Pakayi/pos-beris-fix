import React, { useEffect, useState } from "react";

// --- Card ---
export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => <div className={`bg-white rounded-xl border border-gray-100 shadow-sm ${className}`}>{children}</div>;

// --- Button ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  icon?: string;
}
export const Button: React.FC<ButtonProps> = ({ children, variant = "primary", size = "md", icon, className = "", ...props }) => {
  const base = "inline-flex items-center justify-center font-medium transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-1";

  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
    secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-300",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 focus:ring-red-500",
    ghost: "text-gray-600 hover:bg-gray-50 focus:ring-gray-200",
    outline: "border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-200",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {icon && <i className={`${icon} ${children ? "mr-2" : ""}`}></i>}
      {children}
    </button>
  );
};

// --- Input ---
// FIX: Use Omit to avoid conflict with standard 'prefix' property which expects a string
interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  label?: string;
  error?: string;
  prefix?: React.ReactNode;
}
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ label, error, prefix, className = "", ...props }, ref) => (
  <div className="w-full">
    {label && <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>}
    <div className="relative">
      {prefix && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">{prefix}</div>}
      <input
        ref={ref}
        className={`w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all ${prefix ? "pl-9" : ""} ${
          error ? "border-red-300" : ""
        } ${className}`}
        {...props}
      />
    </div>
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
));

// --- Currency Input (Khusus Angka Ribuan) ---
interface CurrencyInputProps extends Omit<InputProps, "onChange" | "value"> {
  value: number;
  onChange: (val: number) => void;
}
export const CurrencyInput: React.FC<CurrencyInputProps> = ({ value, onChange, label, ...props }) => {
  const [displayValue, setDisplayValue] = useState("");

  // Sinkronisasi display saat value dari luar berubah
  useEffect(() => {
    const formatted = value ? value.toLocaleString("id-ID") : "";
    setDisplayValue(formatted);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\./g, ""); // Hapus semua titik
    if (rawValue === "" || /^\d+$/.test(rawValue)) {
      const numValue = rawValue === "" ? 0 : parseInt(rawValue);
      setDisplayValue(numValue ? numValue.toLocaleString("id-ID") : "");
      onChange(numValue);
    }
  };

  return <Input {...props} label={label} prefix="Rp" value={displayValue} onChange={handleChange} inputMode="numeric" placeholder="0" />;
};

// --- Modal ---
export const Modal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ isOpen, onClose, title, children, footer }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-bold text-lg text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>
        <div className="p-6 max-h-[75vh] overflow-y-auto no-scrollbar">{children}</div>
        {footer && <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
};

// --- Badge ---
export const Badge: React.FC<{ children: React.ReactNode; color?: "blue" | "green" | "red" | "yellow" }> = ({ children, color = "blue" }) => {
  const colors = {
    blue: "bg-blue-100 text-blue-700",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    yellow: "bg-amber-100 text-amber-700",
  };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[color]}`}>{children}</span>;
};

// --- Toast ---
export const Toast: React.FC<{
  message: string;
  type?: "success" | "error" | "warning" | "info";
  isOpen: boolean;
  onClose: () => void;
  action?: { label: string; onClick: () => void };
}> = ({ message, type = "info", isOpen, onClose, action }) => {
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(onClose, 5000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const styles = {
    success: "bg-green-50 border-green-200 text-green-800",
    error: "bg-red-50 border-red-200 text-red-800",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
    info: "bg-blue-50 border-blue-200 text-blue-800",
  };

  const icons = {
    success: "fa-circle-check",
    error: "fa-circle-xmark",
    warning: "fa-triangle-exclamation",
    info: "fa-circle-info",
  };

  return (
    <div className={`fixed top-4 right-4 z-50 flex items-start gap-3 p-4 rounded-xl border shadow-lg max-w-sm w-full animate-in slide-in-from-right duration-300 ${styles[type]}`}>
      <div className="mt-0.5 text-lg">
        <i className={`fa-solid ${icons[type]}`}></i>
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{message}</p>
        {action && (
          <button onClick={action.onClick} className="mt-2 text-xs font-bold hover:underline focus:outline-none">
            {action.label}
          </button>
        )}
      </div>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
        <i className="fa-solid fa-xmark"></i>
      </button>
    </div>
  );
};

// --- Offline Indicator Component ---
export const OfflineIndicator: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-800 text-white text-xs py-1 px-3 text-center z-50 animate-pulse">
      <i className="fa-solid fa-wifi-slash mr-2"></i> Mode Offline - Data tersimpan di perangkat
    </div>
  );
};
