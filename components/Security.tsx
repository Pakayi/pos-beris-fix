import React, { useState, useEffect } from 'react';
import { db } from '../services/db';

interface PinPadProps {
  onComplete: (pin: string) => void;
  onCancel?: () => void;
  title?: string;
  subtitle?: string;
  error?: string;
  length?: number;
}

export const PinPad: React.FC<PinPadProps> = ({ 
  onComplete, 
  onCancel, 
  title = "Masukkan PIN", 
  subtitle = "Akses dilindungi", 
  error,
  length = 6 
}) => {
  const [pin, setPin] = useState('');
  
  const handleNum = (num: number) => {
    if (pin.length < length) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin.length === length) {
        // Small delay for visual feedback
        setTimeout(() => onComplete(newPin), 100);
      }
    }
  };

  const handleClear = () => {
    setPin('');
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl w-full max-w-sm mx-auto">
      <div className="text-center mb-6">
        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-600 text-xl">
           <i className="fa-solid fa-lock"></i>
        </div>
        <h3 className="text-xl font-bold text-gray-800">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>

      {/* Dots Display */}
      <div className="flex justify-center gap-3 mb-8">
        {[...Array(length)].map((_, i) => (
          <div 
            key={i} 
            className={`w-4 h-4 rounded-full transition-all ${
              i < pin.length 
                ? 'bg-blue-600 scale-110' 
                : 'bg-gray-200 border border-gray-300'
            }`}
          />
        ))}
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-500 bg-red-50 px-3 py-1 rounded-full animate-bounce">
          {error}
        </div>
      )}

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-4 w-full">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            onClick={() => handleNum(num)}
            className="h-14 rounded-xl bg-gray-50 hover:bg-gray-100 border-b-2 border-gray-200 active:border-b-0 active:translate-y-[2px] text-xl font-semibold text-gray-700 transition-all focus:outline-none"
          >
            {num}
          </button>
        ))}
        
        <button
          onClick={handleClear}
          className="h-14 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors focus:outline-none"
        >
          CLEAR
        </button>
        
        <button
          onClick={() => handleNum(0)}
          className="h-14 rounded-xl bg-gray-50 hover:bg-gray-100 border-b-2 border-gray-200 active:border-b-0 active:translate-y-[2px] text-xl font-semibold text-gray-700 transition-all focus:outline-none"
        >
          0
        </button>

        <button
          onClick={handleBackspace}
          className="h-14 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors focus:outline-none"
        >
          <i className="fa-solid fa-delete-left text-xl"></i>
        </button>
      </div>

      {onCancel && (
         <button onClick={onCancel} className="mt-6 text-sm text-gray-400 hover:text-gray-600">
           Batalkan
         </button>
      )}
    </div>
  );
};

export const PinGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [hasPinSetup, setHasPinSetup] = useState(false);
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    checkLockStatus();
  }, []);

  const checkLockStatus = () => {
    const settings = db.getSettings();
    const pin = settings.securityPin;
    const sessionUnlocked = sessionStorage.getItem('warung_pin_unlocked') === 'true';

    if (!pin) {
      setHasPinSetup(false);
      setIsUnlocked(true);
    } else {
      setHasPinSetup(true);
      if (sessionUnlocked) {
        setIsUnlocked(true);
      } else {
        setIsUnlocked(false);
      }
    }
  };

  const handleVerify = (inputPin: string) => {
    const settings = db.getSettings();
    if (inputPin === settings.securityPin) {
      sessionStorage.setItem('warung_pin_unlocked', 'true');
      setIsUnlocked(true);
      setPinError('');
    } else {
      setPinError('PIN Salah, coba lagi');
      setTimeout(() => setPinError(''), 2000);
    }
  };

  if (!hasPinSetup || isUnlocked) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-100/90 backdrop-blur-md">
      <div className="shadow-2xl rounded-2xl overflow-hidden">
        <PinPad 
          onComplete={handleVerify} 
          error={pinError}
          subtitle="Masukkan PIN untuk mengakses halaman ini"
        />
      </div>
    </div>
  );
};