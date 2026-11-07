import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { 
  ArrowUpRight, ArrowDownRight, Percent, 
  Calendar, Download, Clock, Sparkles
} from 'lucide-react';
import { format, subMonths } from 'date-fns';
import { utils, writeFile } from 'xlsx';
import { useTranslation } from 'react-i18next';

// 🌟 ຟັງຊັນດຶງ "ປີ-ເດືອນ (YYYY-MM)" ອັດສະລິຍະ (ຮອງຮັບທຸກຮູບແບບ: 2026-10, 11/10/2026, Timestamp)
const extractYearMonth = (raw: any): string => {
  if (!raw) return '';
  // 1. ຖ້າເປັນ Firestore Timestamp
  if (raw && typeof raw.toDate === 'function') {
    try { return format(raw.toDate(), 'yyyy-MM'); } catch {}
  }
  // 2. ຖ້າເປັນ Date Object
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    try { return format(raw, 'yyyy-MM'); } catch {}
  }
  // 3. ຖ້າເປັນ String
  if (typeof raw === 'string') {
    const clean = raw.trim().split('T')[0];
    // ຮູບແບບ YYYY-MM-DD
    if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts.length >= 2 && parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}`;
      }
    }
    // ຮູບແບບ DD/MM/YYYY ຫຼື DD/MM/YY
    if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3) {
        // ຖ້າປີຢູ່ທ້າຍ ເຊັ່ນ 11/10/2026
        if (parts[2].length === 4) {
          return `${parts[2]}-${parts[1].padStart(2, '0')}`;
        }
        // ຖ້າປີຢູ່ໜ້າ ເຊັ່ນ 2026/10/11
        if (parts[0].length === 4) {
          return `${parts[0]}-${parts[1].padStart(2, '0')}`;
        }
      }
    }
  }
  return '';
};

export default function FinanceReport({ selectedBranch }: { selectedBranch?: string }) {
  const { i18n } = useTranslation();
  const currentBranch = selectedBranch || 'branch_1';

  const [transactions, setTransactions] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);

  // 🌟 ເລືອກເດືອນ (Default: ເດືອນ 10 ທີ່ມີຂໍ້ມູນ ຫຼື ເດືອນປັດຈຸບັນ)
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-10');
  const [filterMode, setFilterMode] = useState<'month' | 'all'>('month');

  // 1. ດຶງຂໍ້ມູນ Real-time ຈາກ Firestore (ພ້ອມ Fallback ສາຂາ)
  useEffect(() => {
    const unsubT = onSnapshot(collection(db, 'transactions'), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTransactions(all.filter((tx: any) => (tx.branchId || 'branch_1') === currentBranch));
    }, err => handleFirestoreError(err, OperationType.LIST, 'transactions'));

    const unsubS = onSnapshot(collection(db, 'supplierPrices'), snap => {
      setSupplierPrices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => handleFirestoreError(err, OperationType.LIST, 'supplierPrices'));

    return () => {
      unsubT();
      unsubS();
    };
  }, [currentBranch]);

  // 2. 🌟 ຄິດໄລ່ຕົວເລກການເງິນ (ກັ່ນຕອງວັນທີແບບ Universal Matcher)
  const reportData = useMemo(() => {
    let totalRevenue = 0;
    let totalCogs = 0;
    let totalOpex = 0;
    let totalDividends = 0;

    let cashRevenue = 0;
    let cashExpense = 0;
    let onepayRevenue = 0;
    let onepayExpense = 0;
    let ldbRevenue = 0;
    let ldbExpense = 0;

    let filteredTxCount = 0;

    // ດຶງຍອດ COGS ຈາກ SupplierPrices
    supplierPrices.forEach(sp => {
      const spMonth = extractYearMonth(sp.date) || extractYearMonth(sp.createdAt);
      const isMatch = filterMode === 'all' || spMonth === selectedMonth;

      if (isMatch) {
        const totalVal = sp.totalPriceLAK !== undefined
          ? Number(sp.totalPriceLAK || 0)
          : (Number(sp.priceOriginal || 0) * Number(sp.exchangeRate || 1)) * (Number(sp.quantity) || 1);
        totalCogs += totalVal;
      }
    });

    // ດຶງຍອດ Transactions
    transactions.forEach(tx => {
      const txMonth = extractYearMonth(tx.date) || extractYearMonth(tx.createdAt);
      const isMatch = filterMode === 'all' || txMonth === selectedMonth;

      if (isMatch) {
        filteredTxCount++;
        const amt = Number(tx.amount || 0);
        const type = String(tx.type || '').toLowerCase();
        const cat = String(tx.category || '').toLowerCase();
        const method = String(tx.paymentMethod || 'Cash').toLowerCase();

        const isDividend = type === 'dividend' || cat === 'dividend' || cat === 'dividends' || String(tx.remark || '').includes('ປັນຜົນ');
        const isReserve = type === 'reserve_transfer' || cat === 'stock_reserve' || String(tx.remark || '').includes('stock');

        if (isDividend || isReserve) {
          totalDividends += amt; // ແຍກເງິນປັນຜົນຕ່າງຫາກ ບໍ່ເອົາໄປຕິດລົບ OPEX
        } else if (type === 'income' || cat === 'sales') {
          totalRevenue += amt;
          if (method.includes('onepay')) onepayRevenue += amt;
          else if (method.includes('ldb')) ldbRevenue += amt;
          else cashRevenue += amt;
        } else if (type === 'expense') {
          totalOpex += amt;
          if (method.includes('onepay')) onepayExpense += amt;
          else if (method.includes('ldb')) ldbExpense += amt;
          else cashExpense += amt;
        }
      }
    });

    const grossProfit = totalRevenue - totalCogs;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const netProfit = grossProfit - totalOpex;
    const roi = (totalCogs + totalOpex) > 0 ? (netProfit / (totalCogs + totalOpex)) * 100 : 0;

    const netCash = cashRevenue - cashExpense;
    const netOnepay = onepayRevenue - onepayExpense;
    const netLdb = ldbRevenue - ldbExpense;

    return {
      totalRevenue,
      totalCogs,
      totalOpex,
      totalDividends,
      grossProfit,
      grossMargin,
      netProfit,
      roi,
      netCash,
      netOnepay,
      netLdb,
      filteredTxCount
    };
  }, [transactions, supplierPrices, selectedMonth, filterMode]);

  const handleExportExcel = () => {
    const headers = ['Metric', 'Amount (LAK)'];
    const rows = [
      ['Period', filterMode === 'all' ? 'All Time' : selectedMonth],
      ['Total Revenue', reportData.totalRevenue],
      ['COGS (Purchasing)', reportData.totalCogs],
      ['Gross Profit', reportData.grossProfit],
      ['Gross Margin %', `${reportData.grossMargin.toFixed(1)}%`],
      ['Operating Expenses (OPEX)', reportData.totalOpex],
      ['Net Profit', reportData.netProfit],
      ['Dividends Paid', reportData.totalDividends],
      ['Net Cash', reportData.netCash],
      ['Net BCEL OnePay', reportData.netOnepay],
      ['Net LDB Bank', reportData.netLdb]
    ];
    const ws = utils.aoa_to_sheet([headers, ...rows]);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, `FinanceReport_${filterMode === 'all' ? 'All' : selectedMonth}`);
    writeFile(wb, `FinanceReport_${filterMode === 'all' ? 'All' : selectedMonth}.xlsx`);
  };

  return (
    <div className="space-y-6">

      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 bg-white dark:bg-[#073069] rounded-[2rem] border border-slate-200/80 dark:border-white/10 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                {i18n.language === 'la' ? 'ບົດລາຍງານການເງິນ & ວິເຄາະທຸລະກິດ' : 'Financial Statement & Business Analytics'}
              </h2>
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                {selectedBranch === 'branch_1' ? 'ສາຂາ 1' : 'ສາຂາ 2'}
              </span>
            </div>
            <p className="text-[10.5px] text-slate-400 font-bold uppercase mt-0.5">
              {filterMode === 'all' ? 'ຍອດລວມທັງໝົດ (All-Time)' : `ເດືອນ ${selectedMonth}`} ({reportData.filteredTxCount} transactions)
            </p>
          </div>
        </div>

        {/* 🌟 ຕົວເລືອກເດືອນ & ປຸ່ມສະຫຼັບ (ຕົງຕາມຮູບຂອງທ່ານ) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* ຊ່ອງເລືອກເດືອນ */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-white/5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-bold">
            <Calendar className="w-4 h-4 text-indigo-500" />
            <input
              type="month"
              value={selectedMonth}
              onChange={e => {
                setSelectedMonth(e.target.value);
                setFilterMode('month');
              }}
              className="bg-transparent font-bold outline-none cursor-pointer text-slate-800 dark:text-white"
            />
          </div>

          {/* ປຸ່ມ ເດືອນນີ້ / ທັງໝົດ */}
          <div className="flex bg-slate-100 dark:bg-black/20 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => {
                setSelectedMonth('2026-10'); // ຕັ້ງເດືອນ 10 ທີ່ມີຂໍ້ມູນ
                setFilterMode('month');
              }}
              className={`px-3 py-1 rounded-lg cursor-pointer transition-all ${filterMode === 'month' && selectedMonth === '2026-10' ? 'bg-[#052659] text-white shadow-xs' : 'text-slate-500'}`}
            >
              ເດືອນ 10
            </button>
            <button
              onClick={() => {
                setSelectedMonth(format(new Date(), 'yyyy-MM')); // ເດືອນປັດຈຸບັນ
                setFilterMode('month');
              }}
              className={`px-3 py-1 rounded-lg cursor-pointer transition-all ${filterMode === 'month' && selectedMonth === format(new Date(), 'yyyy-MM') ? 'bg-[#052659] text-white shadow-xs' : 'text-slate-500'}`}
            >
              ເດືອນນີ້
            </button>
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1 rounded-lg cursor-pointer transition-all ${filterMode === 'all' ? 'bg-[#052659] text-white shadow-xs' : 'text-slate-500'}`}
            >
              ທັງໝົດ
            </button>
          </div>

          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black uppercase flex items-center gap-1.5 shadow-md cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>EXCEL</span>
          </button>
        </div>
      </div>

      {/* Row 1: 5 KPI Cards ຫຼັກ */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Revenue */}
        <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" /> TOTAL REVENUE
          </span>
          <p className="text-xl sm:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
            {Math.round(reportData.totalRevenue).toLocaleString()} ₭
          </p>
          <p className="text-[9.5px] text-slate-400 uppercase font-bold">CUSTOMER INFLOWS</p>
        </div>

        {/* COGS */}
        <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1">
            <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" /> COGS (PURCHASING)
          </span>
          <p className="text-xl sm:text-2xl font-black font-mono text-rose-600 dark:text-rose-400">
            {Math.round(reportData.totalCogs).toLocaleString()} ₭
          </p>
          <p className="text-[9.5px] text-slate-400 uppercase font-bold">MATERIAL COSTS</p>
        </div>

        {/* Gross Margin */}
        <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1">
            <Percent className="w-3.5 h-3.5 text-blue-500" /> % GROSS MARGIN
          </span>
          <p className="text-xl sm:text-2xl font-black font-mono text-blue-600 dark:text-blue-400">
            {reportData.grossMargin.toFixed(1)}%
          </p>
          <p className="text-[9.5px] text-slate-400 font-mono">GP: {Math.round(reportData.grossProfit).toLocaleString()} ₭</p>
        </div>

        {/* NET PROFIT */}
        <div className={`p-5 rounded-3xl border shadow-sm space-y-1 ${
          reportData.netProfit >= 0 
            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500/20' 
            : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-500/20'
        }`}>
          <span className={`text-[10px] font-black uppercase ${reportData.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            NET PROFIT
          </span>
          <p className={`text-xl sm:text-2xl font-black font-mono ${reportData.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {Math.round(reportData.netProfit).toLocaleString()} ₭
          </p>
          <p className="text-[9.5px] text-slate-400 font-bold uppercase">
            OPEX: {Math.round(reportData.totalOpex).toLocaleString()} ₭
          </p>
        </div>

        {/* ESTIMATED ROI */}
        <div className="bg-amber-50/50 dark:bg-white/5 p-5 rounded-3xl border border-amber-500/20 shadow-sm space-y-1 col-span-2 lg:col-span-1">
          <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">
            ESTIMATED ROI
          </span>
          <p className="text-xl sm:text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
            {reportData.roi.toFixed(1)}%
          </p>
          <p className="text-[9.5px] text-slate-400 uppercase font-bold">RETURN ON TOTAL COST</p>
        </div>
      </div>

      {/* Row 2: ຍອດເງິນຕາມຊ່ອງທາງ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black uppercase text-slate-400">ເງິນສົດ (CASH)</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[9px] font-black uppercase">Cash</span>
          </div>
          <p className="text-2xl font-black font-mono text-slate-800 dark:text-white">
            {Math.round(reportData.netCash).toLocaleString()} ₭
          </p>
        </div>

        <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black uppercase text-slate-400">BCEL ONEPAY</span>
            <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 text-[9px] font-black uppercase">OnePay</span>
          </div>
          <p className="text-2xl font-black font-mono text-slate-800 dark:text-white">
            {Math.round(reportData.netOnepay).toLocaleString()} ₭
          </p>
        </div>

        <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black uppercase text-slate-400">ທະນາຄານ LDB</span>
            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 text-[9px] font-black uppercase">LDB</span>
          </div>
          <p className="text-2xl font-black font-mono text-slate-800 dark:text-white">
            {Math.round(reportData.netLdb).toLocaleString()} ₭
          </p>
        </div>
      </div>

    </div>
  );
}
