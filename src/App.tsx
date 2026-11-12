import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { signOut, onAuthStateChanged, signInWithEmailAndPassword, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
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
  X,
  Lock,
  Mail,
  KeyRound,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import Dashboard from './components/Dashboard';
import FinanceReport from './components/FinanceReport';
import DebtLedger from './components/DebtLedger';
import Suppliers from './components/Suppliers';
import Financials from './components/Financials';
import Settings from './components/Settings';

export type TabType = 'dashboard' | 'reports' | 'debts' | 'suppliers' | 'financials' | 'settings';

export default function App() {
  const { i18n } = useTranslation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [userRole, setUserRole] = useState<'admin' | 'manager' | 'staff'>('admin');
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  
  // Login Form States (ສຳລັບເຂົ້າສູ່ລະບົບຢ່າງປອດໄພ)
  const [loginEmail, setLoginEmail] = useState<string>('tonickbouddasien@gmail.com');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [loginLoading, setLoginLoading] = useState<boolean>(false);

  // Multi-Branch State
  const [selectedBranch, setSelectedBranch] = useState<string>('branch_1');
  const [branches, setBranches] = useState<any[]>([
    { id: 'branch_1', name: 'ສາຂາ 1 (ດອນໜູນ)' },
    { id: 'branch_2', name: 'ສາຂາ 2 (ໂພນຕ້ອງ)' }
  ]);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // 1. ກວດສອບ Session Login
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user?.email) {
        try {
          const permSnap = await getDoc(doc(db, 'settings', 'user_permissions'));
          if (permSnap.exists() && Array.isArray(permSnap.data()?.users)) {
            const matched = permSnap.data().users.find((u: any) => u.email === user.email.toLowerCase());
            if (matched) {
              setUserRole(matched.role);
              if (matched.role === 'staff') setActiveTab('financials');
            }
          }
        } catch (err) {}
      }
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. ດຶງສາຂາຈາກ Firestore
  useEffect(() => {
    const unsubBranch = onSnapshot(doc(db, 'settings', 'branch_list'), (snap) => {
      if (snap.exists() && Array.isArray(snap.data()?.branches)) {
        setBranches(snap.data().branches);
      }
    });
    return () => unsubBranch();
  }, []);

  // 3. ຟັງຊັນ Login ເຂົ້າສູ່ລະບົບ
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError('ກະລຸນາປ້ອນອີເມວ ແລະ ລະຫັດຜ່ານ');
      return;
    }

    try {
      setLoginLoading(true);
      setLoginError('');
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword.trim());
      // ເມື່ອ Login ສຳເລັດ onAuthStateChanged ຈະປົດລັອກໜ້າແອັບທັນທີ
    } catch (err: any) {
      setLoginError('ອີເມວ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ! (' + err.message + ')');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('ທ່ານຕ້ອງການອອກຈາກລະບົບແທ້ບໍ່?')) {
      try { await signOut(auth); } catch (err: any) { alert('Error: ' + err.message); }
    }
  };

  const dynamicApprovalPin = localStorage.getItem('approval_pin') || localStorage.getItem('admin_master_pin') || '1234';

  const currentLang = (i18n.language && i18n.language.startsWith('en')) ? 'en' : 'la';
  const toggleLanguage = () => {
    const nextLang = currentLang === 'la' ? 'en' : 'la';
    i18n.changeLanguage(nextLang);
    localStorage.setItem('i18nextLng', nextLang);
  };

  const allNavItems = [
    { id: 'dashboard' as TabType, labelLao: 'ແດຊບອດ (Overview)', labelEng: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'manager'] },
    { id: 'reports' as TabType, labelLao: 'ບົດລາຍງານການເງິນ', labelEng: 'Financial Reports', icon: BarChart3, roles: ['admin'] },
    { id: 'debts' as TabType, labelLao: 'ໜີ້ຕ້ອງສົ່ງ & ຮັບ (AP/AR)', labelEng: 'Debt Ledger', icon: Receipt, roles: ['admin', 'manager'] },
    { id: 'suppliers' as TabType, labelLao: 'ລະບົບຈັດຊື້ & ຜູ້ສະໜອງ', labelEng: 'Supplier Procurement', icon: Truck, roles: ['admin', 'manager', 'staff'] },
    { id: 'financials' as TabType, labelLao: 'ລາຍຮັບ / ລາຍຈ່າຍ', labelEng: 'Cashflow & Financials', icon: ArrowLeftRight, roles: ['admin', 'manager', 'staff'] },
    { id: 'settings' as TabType, labelLao: 'ຕັ້ງຄ່າລະບົບ', labelEng: 'Settings', icon: SettingsIcon, roles: ['admin'] },
  ];

  const allowedNavItems = allNavItems.filter(item => item.roles.includes(userRole));

  // =========================================================================
  // 🌟 ໜ້າຈໍ LUXURY EDITORIAL SIGN-IN (ສະແດງເມື່ອຍັງບໍ່ທັນໄດ້ Login)
  // =========================================================================
  if (!authChecking && !currentUser) {
    return (
      <div className="min-h-screen w-screen bg-[#001839] flex items-center justify-center p-4 font-sans text-white relative overflow-hidden">
        
        {/* Background Decorative Rings */}
        <div className="absolute w-[500px] h-[500px] rounded-full border border-white/5 -top-20 -right-20 pointer-events-none" />
        <div className="absolute w-[350px] h-[350px] rounded-full border border-white/5 -bottom-10 -left-10 pointer-events-none" />

        <div className="w-full max-w-md bg-white rounded-3xl p-8 text-slate-800 shadow-2xl space-y-6 relative z-10 border border-slate-200">
          
          {/* Brand Header */}
          <div className="text-center space-y-1">
            <span className="text-[9.5px] font-serif uppercase tracking-[0.25em] text-[#001839]/60 block">
              Workspace ESTD 2026
            </span>
            <h1 className="text-3xl font-serif tracking-wider text-[#001839]">
              La Dolce cafe
            </h1>
            <p className="text-xs text-slate-400 font-sans pt-1">
              ກະລຸນາເຂົ້າສູ່ລະບົບເພື່ອປົດລັອກຖານຂໍ້ມູນຮ້ານ
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-serif uppercase tracking-wider text-[#001839] font-bold block">
                Email Address
              </label>
              <div className="relative">
                <input 
                  type="email"
                  required
                  placeholder="name@gmail.com"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  className="w-full h-11 pl-10 pr-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-sans text-[#001839] outline-none focus:border-[#001839] transition"
                />
                <Mail strokeWidth={1.4} className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-serif uppercase tracking-wider text-[#001839] font-bold block">
                Password
              </label>
              <div className="relative">
                <input 
                  type="password"
                  required
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  className="w-full h-11 pl-10 pr-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-sans text-[#001839] outline-none focus:border-[#001839] transition"
                />
                <KeyRound strokeWidth={1.4} className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
              </div>
            </div>

            {loginError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 text-rose-700 text-xs font-sans">
                <AlertCircle strokeWidth={1.4} className="w-4 h-4 shrink-0 text-rose-600" />
                <span className="leading-tight">{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full h-12 bg-[#001839] hover:bg-[#00285d] text-white rounded-2xl text-xs font-serif uppercase tracking-widest transition shadow-md flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:opacity-50"
            >
              <span>{loginLoading ? 'Authenticating...' : 'Sign In To Workspace'}</span>
              <ArrowRight strokeWidth={1.4} className="w-4 h-4" />
            </button>
          </form>

          {/* Security Assurance Footer */}
          <div className="pt-2 border-t border-slate-100 text-center">
            <span className="inline-flex items-center gap-1.5 text-[9.5px] font-serif uppercase tracking-wider text-slate-400">
              <ShieldCheck strokeWidth={1.4} className="w-3.5 h-3.5 text-emerald-600" />
              End-to-End Encrypted Cloud Database
            </span>
          </div>

        </div>
      </div>
    );
  }

  // =========================================================================
  // 🌟 MAIN WORKSPACE INTERFACE (ສະແດງເມື່ອ Login ສຳເລັດແລ້ວ)
  // =========================================================================
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100/90 text-slate-800 font-sans">
      
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-[235px] bg-[#001839] text-white flex flex-col justify-between border-r border-white/10 transition-transform duration-300 ease-in-out shrink-0
        lg:static lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div>
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[8.5px] font-serif tracking-[0.2em] text-white/60 uppercase">
                  Workspace ESTD 2026
                </span>
              </div>
              <h1 className="text-xl font-serif tracking-wider text-white mt-0.5">
                La Dolce cafe
              </h1>
            </div>

            <button onClick={() => setMobileMenuOpen(false)} className="lg:hidden text-white/60 hover:text-white cursor-pointer">
              <X strokeWidth={1.4} className="w-4 h-4" />
            </button>
          </div>

          <nav className="p-2.5 space-y-1 overflow-y-auto max-h-[calc(100vh-210px)]">
            {allowedNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer
                    ${isActive ? 'bg-white text-[#001839] shadow-sm font-semibold' : 'text-white/70 hover:bg-white/5 hover:text-white'}
                  `}
                >
                  <Icon strokeWidth={1.4} className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#001839]' : 'text-white/60'}`} />
                  <div className="flex flex-col text-left leading-tight overflow-hidden">
                    <span className="text-[11.5px] truncate">{item.labelLao}</span>
                    <span className={`text-[8.5px] font-serif uppercase tracking-wider truncate ${isActive ? 'text-[#001839]/60' : 'text-white/40'}`}>
                      {item.labelEng}
                    </span>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Footer ສະແດງບັນຊີເຈົ້າຂອງຮ້ານ */}
        <div className="p-3 border-t border-white/10 bg-[#00132e]/60 space-y-2.5">
          <div className="flex items-center gap-2.5 px-1.5">
            <div className="w-8 h-8 rounded-xl bg-orange-500 text-white font-serif text-sm font-bold flex items-center justify-center shrink-0 border border-orange-400/30">
              {currentUser?.displayName ? currentUser.displayName.slice(0, 1).toUpperCase() : 'T'}
            </div>
            <div className="overflow-hidden">
              <p className="text-[11px] font-medium text-white truncate">
                {currentUser?.displayName || currentUser?.email || 'Tonick bouddasien'}
              </p>
              <span className={`inline-flex items-center gap-1 text-[8px] font-serif tracking-widest uppercase ${
                userRole === 'admin' ? 'text-rose-400' : 'text-emerald-400'
              }`}>
                <ShieldCheck strokeWidth={1.4} className="w-2.5 h-2.5" />
                {userRole.toUpperCase()}
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full py-2 px-2.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-white/5 text-[10px] font-serif uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <LogOut strokeWidth={1.4} className="w-3.5 h-3.5" />
            <span>ອອກຈາກລະບົບ (LOGOUT)</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        
        {/* Top Header */}
        <header className="h-14 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between shrink-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileMenuOpen(true)} className="lg:hidden p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">
              <Menu strokeWidth={1.4} className="w-5 h-5" />
            </button>

            {/* Branch Selector */}
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs text-[#001839]">
              <Store strokeWidth={1.4} className="w-3.5 h-3.5 text-[#001839]" />
              <select 
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="bg-transparent font-medium cursor-pointer focus:outline-none"
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
                <option value="all">🌐 ທຸກສາຂາ (All Branches)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleLanguage}
              className="px-3 py-1 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-serif uppercase tracking-wider text-[#001839] flex items-center gap-1.5 cursor-pointer transition shadow-xs"
            >
              <Globe strokeWidth={1.4} className="w-3.5 h-3.5" />
              <span>{currentLang === 'la' ? 'LA' : 'EN'}</span>
            </button>

            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[#001839] cursor-pointer"
            >
              {isDarkMode ? <Sun strokeWidth={1.4} className="w-4 h-4 text-amber-500" /> : <Moon strokeWidth={1.4} className="w-4 h-4 text-[#001839]" />}
            </button>
          </div>
        </header>

        {/* Child Components Render */}
        <main className="flex-1 overflow-y-auto">
          {activeTab === 'dashboard' && <Dashboard selectedBranch={selectedBranch} />}
          {activeTab === 'reports' && <FinanceReport selectedBranch={selectedBranch} />}
          {activeTab === 'debts' && <DebtLedger />}
          {activeTab === 'suppliers' && <Suppliers selectedBranch={selectedBranch} />}
          {activeTab === 'financials' && (
            <Financials 
              appConfig={{ masterApprovalPin: dynamicApprovalPin }} 
              selectedBranch={selectedBranch} 
            />
          )}
          {activeTab === 'settings' && <Settings />}
        </main>

      </div>

    </div>
  );
}
