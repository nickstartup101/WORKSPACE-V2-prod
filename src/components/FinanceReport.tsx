import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { 
  FileText, Download, Calendar, ChevronLeft, ChevronRight, 
  TrendingUp, TrendingDown, Percent, Wallet, CreditCard, Building2,
  DollarSign, ArrowUpRight, Eye, EyeOff
} from 'lucide-react';
import { format, subMonths, addMonths, parseISO, isSameMonth } from 'date-fns';
import * as XLSX from 'xlsx';

export type PaymentChannel = 'Cash' | 'Onepay' | 'LDB';

const LAO_MONTHS = [
  'ມັງກອນ (Jan)', 'ກຸມພາ (Feb)', 'ມີນາ (Mar)', 'ເມສາ (Apr)', 
  'ພຶດສະພາ (May)', 'ມິຖຸນາ (Jun)', 'ກໍລະກົດ (Jul)', 'ສິງຫາ (Aug)', 
  'ກັນຍາ (Sep)', 'ຕຸລາ (Oct)', 'ພະຈິກ (Nov)', 'ທັນວາ (Dec)'
];

// Helper ກວດສອບຊ່ອງທາງຈ່າຍແບບກວມລວມ 100% ດຶງທັງ source, paymentMethod ແລະ description
const getTxChannel = (tx: any): PaymentChannel => {
  const raw = String(
    tx.source || 
    tx.paymentMethod || 
    tx.payment_method || 
    tx.channel || 
    tx.method || 
    ''
  ).toLowerCase();

  if (raw.includes('ldb')) return 'LDB';
  if (raw.includes('onepay') || raw.includes('bcel') || raw.includes('online') || raw.includes('transfer') || raw.includes('ໂອນ')) return 'Onepay';
  if (raw.includes('cash') || raw.includes('ສົດ')) return 'Cash';

  // Fallback: ກວດຈາກ description ຫຼື category
  const desc = String(tx.description || tx.title || '').toLowerCase();
  if (desc.includes('ldb')) return 'LDB';
  if (desc.includes('onepay') || desc.includes('bcel') || desc.includes('ໂອນ')) return 'Onepay';
  if (desc.includes('cash') || desc.includes('ສົດ')) return 'Cash';

  return 'Cash';
};

// Helper ກວດສອບວັນທີ ຮອງຮັບທັງ "2026-11-03", "03/11/2026" ແລະ Timestamps
const isTxInTargetMonth = (txDate: any, targetMonthStr: string, targetDate: Date): boolean => {
  if (!txDate) return false;

  // 1. ຖ້າເປັນ Firestore Timestamp
  if (typeof txDate.toDate === 'function') {
    try {
      return format(txDate.toDate(), 'yyyy-MM') === targetMonthStr;
    } catch {
      return false;
    }
  }

  const s = String(txDate).trim();

  // 2. ຮູບແບບ YYYY-MM-DD
  if (s.startsWith(targetMonthStr)) return true;

  // 3. ຮູບແບບ DD/MM/YYYY (ເຊັ່ນ 03/11/2026)
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      const year = parts[2].length === 4 ? parts[2] : `20${parts[2]}`;
      const month = parts[1].padStart(2, '0');
      return `${year}-${month}` === targetMonthStr;
    }
  }

  // 4. ISO Date parse
  try {
    const d = parseISO(s);
    if (!isNaN(d.getTime())) {
      return isSameMonth(d, targetDate);
    }
  } catch {}

  return false;
};

