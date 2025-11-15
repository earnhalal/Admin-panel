import React from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };
  
  const pageNumbers = [];
  // Logic to show a limited number of page buttons
  const maxPagesToShow = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
  let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

  if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i);
  }


  return (
    <div className="px-5 py-5 bg-white dark:bg-slate-900 border-t flex flex-col xs:flex-row items-center xs:justify-between">
      <span className="text-xs xs:text-sm text-gray-900 dark:text-gray-300">
        Page {currentPage} of {totalPages}
      </span>
      <div className="inline-flex mt-2 xs:mt-0">
        <button
          onClick={handlePrevious}
          disabled={currentPage === 1}
          className="text-sm bg-gray-200 dark:bg-slate-800 hover:bg-gray-300 dark:hover:bg-slate-700 text-gray-800 dark:text-gray-200 font-semibold py-2 px-4 rounded-l disabled:opacity-50"
        >
          Prev
        </button>
        {startPage > 1 && (
            <span className="text-sm bg-gray-200 dark:bg-slate-800 text-gray-800 dark:text-gray-200 font-semibold py-2 px-4">...</span>
        )}
        {pageNumbers.map(number => (
            <button
                key={number}
                onClick={() => onPageChange(number)}
                className={`text-sm font-semibold py-2 px-4 ${currentPage === number ? 'bg-indigo-500 text-white' : 'bg-gray-200 dark:bg-slate-800 hover:bg-gray-300 dark:hover:bg-slate-700 text-gray-800 dark:text-gray-200'}`}
            >
                {number}
            </button>
        ))}
         {endPage < totalPages && (
            <span className="text-sm bg-gray-200 dark:bg-slate-800 text-gray-800 dark:text-gray-200 font-semibold py-2 px-4">...</span>
        )}
        <button
          onClick={handleNext}
          disabled={currentPage === totalPages}
          className="text-sm bg-gray-200 dark:bg-slate-800 hover:bg-gray-300 dark:hover:bg-slate-700 text-gray-800 dark:text-gray-200 font-semibold py-2 px-4 rounded-r disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default Pagination;
