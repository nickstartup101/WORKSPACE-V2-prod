import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { 
  ArrowUpRight, ArrowDownRight, Percent, 
  Calendar, Download, Clock, Filter, Sparkles, CreditCard, Wallet, Building2
} from 'lucide-react';
import { format } from 'date-fns';
import { utils, writeFile } from 'xlsx';
import { useTranslation } from 'react-i18next';

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

// 🌟 2. ຟັງຊັນແປງວັນທີ (ຮອງຮັບທັງ ປີ 2569 -> 2026, DD/MM/YYYY, Timestamp)
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
    if (y > 2400) y -= 543; // ແປງປີ 2569 -> 2026
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

  // 🌟 ດຶງສະເພາະ transactions ບ່ອນດຽວ (ເບົາ, ໄວ, ບໍ່ດາວໂຫຼດຮູບໃຫ້ໜັກ!)
  const [transactions, setTransactions] = useState<any[]>([]);
  const [filterMode, setFilterMode] = useState<'month' | 'all'>('month');
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-11');

  useEffect(() => {
    const unsubT = onSnapshot(collection(db, 'transactions'), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTransactions(all.filter((tx: any) => (tx.branchId || 'branch_1') === currentBranch));
    }, err => handleFirestoreError(err, OperationType.LIST, 'transactions'));

    return () => unsubT();
  }, [currentBranch]);

  // ລາຍຊື່ເດືອນທີ່ມີຂໍ້ມູນຕົວຈິງ
  const availableMonthsList = useMemo(() => {
    const monthCounts: Record<string, number> = {};
    
    transactions.forEach(tx => {
      const ym = extractYearMonthSafe(tx.date) || extractYearMonthSafe(tx.createdAt);
      if (ym) {
        monthCounts[ym] = (monthCounts[ym] || 0) + 1;
      }
    });

    return Object.entries(monthCounts).sort((a, b) => b[0].localeCompare(a[0]));
  }, [transactions]);

  useEffect(() => {
    if (availableMonthsList.length > 0 && filterMode === 'month') {
      const exists = availableMonthsList.some(([m]) => m === selectedMonth);
      if (!exists) {
        setSelectedMonth(availableMonthsList[0][0]);
      }
    }
  }, [availableMonthsList]);

  // 🌟 ຄິດໄລ່ຕົວເລກການເງິນທັງໝົດໂດຍກົງຈາກ Transactions (ແຍກ 3 ຊ່ອງທາງຕົງເປະ 100%)
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
          // 🌟 ແຍກລາຍຮັບເຂົ້າ 3 ກະເປົາ
          if (method === 'onepay') onepayRevenue += amt;
          else if (method === 'ldb') ldbRevenue += amt;
          else cashRevenue += amt;
        } else if (type === 'expense') {
          // ແຍກປະເພດລາຍຈ່າຍ: Purchasing (COGS) vs Salary vs OPEX
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

          // 🌟 ຕັດລາຍຈ່າຍອອກຈາກ 3 ກະເປົາ
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

    // 🌟 ຍອດເງິນຄົງເຫຼືອແທ້ໆຕາມແຕ່ລະຊ່ອງທາງ (Inflow - Outflow)
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
              {(filterMode === 'all' ? 'ຍອດລວມທັງໝົດ (All-Time)' : 'ເດືອນ ' + selectedMonth) + ' (' + reportData.filteredTxCount + ' transactions)'}
            </p>
          </div>
        </div>

        {/* ຕົວເລືອກເດືອນ & ປຸ່ມ Export */}
        <div className="flex flex-wrap items-center gap-2">
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

          <div className="flex bg-slate-100 dark:bg-black/20 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setFilterMode('all')}
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

      {/* 🌟 ແຖບປຸ່ມເດືອນທີ່ມີຂໍ້ມູນຕົວຈິງ */}
      {availableMonthsList.length > 0 && (
        <div className="p-3 bg-white dark:bg-[#073069] rounded-2xl border border-slate-200/80 dark:border-white/10 flex items-center gap-2 overflow-x-auto">
          <span className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1 shrink-0">
            <Filter className="w-3 h-3 text-indigo-500" />
            ເລືອກເດືອນທີ່ມີບິນ:
          </span>
          {availableMonthsList.map(([mStr, count]) => (
            <button
              key={mStr}
              onClick={() => {
                setSelectedMonth(mStr);
                setFilterMode('month');
              }}
              className={
                "px-3 py-1 rounded-xl text-xs font-bold shrink-0 cursor-pointer transition-all " +
                (filterMode === 'month' && selectedMonth === mStr
                  ? "bg-indigo-600 text-white shadow-md"
                  : "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200")
              }
            >
              {"ເດືອນ " + mStr} <span className="text-[10px] opacity-75">{"(" + count + " ບິນ)"}</span>
            </button>
          ))}
        </div>
      )}

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

      {/* 🌟 Row 2: ຍອດເງິນແຍກຕາມ 3 ຊ່ອງທາງ (BCEL OnePay, LDB, Cash) ຖືກຕ້ອງ 100%! */}
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
  );
}
