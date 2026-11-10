import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, where, limit } from 'firebase/firestore';
import { 
  ArrowUpRight, ArrowDownRight, Percent, 
  Calendar, Download, Clock, Filter, Sparkles, CreditCard, Wallet, Building2,
  ChevronLeft, ChevronRight, Zap
} from 'lucide-react';
import { format, subMonths, addMonths } from 'date-fns';
import { utils, writeFile } from 'xlsx';
import { useTranslation } from 'react-i18next';

// ຊື່ເດືອນພາສາລາວ ແລະ ອັງກິດ
const LAO_MONTHS = [
  'ມັງກອນ (Jan)', 'ກຸມພາ (Feb)', 'ມີນາ (Mar)', 'ເມສາ (Apr)', 
  'ພຶດສະພາ (May)', 'ມິຖຸນາ (Jun)', 'ກໍລະກົດ (Jul)', 'ສິງຫາ (Aug)', 
  'ກັນຍາ (Sep)', 'ຕຸລາ (Oct)', 'ພະຈິກ (Nov)', 'ທັນວາ (Dec)'
];

// 🌟 1. ຟັງຊັນແຍກຊ່ອງທາງການເງິນ (OnePay, LDB, Cash) ຈາກຂໍ້ມູນທີ່ຄີແທ້ໆ
const resolvePaymentChannel = (item: any): 'onepay' | 'ldb' | 'cash' => {
  if (!item) return 'cash';
  const combined = (
    String(item.paymentChannel || '') + ' ' +
    String(item.paymentMethod || '') + ' ' +
    String(item.channel || '') + ' ' +
    String(item.method || '') + ' ' +
    String(item.remark || '') + ' ' +
    String(item.description || '') + ' ' +
    String(item.category || '')
  ).toLowerCase();

  if (combined.includes('onepay') || combined.includes('one_pay') || combined.includes('bcel')) {
    return 'onepay';
  }
  if (combined.includes('ldb')) {
    return 'ldb';
  }
  return 'cash';
};

// 🌟 2. ຟັງຊັນແປງວັນທີອັດສະລິຍະ (ຮອງຮັບທັງ 2569 -> 2026, DD/MM/YYYY, Timestamp)
const extractYearMonthSafe = (raw: any): string => {
  if (!raw) return '';

  let d: Date | null = null;

  if (raw && typeof raw.toDate === 'function') {
    try { d = raw.toDate(); } catch {}
  } else if (raw && typeof raw.seconds === 'number') {
    d = new Date(raw.seconds * 1000);
  } else if (raw instanceof Date && !isNaN(raw.getTime())) {
    d = raw;
  }

  if (d && !isNaN(d.getTime())) {
    let y = d.getFullYear();
    if (y > 2400) y -= 543; // ແປງ 2569 -> 2026
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return y + '-' + m;
  }

  if (typeof raw === 'string') {
    const clean = raw.trim().split('T')[0].split(' ')[0];

    if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts.length >= 2) {
        let y = parseInt(parts[0]);
        if (y > 2400) y -= 543;
        const m = parts[1].padStart(2, '0');
        if (!isNaN(y)) return y + '-' + m;
      }
    }

    if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3) {
        let y = parseInt(parts[2]);
        if (y > 2400) y -= 543;

        const p0 = parseInt(parts[0]);
        const p1 = parseInt(parts[1]);
        const m = (p0 > 12 ? p1 : (p1 > 12 ? p0 : p1)).toString().padStart(2, '0');
        if (!isNaN(y)) return y + '-' + m;
      }
    }
  }

  return '';
};

