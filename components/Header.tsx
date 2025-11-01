import React from 'react';
import { useLocation } from 'react-router-dom';
import { MenuIcon } from './icons/MenuIcon';

interface HeaderProps {
    onMenuClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
    const location = useLocation();
    
    const getPageTitle = (pathname: string) => {
        const name = pathname.split('/').pop() || 'dashboard';
        if (name === 'dashboard') return 'Dashboard';
        return name.charAt(0).toUpperCase() + name.slice(1);
    };

    const title = getPageTitle(location.pathname);

    return (
        <header className="md:hidden bg-white dark:bg-gray-800 shadow-md p-4 flex items-center sticky top-0 z-20">
            <button onClick={onMenuClick} className="text-gray-600 dark:text-gray-300 mr-4 p-1" aria-label="Open menu">
                <MenuIcon className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-semibold text-gray-800 dark:text-white">{title}</h1>
        </header>
    );
};

export default Header;
