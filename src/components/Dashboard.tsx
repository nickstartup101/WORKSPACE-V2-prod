import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { 
  TrendingUp, TrendingDown, Percent, ArrowUpRight, 
  Activity, Wallet, CreditCard, Building2, DollarSign, Calendar
} from 'lucide-react';
import { format, subDays, parseISO, isSameMonth } from 'date-fns';

export type PaymentChannel = 'Cash' | 'Onepay' | 'LDB';

const normalizeChannel = (src?: string): PaymentChannel => {
  if (!src) return 'Cash';
  const s = String(src).toLowerCase();
  if (s.includes('ldb')) return 'LDB';
  if (s.includes('onepay') || s.includes('bcel') || s.includes('ໂອນ')) return 'Onepay';
  return 'Cash';
};

export default function Dashboard({ selectedBranch }: { selectedBranch?: string }) {
  const [filterPeriod, setFilterPeriod] = useState<'month' | 'all'>('month');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ດຶງຂໍ້ມູນ Transactions (Cashflow) ບ່ອນດຽວ
  useEffect(() => {
    setLoading(true);
    const qAll = query(collection(db, 'transactions'), orderBy('date', 'desc'));
    const unsub = onSnapshot(qAll, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // ກັ່ນຕອງຕາມສາຂາ
      const branchId = selectedBranch || 'branch_1';
      const branchFiltered = branchId === 'all' 
        ? all 
        : all.filter((tx: any) => (tx.branchId || 'branch_1') === branchId);
      setTransactions(branchFiltered);
      setLoading(false);
    });
    return () => unsub();
  }, [selectedBranch]);

  // ຄິດໄລ່ຕົວເລກຕາມສູດດຽວກັນກັບ Financials.tsx ເປະ
  const financialSummary = useMemo(() => {
    const now = new Date();

    const activeList = transactions.filter(tx => {
      if (filterPeriod === 'all') return true;
      if (!tx.date) return true;
      try {
        const d = parseISO(tx.date);
        return isSameMonth(d, now);
      } catch {
        return true;
      }
    });

    let totalRevenue = 0;
    let totalPurchasing = 0;
    let totalOPEX = 0;

    let cashIncome = 0, cashExpense = 0;
    let onepayIncome = 0, onepayExpense = 0;
    let ldbIncome = 0, ldbExpense = 0;

    activeList.forEach(tx => {
      const amt = Number(tx.amount) || 0;
      const ch = normalizeChannel(tx.source || tx.paymentMethod);
      const isIncome = tx.type === 'income' || String(tx.category || '').toLowerCase() === 'sales';

      if (isIncome) {
        totalRevenue += amt;
        if (ch === 'Cash') cashIncome += amt;
        else if (ch === 'Onepay') onepayIncome += amt;
        else if (ch === 'LDB') ldbIncome += amt;
      } else {
        const cat = String(tx.category || '').toLowerCase();
        const isPurchasing = cat.includes('purchas') || cat.includes('supply') || cat.includes('ຊື້') || cat.includes('cogs');

        if (isPurchasing) totalPurchasing += amt;
        else if (cat !== 'dividend' && cat !== 'ປັນຜົນ') totalOPEX += amt;

        if (ch === 'Cash') cashExpense += amt;
        else if (ch === 'Onepay') onepayExpense += amt;
        else if (ch === 'LDB') ldbExpense += amt;
      }
    });

    const totalExpenses = totalPurchasing + totalOPEX;
    const grossProfit = totalRevenue - totalPurchasing;
    const grossMarginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const netProfit = totalRevenue - totalExpenses;

    const cashNet = cashIncome - cashExpense;
    const onepayNet = onepayIncome - onepayExpense;
    const ldbNet = ldbIncome - ldbExpense;
    const totalNetCashflow = cashNet + onepayNet + ldbNet;

    return {
      totalRevenue,
      totalPurchasing,
      totalOPEX,
      grossProfit,
      grossMarginPercent,
      netProfit,
      cashNet,
      cashIncome,
      cashExpense,
      onepayNet,
      onepayIncome,
      onepayExpense,
      ldbNet,
      ldbIncome,
      ldbExpense,
      totalNetCashflow
    };
  }, [transactions, filterPeriod]);

  // 7-Day Dynamics Chart ຈາກ Cashflow
  const last7DaysData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateKey = format(d, 'yyyy-MM-dd');
      const label = format(d, 'dd/MM');

      const dayInc = transactions
        .filter(t => (t.date || '').startsWith(dateKey) && (t.type === 'income' || String(t.category || '').toLowerCase() === 'sales'))
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);

      const dayExp = transactions
        .filter(t => (t.date || '').startsWith(dateKey) && t.type === 'expense')
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);

      days.push({
        date: label,
        net: dayInc - dayExp,
      });
    }

    const maxVal = Math.max(...days.map(d => Math.abs(d.net)), 1000000);
    return days.map(d => ({
      ...d,
      heightPercent: Math.min(Math.round((Math.abs(d.net) / maxVal) * 100), 100)
    }));
  }, [transactions]);

  return (
    <div className="p-4 sm:p-5 space-y-5 bg-slate-100/90 min-h-screen text-slate-800">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#001839]/5 text-[#001839] flex items-center justify-center border border-[#001839]/10">
            <Activity strokeWidth={1.4} className="w-5 h-5 text-[#001839]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-serif tracking-tight text-[#001839] uppercase">
                Executive Dashboard
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-[#001839]/5 text-[#001839] text-[8.5px] font-serif uppercase tracking-widest font-semibold">
                {selectedBranch === 'all' ? 'ທຸກສາຂາ (All Branches)' : selectedBranch || 'ສາຂາ 1'}
              </span>
            </div>
            <p className="text-[10px] font-serif tracking-widest text-slate-400 uppercase mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Cashflow Synchronized ({transactions.length} Transactions)
            </p>
          </div>
        </div>

        {/* Filter Period Pills */}
        <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/60">
          <button
            onClick={() => setFilterPeriod('month')}
            className={`px-3 py-1.5 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
              filterPeriod === 'month' ? 'bg-[#001839] text-white shadow-xs font-semibold' : 'text-slate-600'
            }`}
          >
            ເດືອນນີ້ (This Month)
          </button>
          <button
            onClick={() => setFilterPeriod('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
              filterPeriod === 'all' ? 'bg-[#001839] text-white shadow-xs font-semibold' : 'text-slate-600'
            }`}
          >
            ທັງໝົດ (All-Time)
          </button>
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Total Revenue</span>
          <h3 className="text-xl font-serif tracking-tight text-emerald-800">{Math.round(financialSummary.totalRevenue).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-slate-400">ຍອດຂາຍລວມຈາກ Cashflow</span>
        </div>

        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Purchasing (COGS)</span>
          <h3 className="text-xl font-serif tracking-tight text-rose-800">{Math.round(financialSummary.totalPurchasing).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-slate-400">ຕົ້ນທຶນຈັດຊື້ & ວັດຖຸດິບ</span>
        </div>

        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Gross Margin</span>
            <span className="text-xs font-serif text-[#001839] font-bold">{financialSummary.grossMarginPercent.toFixed(1)}%</span>
          </div>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">{Math.round(financialSummary.grossProfit).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-slate-400">ກຳໄລຂັ້ນຕົ້ນ</span>
        </div>

        <div className="p-4 bg-emerald-50/70 rounded-3xl border border-emerald-200/70 shadow-xs space-y-2">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-emerald-900 font-semibold">Net Operating Profit</span>
          <h3 className="text-xl font-serif tracking-tight text-emerald-900 font-semibold">{Math.round(financialSummary.netProfit).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-emerald-700/80">ກຳໄລສຸດທິ (OPEX: {Math.round(financialSummary.totalOPEX).toLocaleString()} ₭)</span>
        </div>

        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Operational OPEX</span>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">{Math.round(financialSummary.totalOPEX).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-slate-400">ຄ່າເຊົ່າ, ເງິນເດືອນ, ບໍລິຫານ</span>
        </div>
      </div>

      {/* Row 2: 4 ບັດຍອດເງິນຄົງເຫຼືອແຍກຊ່ອງທາງ (ກົງກັບຮູບ Cashflow 100%) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 bg-[#001839] text-white rounded-3xl shadow-xs space-y-1.5">
          <span className="text-[9.5px] font-serif uppercase tracking-[0.2em] text-white/60">Total Net Cashflow</span>
          <h3 className="text-2xl font-serif tracking-tight">{Math.round(financialSummary.totalNetCashflow).toLocaleString()} ₭</h3>
          <p className="text-[9px] text-white/40 font-mono">
            IN: +{Math.round(financialSummary.totalRevenue).toLocaleString()} | OUT: -{Math.round(financialSummary.totalPurchasing + financialSummary.totalOPEX).toLocaleString()}
          </p>
        </div>

        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-700" /> CASH IN HAND
            </span>
            <span className="text-[8.5px] font-serif px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded font-bold uppercase">CASH</span>
          </div>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">{Math.round(financialSummary.cashNet).toLocaleString()} ₭</h3>
          <div className="flex justify-between text-[9px] font-mono text-slate-400">
            <span className="text-emerald-700 font-bold">+{Math.round(financialSummary.cashIncome).toLocaleString()}</span>
            <span className="text-rose-700 font-bold">-{Math.round(financialSummary.cashExpense).toLocaleString()}</span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
              <span className="w-2 h-2 rounded-full bg-rose-700" /> ONEPAY BALANCE
            </span>
            <span className="text-[8.5px] font-serif px-2 py-0.5 bg-rose-50 text-rose-800 rounded font-bold uppercase">ONEPAY</span>
          </div>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">{Math.round(financialSummary.onepayNet).toLocaleString()} ₭</h3>
          <div className="flex justify-between text-[9px] font-mono text-slate-400">
            <span className="text-emerald-700 font-bold">+{Math.round(financialSummary.onepayIncome).toLocaleString()}</span>
            <span className="text-rose-700 font-bold">-{Math.round(financialSummary.onepayExpense).toLocaleString()}</span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
              <span className="w-2 h-2 rounded-full bg-blue-700" /> LDB BALANCE
            </span>
            <span className="text-[8.5px] font-serif px-2 py-0.5 bg-blue-50 text-blue-800 rounded font-bold uppercase">LDB</span>
          </div>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">{Math.round(financialSummary.ldbNet).toLocaleString()} ₭</h3>
          <div className="flex justify-between text-[9px] font-mono text-slate-400">
            <span className="text-emerald-700 font-bold">+{Math.round(financialSummary.ldbIncome).toLocaleString()}</span>
            <span className="text-rose-700 font-bold">-{Math.round(financialSummary.ldbExpense).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Row 3: 7-Day Dynamics Chart */}
      <div className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-serif uppercase tracking-wider text-[#001839]">
            ກະແສເງິນສົດ 7 ວັນລ່າສຸດ (7-Day Cashflow Dynamics)
          </h3>
          <span className="text-[10px] font-serif text-slate-400 uppercase">Unit: LAK (ກີບ)</span>
        </div>

        <div className="h-52 w-full flex items-end justify-between gap-4 pt-6 pb-2 px-2 border-b border-slate-100">
          {last7DaysData.map((bar, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
              <div className="w-full max-w-[50px] bg-slate-50 rounded-t-xl h-full flex items-end justify-center p-1">
                {bar.heightPercent > 0 ? (
                  <div 
                    style={{ height: `${Math.max(bar.heightPercent, 8)}%` }} 
                    className="w-full bg-[#001839] rounded-t-lg transition-all group-hover:bg-[#00285d] shadow-xs"
                    title={`ວັນທີ ${bar.date}: ${Math.round(bar.net).toLocaleString()} LAK`}
                  />
                ) : (
                  <div className="w-full h-1 bg-slate-200 rounded-full" />
                )}
              </div>
              <span className="text-[10px] font-mono text-slate-400 group-hover:text-[#001839] transition">
                {bar.date}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}