export default function FinanceReport({ selectedBranch }: { selectedBranch?: string }) {
  const { i18n } = useTranslation();
  const currentBranch = selectedBranch || 'branch_1';

  // 🌟 ຕັ້ງຄ່າເລີ່ມຕົ້ນ: ເລືອກເດືອນປັດຈຸບັນ (Default to Current Month)
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const selectedMonth = useMemo(() => format(currentDate, 'yyyy-MM'), [currentDate]);
  
  const [filterMode, setFilterMode] = useState<'month' | 'all'>('month');

  // 🌟 State Loading Animation
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [transactions, setTransactions] = useState<any[]>([]);

  // 🌟 ດຶງສະເພາະເດືອນທີ່ເລືອກມາເທົ່ານັ້ນ (On-Demand Loading ເພື່ອຄວາມໄວສູງສຸດ)
  useEffect(() => {
    setIsLoading(true);

    let qTransactions;
    if (filterMode === 'month') {
      const monthStart = selectedMonth + '-01';
      const monthEnd = selectedMonth + '-31';

      // ດຶງສະເພາະຊ່ວງວັນທີຂອງເດືອນນັ້ນ
      qTransactions = query(
        collection(db, 'transactions'),
        where('date', '>=', monthStart),
        where('date', '<=', monthEnd)
      );
    } else {
      // ໂໝດດຶງທັງໝົດ (On-Demand ເມື່ອກົດປຸ່ມ 'ທັງໝົດ')
      qTransactions = query(
        collection(db, 'transactions'),
        limit(300)
      );
    }

    const unsubT = onSnapshot(qTransactions, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // ກັ່ນຕອງສາຂາ
      setTransactions(all.filter((tx: any) => (tx.branchId || 'branch_1') === currentBranch));
      setIsLoading(false); // ປິດ Loading ເມື່ອຂໍ້ມູນມາຮອດ
    }, (err) => {
      console.warn("Query fallback error:", err);
      // Fallback ໃນກໍລະນີທີ່ຍັງບໍ່ທັນມີ Index
      const fallbackQ = query(collection(db, 'transactions'), limit(150));
      onSnapshot(fallbackQ, (fallbackSnap) => {
        const all = fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setTransactions(all.filter((tx: any) => (tx.branchId || 'branch_1') === currentBranch));
        setIsLoading(false);
      });
    });

    return () => unsubT();
  }, [currentBranch, selectedMonth, filterMode]);

  // ປຸ່ມເລື່ອນເດືອນຍ້ອນຫຼັງ < ແລະ ໄປໜ້າ >
  const handlePrevMonth = () => {
    setIsLoading(true);
    setFilterMode('month');
    setCurrentDate(prev => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setIsLoading(true);
    setFilterMode('month');
    setCurrentDate(prev => addMonths(prev, 1));
  };

  // 🌟 ຄິດໄລ່ຕົວເລກການເງິນ ແລະ ແຍກ 3 ຊ່ອງທາງ (OnePay, LDB, Cash)
  const reportData = useMemo(() => {
    let totalRevenue = 0;
    let totalCogs = 0;
    let totalOpex = 0;
    let totalSalary = 0;
    let totalDividends = 0;

    let cashRevenue = 0;
    let cashExpense = 0;
    let onepayRevenue = 0;
    let onepayExpense = 0;
    let ldbRevenue = 0;
    let ldbExpense = 0;

    let filteredTxCount = 0;

    transactions.forEach(tx => {
      const txMonth = extractYearMonthSafe(tx.date) || extractYearMonthSafe(tx.createdAt);
      const isMatch = filterMode === 'all' || txMonth === selectedMonth;

      if (isMatch) {
        filteredTxCount++;
        const amt = Number(tx.amount || 0);
        const type = String(tx.type || '').toLowerCase();
        const cat = String(tx.category || '').toLowerCase();
        const remark = String(tx.remark || '').toLowerCase();

        const method = resolvePaymentChannel(tx);

        const isDividend = type === 'dividend' || cat === 'dividend' || cat === 'dividends' || remark.includes('ປັນຜົນ');
        const isReserve = type === 'reserve_transfer' || cat === 'stock_reserve' || remark.includes('stock');

        if (isDividend || isReserve) {
          totalDividends += amt;
        } else if (type === 'income' || cat === 'sales') {
          totalRevenue += amt;
          // 🌟 ແຍກລາຍຮັບເຂົ້າ 3 ກະເປົາແທ້ໆ
          if (method === 'onepay') onepayRevenue += amt;
          else if (method === 'ldb') ldbRevenue += amt;
          else cashRevenue += amt;
        } else if (type === 'expense') {
          const isPurchasing = cat.includes('purchas') || cat.includes('ຊື້') || cat.includes('cogs') || remark.includes('ຊື້');
          const isSalary = cat.includes('salary') || cat.includes('ເງິນເດືອນ');

          if (isPurchasing) {
            totalCogs += amt;
          } else if (isSalary) {
            totalSalary += amt;
            totalOpex += amt;
          } else {
            totalOpex += amt;
          }

          // 🌟 ຕັດລາຍຈ່າຍອອກຈາກ 3 ກະເປົາແທ້ໆ
          if (method === 'onepay') onepayExpense += amt;
          else if (method === 'ldb') ldbExpense += amt;
          else cashExpense += amt;
        }
      }
    });

    const grossProfit = totalRevenue - totalCogs;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const netProfit = grossProfit - totalOpex;
    const roi = (totalCogs + totalOpex) > 0 ? (netProfit / (totalCogs + totalOpex)) * 100 : 0;

    // 🌟 ຍອດເງິນຄົງເຫຼືອຕົວຈິງຕາມແຕ່ລະກະເປົາ (Inflow - Outflow)
    const netCash = cashRevenue - cashExpense;
    const netOnepay = onepayRevenue - onepayExpense;
    const netLdb = ldbRevenue - ldbExpense;

    return {
      totalRevenue,
      totalCogs,
      totalOpex,
      totalSalary,
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
  }, [transactions, selectedMonth, filterMode]);

  const handleExportExcel = () => {
    const headers = ['Metric', 'Amount (LAK)'];
    const rows = [
      ['Period', filterMode === 'all' ? 'All Time' : selectedMonth],
      ['Total Revenue (ລາຍຮັບ)', reportData.totalRevenue],
      ['COGS (ຕົ້ນທຶນຈັດຊື້)', reportData.totalCogs],
      ['Gross Profit (ກຳໄລຂັ້ນຕົ້ນ)', reportData.grossProfit],
      ['Gross Margin %', reportData.grossMargin.toFixed(1) + '%'],
      ['Operating Expenses (OPEX)', reportData.totalOpex],
      ['Net Profit (ກຳໄລສຸດທິ)', reportData.netProfit],
      ['Net BCEL OnePay', reportData.netOnepay],
      ['Net LDB Bank', reportData.netLdb],
      ['Net Cash (ເງິນສົດ)', reportData.netCash]
    ];
    const ws = utils.aoa_to_sheet([headers, ...rows]);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "FinanceReport");
    writeFile(wb, "FinanceReport_" + (filterMode === 'all' ? 'All' : selectedMonth) + ".xlsx");
  };

  return (
    <div className="space-y-6">

      {/* Header Bar + ປະຕິທິນລາວ-ອັງກິດ */}
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
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[9px] font-black uppercase flex items-center gap-1">
                <Zap className="w-2.5 h-2.5" /> High-Speed Engine
              </span>
            </div>

            {/* 🌟 ປຸ່ມເລືອກເດືອນ ພ້ອມປຸ່ມເລື່ອນ < ແລະ > */}
            <div className="flex items-center gap-2 mt-1">
              <button 
                onClick={handlePrevMonth}
                className="p-1 rounded-lg bg-slate-100 dark:bg-white/10 hover:bg-slate-200 text-slate-600 dark:text-white cursor-pointer"
                title="ເດືອນກ່ອນໜ້າ"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 dark:bg-white/5 border border-indigo-500/20 rounded-xl text-xs font-black text-indigo-600 dark:text-indigo-300">
                <Calendar className="w-3.5 h-3.5" />
                <span>
                  {filterMode === 'all' 
                    ? 'ທັງໝົດ (All-Time)' 
                    : LAO_MONTHS[currentDate.getMonth()] + ' ' + currentDate.getFullYear()}
                </span>
              </div>

              <button 
                onClick={handleNextMonth}
                className="p-1 rounded-lg bg-slate-100 dark:bg-white/10 hover:bg-slate-200 text-slate-600 dark:text-white cursor-pointer"
                title="ເດືອນຖັດໄປ"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              <span className="text-[10px] text-slate-400 font-bold uppercase ml-2">
                {"(" + reportData.filteredTxCount + " transactions)"}
              </span>
            </div>
          </div>
        </div>

        {/* ປຸ່ມຄວບຄຸມ: Month Input, ປຸ່ມ 'ທັງໝົດ', ປຸ່ມ Excel */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-white/5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-bold">
            <Calendar className="w-4 h-4 text-indigo-500" />
            <input
              type="month"
              value={selectedMonth}
              onChange={e => {
                if (e.target.value) {
                  setIsLoading(true);
                  setFilterMode('month');
                  const parts = e.target.value.split('-');
                  setCurrentDate(new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1));
                }
              }}
              className="bg-transparent font-bold outline-none cursor-pointer text-slate-800 dark:text-white"
            />
          </div>

          <div className="flex bg-slate-100 dark:bg-black/20 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => {
                setIsLoading(true);
                setFilterMode('month');
                setCurrentDate(new Date()); // ກັບມາເດືອນປັດຈຸບັນ
              }}
              className={
                "px-3 py-1 rounded-lg cursor-pointer transition-all " +
                (filterMode === 'month' && selectedMonth === format(new Date(), 'yyyy-MM') ? "bg-[#052659] text-white shadow-xs" : "text-slate-500")
              }
            >
              ເດືອນນີ້
            </button>
            <button
              onClick={() => {
                setIsLoading(true);
                setFilterMode('all');
              }}
              className={
                "px-3 py-1 rounded-lg cursor-pointer transition-all " +
                (filterMode === 'all' ? "bg-[#052659] text-white shadow-xs" : "text-slate-500")
              }
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

      {/* 🌟 LOADING ANIMATION (ສະແດງທຸກຄັ້ງທີ່ກຳລັງດຶງຂໍ້ມູນ) */}
      {isLoading ? (
        <div className="py-20 p-8 bg-white dark:bg-[#073069] rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <div className="text-center">
            <p className="text-xs font-black uppercase text-slate-700 dark:text-white tracking-wider animate-pulse">
              ກຳລັງດຶງຂໍ້ມູນລາຍຮັບ-ລາຍຈ່າຍ... (Loading...)
            </p>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">
              {filterMode === 'all' 
                ? 'ກຳລັງດາວໂຫຼດຍອດລວມທັງໝົດ' 
                : 'ດາວໂຫຼດສະເພາະເດືອນ ' + selectedMonth + ' ເພື່ອຄວາມໄວສູງສຸດ'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Row 1: 5 KPI Cards ຫຼັກ */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {/* TOTAL REVENUE */}
            <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" /> TOTAL REVENUE
              </span>
              <p className="text-xl sm:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                {Math.round(reportData.totalRevenue).toLocaleString() + " ₭"}
              </p>
              <p className="text-[9.5px] text-slate-400 uppercase font-bold">CUSTOMER INFLOWS</p>
            </div>

            {/* COGS (PURCHASING) */}
            <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1">
                <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" /> COGS (PURCHASING)
              </span>
              <p className="text-xl sm:text-2xl font-black font-mono text-rose-600 dark:text-rose-400">
                {Math.round(reportData.totalCogs).toLocaleString() + " ₭"}
              </p>
              <p className="text-[9.5px] text-slate-400 uppercase font-bold">MATERIAL COSTS</p>
            </div>

            {/* % GROSS MARGIN */}
            <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm space-y-1">
              <span className="text-[10px] font-black uppercase text-blue-500 flex items-center gap-1">
                <Percent className="w-3.5 h-3.5" /> % GROSS MARGIN
              </span>
              <p className="text-xl sm:text-2xl font-black font-mono text-blue-600 dark:text-blue-400">
                {reportData.grossMargin.toFixed(1) + "%"}
              </p>
              <p className="text-[9.5px] text-slate-400 font-mono">{"GP: " + Math.round(reportData.grossProfit).toLocaleString() + " ₭"}</p>
            </div>

            {/* NET PROFIT */}
            <div className={
              "p-5 rounded-3xl border shadow-sm space-y-1 " +
              (reportData.netProfit >= 0 
                ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500/20" 
                : "bg-rose-50/50 dark:bg-rose-950/20 border-rose-500/20")
            }>
              <span className={
                "text-[10px] font-black uppercase " +
                (reportData.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")
              }>
                NET PROFIT
              </span>
              <p className={
                "text-xl sm:text-2xl font-black font-mono " +
                (reportData.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")
              }>
                {Math.round(reportData.netProfit).toLocaleString() + " ₭"}
              </p>
              <p className="text-[9.5px] text-slate-400 font-bold uppercase">
                {"OPEX: " + Math.round(reportData.totalOpex).toLocaleString() + " ₭"}
              </p>
            </div>

            {/* ESTIMATED ROI */}
            <div className="bg-amber-50/50 dark:bg-white/5 p-5 rounded-3xl border border-amber-500/20 shadow-sm space-y-1 col-span-2 lg:col-span-1">
              <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">
                ESTIMATED ROI
              </span>
              <p className="text-xl sm:text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
                {reportData.roi.toFixed(1) + "%"}
              </p>
              <p className="text-[9.5px] text-slate-400 uppercase font-bold">RETURN ON TOTAL COST</p>
            </div>
          </div>

          {/* 🌟 Row 2: ຍອດເງິນແຍກຕາມ 3 ຊ່ອງທາງ (BCEL OnePay, LDB, Cash) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* BCEL ONEPAY */}
            <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-rose-500/20 shadow-sm space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> BCEL ONEPAY (ໂອນ)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 text-[9px] font-black uppercase">OnePay</span>
              </div>
              <p className="text-2xl font-black font-mono text-rose-600 dark:text-rose-400">
                {Math.round(reportData.netOnepay).toLocaleString() + " ₭"}
              </p>
              <p className="text-[9.5px] text-slate-400">ຍອດເງິນໂອນ OnePay ຕົວຈິງ</p>
            </div>

            {/* ທະນາຄານ LDB */}
            <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-blue-500/20 shadow-sm space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> ທະນາຄານ LDB
                </span>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 text-[9px] font-black uppercase">LDB</span>
              </div>
              <p className="text-2xl font-black font-mono text-blue-600 dark:text-blue-400">
                {Math.round(reportData.netLdb).toLocaleString() + " ₭"}
              </p>
              <p className="text-[9.5px] text-slate-400">ຍອດເງິນໂອນ LDB ຕົວຈິງ</p>
            </div>

            {/* ເງິນສົດ (CASH) */}
            <div className="bg-white dark:bg-[#073069] p-5 rounded-3xl border border-emerald-500/20 shadow-sm space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" /> ເງິນສົດ (CASH)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[9px] font-black uppercase">Cash</span>
              </div>
              <p className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                {Math.round(reportData.netCash).toLocaleString() + " ₭"}
              </p>
              <p className="text-[9.5px] text-slate-400">ຍອດເງິນສົດໃນລິ້ນຊັກຕົວຈິງ</p>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
