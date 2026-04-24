'use client';

import { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const bgColors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500',
  };

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  return (
    <div
      className={`fixed top-4 right-4 z-[110] max-w-[calc(100vw-2rem)] ${bgColors[type]} text-white px-4 sm:px-6 py-3 sm:py-4 rounded-lg shadow-lg flex items-center gap-3 min-w-0 sm:min-w-[280px] sm:max-w-md animate-slide-in`}
    >
      <span className="text-xl font-bold">{icons[type]}</span>
      <p className="flex-1">{message}</p>
      <button
        onClick={onClose}
        className="text-white hover:text-gray-200 text-xl font-bold"
      >
        ×
      </button>
    </div>
  );
}
