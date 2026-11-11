import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { 
  FileText, Download, Calendar, ChevronLeft, ChevronRight, 
  TrendingUp, TrendingDown, Percent, Wallet, CreditCard, Building2,
  DollarSign, ArrowUpRight, Award, ShieldCheck
} from 'lucide-react';
import { format, subMonths, addMonths, parseISO, isSameMonth } from 'date-fns';
import * as XLSX from 'xlsx';

export type PaymentChannel = 'Cash' | 'Onepay' | 'LDB';

const LAO_MONTHS = [
  'ມັງກອນ (Jan)', 'ກຸມພາ (Feb)', 'ມີນາ (Mar)', 'ເມສາ (Apr)', 
  'ພຶດສະພາ (May)', 'ມິຖຸນາ (Jun)', 'ກໍລະກົດ (Jul)', 'ສິງຫາ (Aug)', 
  'ກັນຍາ (Sep)', 'ຕຸລາ (Oct)', 'ພະຈິກ (Nov)', 'ທັນວາ (Dec)'
];

const normalizeChannel = (src?: string): PaymentChannel => {
  if (!src) return 'Cash';
  const s = String(src).toLowerCase();
  if (s.includes('ldb')) return 'LDB';
  if (s.includes('onepay') || s.includes('bcel') || s.includes('ໂອນ')) return 'Onepay';
  return 'Cash';
};