export default function FinanceReport({ selectedBranch }: { selectedBranch?: string }) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const selectedMonth = useMemo(() => format(currentDate, 'yyyy-MM'), [currentDate]);
  const [timeframeMode, setTimeframeMode] = useState<'month' | 'all'>('month');
  const [loading, setLoading] = useState<boolean>(true);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [showPrivacy, setShowPrivacy] = useState<boolean>(false);

  // ດຶງຂໍ້ມູນ Transactions ຈາກ Cashflow
  useEffect(() => {
    setLoading(true);
    const qAll = query(collection(db, 'transactions'), orderBy('date', 'desc'));
    
    const unsub = onSnapshot(qAll, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const branchId = selectedBranch || 'branch_1';
      const branchFiltered = branchId === 'all' 
        ? all 
        : all.filter((tx: any) => (tx.branchId || 'branch_1') === branchId);
      
      setAllTransactions(branchFiltered);
      setLoading(false);
    });

    return () => unsub();
  }, [selectedBranch]);

  // ກັ່ນຕອງທຸລະກຳຕາມຊ່ວງເວລາ (This Month vs All-Time)
  const activeTransactions = useMemo(() => {
    if (timeframeMode === 'all') return allTransactions;
    return allTransactions.filter(tx => isTxInTargetMonth(tx.date, selectedMonth, currentDate));
  }, [allTransactions, timeframeMode, selectedMonth, currentDate]);

  // ຄິດໄລ່ຕົວເລກການເງິນທັງໝົດ ຕົກກົງກັບ Cashflow 100%
  const summary = useMemo(() => {
    let totalRevenue = 0;
    let totalPurchasing = 0;
    let totalOPEX = 0;
    let totalDividend = 0;

    let cashIncome = 0, cashExpense = 0;
    let onepayIncome = 0, onepayExpense = 0;
    let ldbIncome = 0, ldbExpense = 0;

    activeTransactions.forEach(tx => {
      const amt = Number(tx.amount) || 0;
      const ch = getTxChannel(tx);
      const isIncome = tx.type === 'income' || String(tx.category || '').toLowerCase() === 'sales';

      if (isIncome) {
        totalRevenue += amt;
        if (ch === 'Cash') cashIncome += amt;
        else if (ch === 'Onepay') onepayIncome += amt;
        else if (ch === 'LDB') ldbIncome += amt;
      } else {
        const cat = String(tx.category || '').toLowerCase();
        const isPurchasing = cat.includes('purchas') || cat.includes('supply') || cat.includes('ຊື້') || cat.includes('cogs');
        const isDividend = cat.includes('dividend') || cat.includes('ປັນຜົນ');

        if (isPurchasing) {
          totalPurchasing += amt;
        } else if (isDividend) {
          totalDividend += amt; // ຕັດປັນຜົນແຍກຕ່າງຫາກ ບໍ່ໃຫ້ກະທົບ OPEX
        } else {
          totalOPEX += amt;
        }

        if (ch === 'Cash') cashExpense += amt;
        else if (ch === 'Onepay') onepayExpense += amt;
        else if (ch === 'LDB') ldbExpense += amt;
      }
    });

    const grossProfit = totalRevenue - totalPurchasing;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    
    // Operating Net Profit = ລາຍຮັບ - ຕົ້ນທຶນ COGS - ລາຍຈ່າຍ OPEX
    const netProfit = totalRevenue - (totalPurchasing + totalOPEX);
    const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    const totalCost = totalPurchasing + totalOPEX;
    const roi = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;

    const cashNet = cashIncome - cashExpense;
    const onepayNet = onepayIncome - onepayExpense;
    const ldbNet = ldbIncome - ldbExpense;
    const totalNetCashflow = cashNet + onepayNet + ldbNet;

    return {
      totalRevenue,
      totalPurchasing,
      totalOPEX,
      totalDividend,
      grossProfit,
      grossMargin,
      netProfit,
      netMargin,
      totalCost,
      roi,
      channels: {
        cash: { in: cashIncome, out: cashExpense, net: cashNet },
        onepay: { in: onepayIncome, out: onepayExpense, net: onepayNet },
        ldb: { in: ldbIncome, out: ldbExpense, net: ldbNet },
        totalNetCashflow
      }
    };
  }, [activeTransactions]);

  // Export Excel
  const handleExportExcel = () => {
    const headers = ['ວັນທີ', 'ເວລາ', 'ລາຍການ/ຄຳອະທິບາຍ', 'ໝວດໝູ່', 'ປະເພດ', 'ຊ່ອງທາງ', 'ຈຳນວນເງິນ (LAK)'];
    const rows = activeTransactions.map(t => [
      t.date || '',
      t.time || '',
      t.description || t.title || '',
      t.category || '',
      (t.type === 'income' || String(t.category || '').toLowerCase() === 'sales') ? 'ລາຍຮັບ' : 'ລາຍຈ່າຍ',
      getTxChannel(t),
      Number(t.amount || 0)
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Report_${selectedMonth}`);
    XLSX.writeFile(workbook, `Financial_Report_${selectedMonth}.xlsx`);
  };

  return (
    <div className="p-4 sm:p-5 space-y-5 bg-slate-100/90 min-h-screen text-slate-800">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#001839]/5 text-[#001839] flex items-center justify-center border border-[#001839]/10">
            <FileText strokeWidth={1.4} className="w-5 h-5 text-[#001839]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-serif tracking-tight text-[#001839]">
                Financial Audit & P&L Statement
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-[#001839] text-white text-[8.5px] font-serif uppercase tracking-[0.2em]">
                Verified P&L
              </span>
            </div>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              ລາຍງານງົບດຸນ, ຕົ້ນທຶນ, ກຳໄລ ແລະ ກະແສເງິນສົດແຍກຊ່ອງທາງ • {selectedBranch === 'all' ? 'ທຸກສາຂາລວມ' : selectedBranch || 'ສາຂາ 1'}
            </p>
          </div>
        </div>

        {/* Month Selector, Timeframe & Export */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          
          {/* Timeframe Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/60">
            <button
              type="button"
              onClick={() => setTimeframeMode('month')}
              className={`px-3 py-1.5 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
                timeframeMode === 'month' ? 'bg-[#001839] text-white shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => setTimeframeMode('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
                timeframeMode === 'all' ? 'bg-[#001839] text-white shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All-Time
            </button>
          </div>

          {/* Month Controls (ເມື່ອເລືອກໂໝດ Month) */}
          {timeframeMode === 'month' && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-2xl p-1">
              <button 
                onClick={() => setCurrentDate(prev => subMonths(prev, 1))}
                className="p-1 rounded-xl hover:bg-slate-200 text-[#001839] cursor-pointer transition"
                title="ເດືອນກ່ອນໜ້າ"
              >
                <ChevronLeft strokeWidth={1.4} className="w-4 h-4" />
              </button>
              <div className="px-2.5 py-1 font-serif text-xs text-[#001839] font-medium flex items-center gap-1">
                <Calendar strokeWidth={1.4} className="w-3.5 h-3.5 text-[#001839]" />
                <span>{LAO_MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}</span>
              </div>
              <button 
                onClick={() => setCurrentDate(prev => addMonths(prev, 1))}
                className="p-1 rounded-xl hover:bg-slate-200 text-[#001839] cursor-pointer transition"
                title="ເດືອນຖັດໄປ"
              >
                <ChevronRight strokeWidth={1.4} className="w-4 h-4" />
              </button>
            </div>
          )}

          <button 
            onClick={() => setShowPrivacy(!showPrivacy)}
            className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-[#001839] font-serif text-xs uppercase tracking-wider rounded-xl transition border border-slate-200 flex items-center gap-1 cursor-pointer"
          >
            {showPrivacy ? <Eye strokeWidth={1.4} className="w-3.5 h-3.5 text-emerald-700" /> : <EyeOff strokeWidth={1.4} className="w-3.5 h-3.5" />}
            <span>{showPrivacy ? "Show" : "Hide"}</span>
          </button>

          <button 
            onClick={handleExportExcel}
            className="px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-[#001839] border border-slate-200 rounded-xl text-xs font-serif uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition shadow-xs"
          >
            <Download strokeWidth={1.4} className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* ================= ROW 1: 4 ບັດຍອດເງິນຄົງເຫຼືອ (ກົງກັບ Cashflow 100%) ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        
        {/* Total Net Cashflow */}
        <div className="bg-[#001839] text-white p-4 sm:p-5 rounded-3xl shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-[0.2em] text-white/60">
              Total Net Cashflow
            </span>
            <div className="p-1.5 bg-white/10 rounded-xl">
              <DollarSign strokeWidth={1.4} className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-2xl font-serif tracking-tight">
            {showPrivacy ? '••••••••' : `${Math.round(summary.channels.totalNetCashflow).toLocaleString()} ₭`}
          </p>
          <p className="text-[9.5px] text-white/40 font-mono uppercase">
            IN: +{Math.round(summary.totalRevenue).toLocaleString()} | OUT: -{Math.round(summary.totalPurchasing + summary.totalOPEX).toLocaleString()}
          </p>
        </div>

        {/* Cash in Hand */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-700" />
              <span>CASH IN HAND</span>
            </span>
            <span className="text-[8.5px] font-serif px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded font-bold uppercase">CASH</span>
          </div>
          <p className="text-xl font-serif tracking-tight text-[#001839]">
            {showPrivacy ? '••••••' : `${Math.round(summary.channels.cash.net).toLocaleString()} ₭`}
          </p>
          <div className="flex justify-between text-[9.5px] font-mono text-slate-400 font-medium">
            <span className="text-emerald-700 font-bold">+{Math.round(summary.channels.cash.in).toLocaleString()}</span>
            <span className="text-rose-700 font-bold">-{Math.round(summary.channels.cash.out).toLocaleString()}</span>
          </div>
        </div>

        {/* BCEL OnePay */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
              <span className="w-2 h-2 rounded-full bg-rose-700" />
              <span>ONEPAY BALANCE</span>
            </span>
            <span className="text-[8.5px] font-serif px-2 py-0.5 bg-rose-50 text-rose-800 rounded font-bold uppercase">ONEPAY</span>
          </div>
          <p className="text-xl font-serif tracking-tight text-[#001839]">
            {showPrivacy ? '••••••' : `${Math.round(summary.channels.onepay.net).toLocaleString()} ₭`}
          </p>
          <div className="flex justify-between text-[9.5px] font-mono text-slate-400 font-medium">
            <span className="text-emerald-700 font-bold">+{Math.round(summary.channels.onepay.in).toLocaleString()}</span>
            <span className="text-rose-700 font-bold">-{Math.round(summary.channels.onepay.out).toLocaleString()}</span>
          </div>
        </div>

        {/* LDB Bank */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
              <span className="w-2 h-2 rounded-full bg-blue-700" />
              <span>LDB BALANCE</span>
            </span>
            <span className="text-[8.5px] font-serif px-2 py-0.5 bg-blue-50 text-blue-800 rounded font-bold uppercase">LDB</span>
          </div>
          <p className="text-xl font-serif tracking-tight text-[#001839]">
            {showPrivacy ? '••••••' : `${Math.round(summary.channels.ldb.net).toLocaleString()} ₭`}
          </p>
          <div className="flex justify-between text-[9.5px] font-mono text-slate-400 font-medium">
            <span className="text-emerald-700 font-bold">+{Math.round(summary.channels.ldb.in).toLocaleString()}</span>
            <span className="text-rose-700 font-bold">-{Math.round(summary.channels.ldb.out).toLocaleString()}</span>
          </div>
        </div>

      </div>

      {/* ================= ROW 2: P&L Financial Indicators ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        {/* Total Revenue */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Total Revenue</span>
          <h3 className="text-xl font-serif tracking-tight text-emerald-800">
            {Math.round(summary.totalRevenue).toLocaleString()} ₭
          </h3>
          <span className="text-[10px] text-slate-400 font-sans">ຍອດຂາຍລວມ</span>
        </div>

        {/* COGS (Purchasing) */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Cost of Goods (COGS)</span>
          <h3 className="text-xl font-serif tracking-tight text-rose-800">
            {Math.round(summary.totalPurchasing).toLocaleString()} ₭
          </h3>
          <span className="text-[10px] text-slate-400 font-sans">ຕົ້ນທຶນຈັດຊື້ & ວັດຖຸດິບ</span>
        </div>

        {/* Gross Profit & Margin */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Gross Profit</span>
            <span className="text-xs font-serif text-[#001839] font-bold">
              {summary.grossMargin.toFixed(1)}%
            </span>
          </div>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">
            {Math.round(summary.grossProfit).toLocaleString()} ₭
          </h3>
          <span className="text-[10px] text-slate-400 font-sans">ກຳໄລຂັ້ນຕົ້ນ</span>
        </div>

        {/* Net Operating Profit */}
        <div className="p-4 bg-emerald-50/70 rounded-3xl border border-emerald-200/70 shadow-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-emerald-900 font-semibold">Net Operating Profit</span>
            <span className="text-xs font-serif text-emerald-800 font-bold">
              {summary.netMargin.toFixed(1)}%
            </span>
          </div>
          <h3 className="text-xl font-serif tracking-tight text-emerald-900 font-semibold">
            {Math.round(summary.netProfit).toLocaleString()} ₭
          </h3>
          <span className="text-[10px] text-emerald-700/80 font-sans">
            ກຳໄລສຸດທິ (OPEX: {Math.round(summary.totalOPEX).toLocaleString()} ₭)
          </span>
        </div>

        {/* ROI % */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Return on Cost (ROI)</span>
            <Percent strokeWidth={1.4} className="w-3.5 h-3.5 text-[#001839]" />
          </div>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">
            {summary.roi.toFixed(1)}%
          </h3>
          <span className="text-[10px] text-slate-400 font-sans">ອັດຕາຜົນຕອບແທນທຶນ</span>
        </div>

      </div>

      {/* ================= ROW 3: Dividend Settlement Status (ແຍກຕ່າງຫາກ) ================= */}
      <div className="p-4 bg-amber-50/60 rounded-3xl border border-amber-200/60 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center font-serif text-sm font-bold shadow-xs">
            Q
          </div>
          <div>
            <h4 className="text-xs font-serif uppercase tracking-wider text-amber-900 font-bold">
              Dividend Settlement (ການປັນຜົນປະຈຳງວດ)
            </h4>
            <p className="text-[11px] text-amber-800/80">
              ຍອດປັນຜົນຖືກຕັດອອກຈາກຄ່າໃຊ້ຈ່າຍຮ້ານ (OPEX) ເຮັດໃຫ້ກຳໄລສຸດທິ Operating Profit ຖືກຕ້ອງ 100%
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-serif uppercase text-amber-800 block">Total Dividends Settled</span>
          <span className="text-base font-serif font-bold text-amber-950">
            {Math.round(summary.totalDividend).toLocaleString()} ₭
          </span>
        </div>
      </div>

      {/* ================= ROW 4: Transaction Details Table ================= */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-sm font-serif uppercase tracking-wider text-[#001839]">
            Transaction Records ({timeframeMode === 'all' ? 'All-Time' : selectedMonth})
          </h3>
          <span className="text-xs font-serif text-slate-400">{activeTransactions.length} ລາຍການ</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-serif uppercase tracking-wider text-slate-400">
              <tr>
                <th className="p-3.5 pl-4">Date</th>
                <th className="p-3.5">Title / Description</th>
                <th className="p-3.5">Category</th>
                <th className="p-3.5">Channel</th>
                <th className="p-3.5 text-right pr-4">Amount (LAK)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeTransactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-slate-400 font-serif">
                    ບໍ່ມີທຸລະກຳໃນຊ່ວງເວລານີ້
                  </td>
                </tr>
              ) : (
                activeTransactions.map(t => {
                  const ch = getTxChannel(t);
                  const isInc = t.type === 'income' || String(t.category || '').toLowerCase() === 'sales';

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70 transition">
                      <td className="p-3.5 pl-4 font-mono text-slate-500">{t.date}</td>
                      <td className="p-3.5 font-medium text-[#001839]">{t.description || t.title || 'Transaction'}</td>
                      <td className="p-3.5 font-serif uppercase text-[10px] text-slate-500">{t.category || '-'}</td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-serif uppercase tracking-wider ${
                          ch === 'Cash' 
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/60' 
                            : ch === 'Onepay' 
                              ? 'bg-rose-50 text-rose-800 border border-rose-200/60' 
                              : 'bg-blue-50 text-blue-800 border border-blue-200/60'
                        }`}>
                          {ch}
                        </span>
                      </td>
                      <td className={`p-3.5 pr-4 text-right font-serif text-xs font-bold ${isInc ? 'text-emerald-800' : 'text-rose-800'}`}>
                        {isInc ? '+' : '-'}{Number(t.amount || 0).toLocaleString()} ₭
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
