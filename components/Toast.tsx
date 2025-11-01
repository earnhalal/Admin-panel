import React from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
}

const toastStyles = {
  success: {
    bg: 'bg-green-100 dark:bg-green-900',
    border: 'border-green-400 dark:border-green-600',
    text: 'text-green-700 dark:text-green-200',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    ),
  },
  error: {
    bg: 'bg-red-100 dark:bg-red-900',
    border: 'border-red-400 dark:border-red-600',
    text: 'text-red-700 dark:text-red-200',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    ),
  },
  warning: {
    bg: 'bg-yellow-100 dark:bg-yellow-900',
    border: 'border-yellow-400 dark:border-yellow-600',
    text: 'text-yellow-700 dark:text-yellow-200',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" >
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.22 3.006-1.742 3.006H4.42c-1.522 0-2.492-1.672-1.742-3.006l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
      </svg>
    ),
  },
  info: {
     bg: 'bg-blue-100 dark:bg-blue-900',
    border: 'border-blue-400 dark:border-blue-600',
    text: 'text-blue-700 dark:text-blue-200',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
    ),
  }
};

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  const styles = toastStyles[type];

  return (
    <div className={`flex items-center p-4 rounded-lg shadow-lg border-l-4 ${styles.bg} ${styles.border} animate-fade-in-right`}>
      <div className={`${styles.text} mr-3`}>
        {styles.icon}
      </div>
      <p className={`flex-1 text-sm font-medium ${styles.text}`}>
        {message}
      </p>
      <button onClick={onClose} className={`ml-4 -mr-2 -my-2 p-1.5 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${styles.text} opacity-70 hover:opacity-100`}>
        <span className="sr-only">Dismiss</span>
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
       <style>{`
        @keyframes fade-in-right {
            0% {
                opacity: 0;
                transform: translateX(100%);
            }
            100% {
                opacity: 1;
                transform: translateX(0);
            }
        }
        .animate-fade-in-right {
            animation: fade-in-right 0.5s ease-out forwards;
        }
    `}</style>
    </div>
  );
};

export default Toast;