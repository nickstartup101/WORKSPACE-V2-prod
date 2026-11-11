import React, { useState, useEffect } from 'react';
import { auth } from './firebase';
import { signOut, onAuthStateChanged, User } from 'firebase/auth';
import { 
  LayoutDashboard, 
  BarChart3, 
  Receipt, 
  Truck, 
  ArrowLeftRight, 
  Settings as SettingsIcon, 
  LogOut, 
  Store, 
  Globe, 
  Moon, 
  Sun,
  ShieldCheck,
  Menu,
  X
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Import Components ຫຼັກ
import Dashboard from './components/Dashboard';
import FinanceReport from './components/FinanceReport';
import DebtLedger from './components/DebtLedger';
import Suppliers from './components/Suppliers';
import Financials from './components/Financials';
import Settings from './components/Settings';

export type TabType = 'dashboard' | 'reports' | 'debts' | 'suppliers' | 'financials' | 'settings';

export default function App() {
  const { i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('suppliers');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('ສາຂາ 1 (ດອນໜູນ)');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    if (window.confirm('ທ່ານຕ້ອງການອອກຈາກລະບົບແທ້ບໍ່?')) {
      try {
        await signOut(auth);
      } catch (err: any) {
        alert('Error: ' + err.message);
      }
    }
  };

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'la' ? 'en' : 'la';
    i18n.changeLanguage(nextLang);
  };

  const navItems = [
    {
      id: 'dashboard' as TabType,
      labelLao: 'ແດຊບອດ (Overview)',
      labelEng: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      id: 'reports' as TabType,
      labelLao: 'ບົດລາຍງານການເງິນ',
      labelEng: 'Financial Reports',
      icon: BarChart3,
    },
    {
      id: 'debts' as TabType,
      labelLao: 'ໜີ້ຕ້ອງສົ່ງ & ຮັບ (AP/AR)',
      labelEng: 'Debt Ledger',
      icon: Receipt,
    },
    {
      id: 'suppliers' as TabType,
      labelLao: 'ລະບົບຈັດຊື້ & ຜູ້ສະໜອງ',
      labelEng: 'Supplier Procurement',
      icon: Truck,
    },
    {
      id: 'financials' as TabType,
      labelLao: 'ລາຍຮັບ / ລາຍຈ່າຍ',
      labelEng: 'Cashflow & Financials',
      icon: ArrowLeftRight,
    },
    {
      id: 'settings' as TabType,
      labelLao: 'ຕັ້ງຄ່າລະບົບ',
      labelEng: 'Settings',
      icon: SettingsIcon,
    },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100/90 text-slate-800 font-sans">
      
      {/* ===================== SIDEBAR (Deep Navy #001839) ===================== */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-72 bg-[#001839] text-white flex flex-col justify-between border-r border-white/10 transition-transform duration-300 ease-in-out
        lg:static lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        
        {/* Logo & Brand Header */}
        <div>
          <div className="p-6 border-b border-white/10 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-[9px] font-serif tracking-[0.25em] text-white/60 uppercase">
                  Workspace ESTD 2026
                </span>
              </div>
              <h1 className="text-2xl font-serif tracking-wider text-white mt-1">
                La Dolce cafe
              </h1>
            </div>

            <button 
              onClick={() => setMobileMenuOpen(false)} 
              className="lg:hidden text-white/60 hover:text-white cursor-pointer"
            >
              <X strokeWidth={1.4} className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Menu Items */}
          <nav className="p-4 space-y-1.5 overflow-y-auto max-h-[calc(100vh-240px)]">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`
                    w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-medium transition-all cursor-pointer
                    ${isActive 
                      ? 'bg-white text-[#001839] shadow-md font-semibold' 
                      : 'text-white/70 hover:bg-white/5 hover:text-white'}
                  `}
                >
                  <Icon 
                    strokeWidth={1.4} 
                    className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#001839]' : 'text-white/60'}`} 
                  />
                  <div className="flex flex-col text-left leading-tight">
                    <span className="text-[12px]">{item.labelLao}</span>
                    <span className={`text-[9px] font-serif uppercase tracking-wider ${isActive ? 'text-[#001839]/60' : 'text-white/40'}`}>
                      {item.labelEng}
                    </span>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Profile & Logout Area (Bottom Sidebar) */}
        <div className="p-4 border-t border-white/10 bg-[#00132e]/60 space-y-3">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-2xl bg-orange-500 text-white font-serif text-lg font-bold flex items-center justify-center shrink-0 shadow-sm border border-orange-400/30">
              T
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-medium text-white truncate">
                {currentUser?.displayName || 'Tonick bouddasien'}
              </p>
              <span className="inline-flex items-center gap-1 text-[9px] font-serif tracking-widest text-emerald-400 uppercase mt-0.5">
                <ShieldCheck strokeWidth={1.4} className="w-3 h-3 text-emerald-400" />
                ADMINISTRATOR
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-white/5 text-xs font-serif uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <LogOut strokeWidth={1.4} className="w-4 h-4" />
            <span>ອອກຈາກລະບົບ (Logout)</span>
          </button>
        </div>

      </aside>

      {/* ===================== MAIN CONTENT WRAPPER ===================== */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between shrink-0 shadow-xs z-30">
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              <Menu strokeWidth={1.4} className="w-5 h-5" />
            </button>

            {/* Branch Selector */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-[#001839]">
              <Store strokeWidth={1.4} className="w-3.5 h-3.5 text-[#001839]" />
              <select 
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="bg-transparent font-medium cursor-pointer focus:outline-none"
              >
                <option value="ສາຂາ 1 (ດອນໜູນ)">ສາຂາ 1 (ດອນໜູນ)</option>
                <option value="ສາຂາ 2 (ໂພນຕ້ອງ)">ສາຂາ 2 (ໂພນຕ້ອງ)</option>
              </select>
            </div>
          </div>

          {/* Quick Actions (Language, Theme, Date) */}
          <div className="flex items-center gap-2.5">
            
            {/* ປຸ່ມປ່ຽນພາສາ */}
            <button
              onClick={toggleLanguage}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-serif uppercase tracking-wider text-[#001839] flex items-center gap-1.5 transition cursor-pointer"
              title="ປ່ຽນພາສາ (Switch Language)"
            >
              <Globe strokeWidth={1.4} className="w-3.5 h-3.5" />
              <span>{i18n.language === 'la' ? 'LA' : 'EN'}</span>
            </button>

            {/* ປຸ່ມ Dark/Light Mode Switcher */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[#001839] transition cursor-pointer"
              title="Toggle Theme"
            >
              {isDarkMode ? (
                <Sun strokeWidth={1.4} className="w-4 h-4 text-amber-500" />
              ) : (
                <Moon strokeWidth={1.4} className="w-4 h-4 text-[#001839]" />
              )}
            </button>

          </div>
        </header>

        {/* Dynamic Page Component Render */}
        <main className="flex-1 overflow-y-auto">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'reports' && <FinanceReport />}
          {activeTab === 'debts' && <DebtLedger />}
          {activeTab === 'suppliers' && <Suppliers />}
          {activeTab === 'financials' && <Financials />}
          {activeTab === 'settings' && <Settings />}
        </main>

      </div>

    </div>
  );
}