export default function FinanceReport({ selectedBranch }: { selectedBranch?: string }) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const selectedMonth = useMemo(() => format(currentDate, 'yyyy-MM'), [currentDate]);
  const [loading, setLoading] = useState<boolean>(true);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);

  // 1. ດຶງຂໍ້ມູນ Transactions (Cashflow) ທັງໝົດ ແລະ ກັ່ນຕອງຕາມສາຂາ
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

  // 2. ກັ່ນຕອງທຸລະກຳສະເພາະເດືອນທີ່ເລືອກ
  const monthlyTransactions = useMemo(() => {
    return allTransactions.filter(tx => {
      if (!tx.date) return false;
      try {
        const d = parseISO(tx.date);
        return isSameMonth(d, currentDate);
      } catch {
        return (tx.date || '').startsWith(selectedMonth);
      }
    });
  }, [allTransactions, currentDate, selectedMonth]);

  // 3. ຄິດໄລ່ຕົວເລກການເງິນ P&L ສະເພາະເດືອນນີ້
  const financialSummary = useMemo(() => {
    let totalRevenue = 0;
    let totalPurchasing = 0;
    let totalOPEX = 0;
    let totalDividend = 0;

    let cashIncome = 0, cashExpense = 0;
    let onepayIncome = 0, onepayExpense = 0;
    let ldbIncome = 0, ldbExpense = 0;

    monthlyTransactions.forEach(tx => {
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
        const isDividend = cat.includes('dividend') || cat.includes('ປັນຜົນ');

        if (isPurchasing) {
          totalPurchasing += amt;
        } else if (isDividend) {
          // ຕັດເງິນປັນຜົນແຍກຕ່າງຫາກ ບໍ່ໃຫ້ກະທົບ OPEX
          totalDividend += amt;
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
    
    // Operating Net Profit = ລາຍຮັບ - ຕົ້ນທຶນ COGS - ລາຍຈ່າຍ OPEX (ບໍ່ຖືກກະທົບໂດຍປັນຜົນ)
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
  }, [monthlyTransactions]);

  // 4. ສົ່ງອອກ Excel
  const handleExportExcel = () => {
    const headers = ['ວັນທີ', 'ເວລາ', 'ລາຍການ/ຄຳອະທິບາຍ', 'ໝວດໝູ່', 'ປະເພດ', 'ຊ່ອງທາງ', 'ຈຳນວນເງິນ (LAK)'];
    const rows = monthlyTransactions.map(t => [
      t.date || '',
      t.time || '',
      t.description || t.title || '',
      t.category || '',
      t.type === 'income' ? 'ລາຍຮັບ' : 'ລາຍຈ່າຍ',
      normalizeChannel(t.source || t.paymentMethod),
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
                Monthly Verified
              </span>
            </div>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              ລາຍງານງົບດຸນ, ຕົ້ນທຶນ, ກຳໄລສຸດທິ ແລະ ກະແສເງິນສົດແຍກຊ່ອງທາງ • {selectedBranch === 'all' ? 'ທຸກສາຂາລວມ' : selectedBranch || 'ສາຂາ 1'}
            </p>
          </div>
        </div>

        {/* Month Selector & Export Excel */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-2xl p-1">
            <button 
              onClick={() => setCurrentDate(prev => subMonths(prev, 1))}
              className="p-1.5 rounded-xl hover:bg-slate-200 text-[#001839] cursor-pointer transition"
              title="ເດືອນກ່ອນໜ້າ"
            >
              <ChevronLeft strokeWidth={1.4} className="w-4 h-4" />
            </button>
            <div className="px-3 py-1 font-serif text-xs text-[#001839] font-medium flex items-center gap-1.5">
              <Calendar strokeWidth={1.4} className="w-3.5 h-3.5 text-[#001839]" />
              <span>{LAO_MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}</span>
            </div>
            <button 
              onClick={() => setCurrentDate(prev => addMonths(prev, 1))}
              className="p-1.5 rounded-xl hover:bg-slate-200 text-[#001839] cursor-pointer transition"
              title="ເດືອນຖັດໄປ"
            >
              <ChevronRight strokeWidth={1.4} className="w-4 h-4" />
            </button>
          </div>

          <button 
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-[#001839] border border-slate-200 rounded-xl text-xs font-serif uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition shadow-xs"
          >
            <Download strokeWidth={1.4} className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* Row 1: Core P&L KPIs (ລາຍຮັບ, COGS, Gross Margin, Net Operating Profit, ROI) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        {/* Total Revenue */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Total Revenue</span>
          <h3 className="text-xl font-serif tracking-tight text-emerald-800">
            {Math.round(financialSummary.totalRevenue).toLocaleString()} ₭
          </h3>
          <span className="text-[10px] text-slate-400 font-sans">ຍອດຂາຍລວມປະຈຳເດືອນ</span>
        </div>

        {/* COGS (Purchasing) */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Cost of Goods (COGS)</span>
          <h3 className="text-xl font-serif tracking-tight text-rose-800">
            {Math.round(financialSummary.totalPurchasing).toLocaleString()} ₭
          </h3>
          <span className="text-[10px] text-slate-400 font-sans">ຕົ້ນທຶນສິນຄ້າ ແລະ ວັດຖຸດິບ</span>
        </div>

        {/* Gross Profit & Margin */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Gross Profit</span>
            <span className="text-xs font-serif text-[#001839] font-bold">
              {financialSummary.grossMargin.toFixed(1)}%
            </span>
          </div>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">
            {Math.round(financialSummary.grossProfit).toLocaleString()} ₭
          </h3>
          <span className="text-[10px] text-slate-400 font-sans">ກຳໄລຂັ້ນຕົ້ນ</span>
        </div>

        {/* Net Operating Profit (ກຳໄລສຸດທິຕົວຈິງ ບໍ່ຖືກກະທົບໂດຍປັນຜົນ) */}
        <div className="p-4 bg-emerald-50/70 rounded-3xl border border-emerald-200/70 shadow-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-emerald-900 font-semibold">Net Operating Profit</span>
            <span className="text-xs font-serif text-emerald-800 font-bold">
              {financialSummary.netMargin.toFixed(1)}%
            </span>
          </div>
          <h3 className="text-xl font-serif tracking-tight text-emerald-900 font-semibold">
            {Math.round(financialSummary.netProfit).toLocaleString()} ₭
          </h3>
          <span className="text-[10px] text-emerald-700/80 font-sans">
            ກຳໄລສຸດທິ (OPEX: {Math.round(financialSummary.totalOPEX).toLocaleString()} ₭)
          </span>
        </div>

        {/* ROI % (Return on Cost) */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Return on Cost (ROI)</span>
            <Percent strokeWidth={1.4} className="w-3.5 h-3.5 text-[#001839]" />
          </div>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">
            {financialSummary.roi.toFixed(1)}%
          </h3>
          <span className="text-[10px] text-slate-400 font-sans">ອັດຕາຜົນຕອບແທນທຶນ</span>
        </div>

      </div>

      {/* Row 2: Payment Channels Breakdown (ກົງກັບ Cashflow 100%) */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <div>
            <h3 className="text-sm font-serif uppercase tracking-wider text-[#001839] flex items-center gap-2">
              <Wallet strokeWidth={1.4} className="w-4 h-4 text-[#001839]" />
              <span>Payment Channel Liquidity Audit (ແຍກບັນຊີກະແສເງິນສົດ)</span>
            </h3>
            <p className="text-[11px] text-slate-400">ກວດສອບຍອດເງິນເຂົ້າ-ອອກຕົວຈິງແຕ່ລະຊ່ອງທາງຈາກ Cashflow ປະຈຳເດືອນນີ້</p>
          </div>
          <div className="px-3.5 py-1.5 bg-[#001839] text-white rounded-xl text-xs font-serif">
            Total Net: {Math.round(financialSummary.channels.totalNetCashflow).toLocaleString()} ₭
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* CASH Channel */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-serif uppercase tracking-wider text-[#001839] flex items-center gap-1.5 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-700" /> CASH (ເງິນສົດໃນຮ້ານ)
              </span>
              <span className="text-xs font-serif font-bold text-[#001839]">
                {Math.round(financialSummary.channels.cash.net).toLocaleString()} ₭
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200/60 font-mono">
              <div>
                <span className="text-[9px] text-slate-400 uppercase block font-serif">Inflow</span>
                <span className="text-emerald-700 font-bold">+{Math.round(financialSummary.channels.cash.in).toLocaleString()} ₭</span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-slate-400 uppercase block font-serif">Outflow</span>
                <span className="text-rose-700 font-bold">-{Math.round(financialSummary.channels.cash.out).toLocaleString()} ₭</span>
              </div>
            </div>
          </div>

          {/* BCEL ONEPAY Channel */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-serif uppercase tracking-wider text-[#001839] flex items-center gap-1.5 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-700" /> BCEL ONEPAY (ໂອນ)
              </span>
              <span className="text-xs font-serif font-bold text-[#001839]">
                {Math.round(financialSummary.channels.onepay.net).toLocaleString()} ₭
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200/60 font-mono">
              <div>
                <span className="text-[9px] text-slate-400 uppercase block font-serif">Inflow</span>
                <span className="text-emerald-700 font-bold">+{Math.round(financialSummary.channels.onepay.in).toLocaleString()} ₭</span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-slate-400 uppercase block font-serif">Outflow</span>
                <span className="text-rose-700 font-bold">-{Math.round(financialSummary.channels.onepay.out).toLocaleString()} ₭</span>
              </div>
            </div>
          </div>

          {/* LDB Bank Channel */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-serif uppercase tracking-wider text-[#001839] flex items-center gap-1.5 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-700" /> ທະນາຄານ LDB
              </span>
              <span className="text-xs font-serif font-bold text-[#001839]">
                {Math.round(financialSummary.channels.ldb.net).toLocaleString()} ₭
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200/60 font-mono">
              <div>
                <span className="text-[9px] text-slate-400 uppercase block font-serif">Inflow</span>
                <span className="text-emerald-700 font-bold">+{Math.round(financialSummary.channels.ldb.in).toLocaleString()} ₭</span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-slate-400 uppercase block font-serif">Outflow</span>
                <span className="text-rose-700 font-bold">-{Math.round(financialSummary.channels.ldb.out).toLocaleString()} ₭</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Row 3: Dividend Settlement (ແຍກຕ່າງຫາກ ບໍ່ໃຫ້ກະທົບ OPEX) */}
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
              ຍອດປັນຜົນຖືກຕັດອອກຈາກຄ່າໃຊ້ຈ່າຍຮ້ານ (OPEX) ເຮັດໃຫ້ກຳໄລປະຈຳເດືອນຖືກຕ້ອງ 100%
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-serif uppercase text-amber-800 block">Total Dividends Settled</span>
          <span className="text-base font-serif font-bold text-amber-950">
            {Math.round(financialSummary.totalDividend).toLocaleString()} ₭
          </span>
        </div>
      </div>

      {/* Row 4: Transaction Details Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-sm font-serif uppercase tracking-wider text-[#001839]">
            Transaction Records ({selectedMonth})
          </h3>
          <span className="text-xs font-serif text-slate-400">{monthlyTransactions.length} ລາຍການ</span>
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
              {monthlyTransactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-slate-400 font-serif">
                    ບໍ່ມີທຸລະກຳໃນເດືອນ {selectedMonth}
                  </td>
                </tr>
              ) : (
                monthlyTransactions.map(t => {
                  const ch = normalizeChannel(t.source || t.paymentMethod);
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
