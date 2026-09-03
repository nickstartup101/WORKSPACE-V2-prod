import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { 
  TrendingUp, BrainCircuit, Loader2, Package, Sparkles, 
  Wallet, CreditCard, Building2, Calendar, Filter, 
  Percent, ArrowUpRight, ArrowDownRight, ChevronRight, X, Search
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format, subDays, subMonths } from 'date-fns';
import { User } from 'firebase/auth';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';

interface DashboardProps {
  userSettings: any;
  user?: User | null;
  selectedBranch?: string;
}

const toStandardDate = (raw: any): string => {
  if (!raw) return '';
  if (typeof raw === 'string') {
    const clean = raw.trim().split('T')[0];
    if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts.length === 3) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    return clean;
  }
  if (raw && typeof raw.toDate === 'function') {
    try { return format(raw.toDate(), 'yyyy-MM-dd'); } catch { return ''; }
  }
  return '';
};

const parseAmount = (val: any): number => {
  if (!val) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const clean = String(val).replace(/[^0-9.-]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
};

export default function Dashboard({ userSettings, user, selectedBranch }: DashboardProps) {
  const { t, i18n } = useTranslation();

  const [timeframeMode, setTimeframeMode] = useState<'all' | 'month' | 'last_month' | 'today'>('all');
  const [selectedMonthStr, setSelectedMonthStr] = useState<string>(() => format(new Date(), 'yyyy-MM'));

  const [fsProducts, setFsProducts] = useState<any[]>([]);
  const [fsSupplierPrices, setFsSupplierPrices] = useState<any[]>([]);
  const [fsTransactions, setFsTransactions] = useState<any[]>([]);
  const [fsLoading, setFsLoading] = useState(true);

  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 📡 Real-time Firestore Subscriptions
  useEffect(() => {
    setFsLoading(true);
    const branch = selectedBranch || 'branch_1';

    const unsubP = onSnapshot(collection(db, 'products'), (snap) => {
      setFsProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubS = onSnapshot(collection(db, 'supplierPrices'), (snap) => {
      setFsSupplierPrices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubT = onSnapshot(collection(db, 'transactions'), (snap) => {
      const all = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Match active branch or include transactions with no branch set
      setFsTransactions(all.filter((tx: any) => !tx.branchId || tx.branchId === branch || tx.branchId === 'main'));
      setFsLoading(false);
    });

    return () => {
      unsubP();
      unsubS();
      unsubT();
    };
  }, [selectedBranch]);

  const normalizePayment = (src?: string): 'Cash' | 'Onepay' | 'LDB' => {
    if (!src) return 'Cash';
    const s = String(src).toLowerCase();
    if (s.includes('ldb')) return 'LDB';
    if (s.includes('onepay') || s.includes('online') || s.includes('bank') || s.includes('transfer')) return 'Onepay';
    return 'Cash';
  };

  // ================= 📊 DYNAMIC FINANCIAL KPIS =================
  const financialOverview = useMemo(() => {
    const now = new Date();
    const currentMonthPrefix = format(now, 'yyyy-MM');
    const lastMonthPrefix = format(subMonths(now, 1), 'yyyy-MM');
    const todayPrefix = format(now, 'yyyy-MM-dd');

    const matchTimeframe = (dateVal: any) => {
      if (timeframeMode === 'all') return true;
      const dStr = toStandardDate(dateVal);
      if (!dStr) return false;

      if (timeframeMode === 'today') return dStr === todayPrefix;
      if (timeframeMode === 'last_month') return dStr.startsWith(lastMonthPrefix);
      if (timeframeMode === 'month') return dStr.startsWith(currentMonthPrefix);
      return true;
    };

    let totalRevenue = 0;
    let totalPurchasing = 0;
    let totalOPEX = 0;

    let cashIncome = 0, cashExpense = 0;
    let onepayIncome = 0, onepayExpense = 0;
    let ldbIncome = 0, ldbExpense = 0;

    const importedSupplierPriceIds = new Set<string>();
    fsTransactions.forEach(tx => {
      if (Array.isArray(tx.supplierPriceIds)) {
        tx.supplierPriceIds.forEach((id: string) => importedSupplierPriceIds.add(id));
      }
    });

    const filteredTxList = fsTransactions.filter(tx => matchTimeframe(tx.date || tx.createdAt));

    filteredTxList.forEach(tx => {
      const amt = parseAmount(tx.amount);
      const ch = normalizePayment(tx.source);
      const isIncome = tx.type === 'income' || String(tx.category || '').toLowerCase() === 'sales';

      if (isIncome) {
        totalRevenue += amt;
        if (ch === 'Cash') cashIncome += amt;
        else if (ch === 'Onepay') onepayIncome += amt;
        else if (ch === 'LDB') ldbIncome += amt;
      } else {
        const cat = String(tx.category || '').toLowerCase();
        const isPurchasing = cat.includes('purchas') || cat.includes('supply') || cat.includes('ຊື້');

        if (isPurchasing) totalPurchasing += amt;
        else totalOPEX += amt;

        if (ch === 'Cash') cashExpense += amt;
        else if (ch === 'Onepay') onepayExpense += amt;
        else if (ch === 'LDB') ldbExpense += amt;
      }
    });

    // Add direct unimported supplier purchases
    fsSupplierPrices.forEach(sp => {
      const dStr = toStandardDate(sp.date || sp.createdAt);
      if (!dStr || importedSupplierPriceIds.has(sp.id)) return;

      if (matchTimeframe(dStr)) {
        const amt = sp.totalPriceLAK !== undefined
          ? parseAmount(sp.totalPriceLAK)
          : (sp.currency === 'LAK' ? parseAmount(sp.priceOriginal) : parseAmount(sp.priceOriginal) * parseAmount(sp.exchangeRate || 1)) * (parseAmount(sp.quantity) || 1);

        totalPurchasing += amt;
        const ch = normalizePayment(sp.paymentMethod);
        if (ch === 'Cash') cashExpense += amt;
        else if (ch === 'Onepay') onepayExpense += amt;
        else if (ch === 'LDB') ldbExpense += amt;
      }
    });

    const totalExpenses = totalPurchasing + totalOPEX;
    const grossProfit = totalRevenue - totalPurchasing;
    const grossMarginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const netProfit = totalRevenue - totalExpenses;
    const estimatedROI = totalExpenses > 0 ? (netProfit / totalExpenses) * 100 : 0;

    const cashNet = cashIncome - cashExpense;
    const onepayNet = onepayIncome - onepayExpense;
    const ldbNet = ldbIncome - ldbExpense;
    const totalNetLiquidity = cashNet + onepayNet + ldbNet;

    // 7-Day Trend
    const last7Days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i));
    const trends7Days = last7Days.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayTxs = fsTransactions.filter(tx => toStandardDate(tx.date || tx.createdAt) === dateStr);

      let income = 0;
      let expense = 0;
      dayTxs.forEach(tx => {
        const amt = parseAmount(tx.amount);
        if (tx.type === 'income' || String(tx.category || '').toLowerCase() === 'sales') income += amt;
        else expense += amt;
      });

      return {
        date: format(date, 'dd/MM'),
        income,
        expense
      };
    });

    return {
      totalRevenue,
      totalPurchasing,
      totalOPEX,
      totalExpenses,
      grossProfit,
      grossMarginPercent,
      netProfit,
      estimatedROI,
      cashNet,
      onepayNet,
      ldbNet,
      totalNetLiquidity,
      trends7Days,
      transactionCount: filteredTxList.length
    };
  }, [fsTransactions, fsSupplierPrices, timeframeMode]);

  return (
    <div className="space-y-6">

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white dark:bg-[#073069] rounded-[2rem] border border-slate-200/80 dark:border-white/10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 text-primary rounded-2xl">
            <BrainCircuit className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white">
                {i18n.language === 'la' ? 'ພາບລວມລະບົບ (Executive Dashboard)' : 'Executive Dashboard'}
              </h2>
              <span className="text-[8.5px] font-black uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">
                {(selectedBranch || 'branch_1') === 'branch_1' ? 'ສາຂາ 1' : 'ສາຂາ 2'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
              Live Real-Time Data Connected
            </p>
          </div>
        </div>

        {/* Timeframe Presets */}
        <div className="flex bg-slate-100 dark:bg-black/25 p-1 rounded-2xl border border-slate-200 dark:border-white/10">
          <button
            type="button"
            onClick={() => setTimeframeMode('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              timeframeMode === 'all' ? 'bg-[#052659] text-white shadow-md' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            ທັງໝົດ (All-Time)
          </button>
          <button
            type="button"
            onClick={() => setTimeframeMode('month')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              timeframeMode === 'month' ? 'bg-[#052659] text-white shadow-md' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            ເດືອນນີ້
          </button>
          <button
            type="button"
            onClick={() => setTimeframeMode('last_month')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              timeframeMode === 'last_month' ? 'bg-[#052659] text-white shadow-md' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            ເດືອນກ່ອນ
          </button>
        </div>
      </div>

      {/* Financial KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm space-y-1">
          <span className="text-[9.5px] font-black uppercase text-slate-400 flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
            Total Revenue
          </span>
          <p className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400">
            {Math.round(financialOverview.totalRevenue).toLocaleString()} ₭
          </p>
        </div>

        <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm space-y-1">
          <span className="text-[9.5px] font-black uppercase text-slate-400 flex items-center gap-1">
            <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" />
            Purchasing (COGS)
          </span>
          <p className="text-xl font-black font-mono text-rose-500 dark:text-rose-400">
            {Math.round(financialOverview.totalPurchasing).toLocaleString()} ₭
          </p>
        </div>

        <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm space-y-1">
          <span className="text-[9.5px] font-black uppercase text-slate-400">Gross Margin</span>
          <p className="text-xl font-black font-mono text-blue-600 dark:text-blue-400">
            {financialOverview.grossMarginPercent.toFixed(1)}%
          </p>
        </div>

        <div className={`p-5 rounded-3xl border space-y-1 ${
          financialOverview.netProfit >= 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700' : 'bg-red-500/10 border-red-500/20 text-red-600'
        }`}>
          <span className="text-[9.5px] font-black uppercase">Net Profit</span>
          <p className="text-xl font-black font-mono">
            {Math.round(financialOverview.netProfit).toLocaleString()} ₭
          </p>
        </div>

        <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm space-y-1">
          <span className="text-[9.5px] font-black uppercase text-slate-400">OPEX</span>
          <p className="text-xl font-black font-mono text-slate-800 dark:text-white">
            {Math.round(financialOverview.totalOPEX).toLocaleString()} ₭
          </p>
        </div>
      </div>

      {/* 3 Payment Channels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-[#052659] to-[#073069] text-white p-5 rounded-3xl shadow-xl space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#5483B3]">Total Net Cashflow</span>
          <p className="text-2xl font-black font-mono">{Math.round(financialOverview.totalNetLiquidity).toLocaleString()} ₭</p>
        </div>

        <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm space-y-2">
          <span className="text-[10px] font-black uppercase text-emerald-600 flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Cash</span>
          <p className="text-xl font-black font-mono text-slate-800 dark:text-white">{Math.round(financialOverview.cashNet).toLocaleString()} ₭</p>
        </div>

        <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm space-y-2">
          <span className="text-[10px] font-black uppercase text-red-500 flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> BCEL OnePay</span>
          <p className="text-xl font-black font-mono text-slate-800 dark:text-white">{Math.round(financialOverview.onepayNet).toLocaleString()} ₭</p>
        </div>

        <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm space-y-2">
          <span className="text-[10px] font-black uppercase text-blue-600 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> ທະນາຄານ LDB</span>
          <p className="text-xl font-black font-mono text-slate-800 dark:text-white">{Math.round(financialOverview.ldbNet).toLocaleString()} ₭</p>
        </div>
      </div>

      {/* 7-Day Chart */}
      <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-xl space-y-4">
        <h3 className="text-xs font-black uppercase text-slate-800 dark:text-white">ກະແສເງິນສົດ 7 ວັນລ່າສຸດ (7-Day Cashflow)</h3>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={financialOverview.trends7Days}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis dataKey="date" tick={{fontSize: 9}} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={(val: number) => [`${Number(val || 0).toLocaleString()} ₭`, '']} />
              <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} name="Inflow" />
              <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} name="Outflow" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
