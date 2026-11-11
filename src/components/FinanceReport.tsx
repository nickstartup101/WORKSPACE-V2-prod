import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { 
  FileText, Download, Calendar, ChevronLeft, ChevronRight, 
  TrendingUp, TrendingDown, Percent, Wallet, CreditCard, Building2,
  PieChart, ArrowUpRight, DollarSign, Award, ShieldAlert
} from 'lucide-react';
import { format, subMonths, addMonths } from 'date-fns';
import * as XLSX from 'xlsx';

const LAO_MONTHS = [
  'ມັງກອນ (Jan)', 'ກຸມພາ (Feb)', 'ມີນາ (Mar)', 'ເມສາ (Apr)', 
  'ພຶດສະພາ (May)', 'ມິຖຸນາ (Jun)', 'ກໍລະກົດ (Jul)', 'ສິງຫາ (Aug)', 
  'ກັນຍາ (Sep)', 'ຕຸລາ (Oct)', 'ພະຈິກ (Nov)', 'ທັນວາ (Dec)'
];

// Helper ກວດສອບຊ່ອງທາງຈ່າຍແບບ Case-Insensitive
const normalizeMethod = (method: string = ''): 'cash' | 'onepay' | 'ldb' => {
  const m = method.toLowerCase();
  if (m.includes('onepay') || m.includes('bcel') || m.includes('ໂອນ')) return 'onepay';
  if (m.includes('ldb')) return 'ldb';
  return 'cash';
};

export default function FinanceReport() {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const selectedMonth = useMemo(() => format(currentDate, 'yyyy-MM'), [currentDate]);
  const [loading, setLoading] = useState<boolean>(true);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);

  useEffect(() => {
    setLoading(true);
    const start = selectedMonth + '-01';
    const end = selectedMonth + '-31';

    // ດຶງ Transactions
    const qTx = query(
      collection(db, 'transactions'),
      where('date', '>=', start),
      where('date', '<=', end)
    );
    const unsubTx = onSnapshot(qTx, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {
      onSnapshot(collection(db, 'transactions'), snap => {
        setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((t: any) => (t.date || '').startsWith(selectedMonth)));
      });
    });

    // ດຶງ Supplier Procurement ປະຈຳເດືອນ
    const qSp = query(
      collection(db, 'supplierPrices'),
      where('date', '>=', start),
      where('date', '<=', end)
    );
    const unsubSp = onSnapshot(qSp, (snap) => {
      setSupplierPrices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => {
      setLoading(false);
    });

    return () => {
      unsubTx();
      unsubSp();
    };
  }, [selectedMonth]);

  // 1. Revenue
  const totalRevenue = useMemo(() => {
    return transactions
      .filter(t => t.type === 'income' || t.category === 'revenue' || t.category === 'sales')
      .reduce((sum, t) => sum + (Number(t.amount) || Number(t.total) || 0), 0);
  }, [transactions]);

  // 2. COGS (ຕົ້ນທຶນສິນຄ້າ)
  const totalCOGS = useMemo(() => {
    const spTotal = supplierPrices.reduce((sum, p) => sum + (Number(p.totalPriceLAK) || 0), 0);
    const txCogs = transactions
      .filter(t => t.type === 'expense' && (t.category === 'purchasing' || t.category === 'cogs'))
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    return spTotal > 0 ? spTotal : txCogs;
  }, [supplierPrices, transactions]);

  // 3. OPEX (ຄ່າໃຊ້ຈ່າຍບໍລິຫານ - ຕັດ DIVIDEND ອອກຢ່າງເດັດຂາດ!)
  const totalOPEX = useMemo(() => {
    return transactions
      .filter(t => t.type === 'expense' && t.category !== 'purchasing' && t.category !== 'cogs' && t.category !== 'dividend' && t.category !== 'ປັນຜົນ')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [transactions]);

  // 4. Dividend (ເງິນປັນຜົນແຍກຕ່າງຫາກ)
  const totalDividend = useMemo(() => {
    return transactions
      .filter(t => t.category === 'dividend' || t.category === 'ປັນຜົນ' || t.type === 'dividend')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [transactions]);

  // 5. Financial Indicators
  const grossProfit = totalRevenue - totalCOGS;
  const grossMargin = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0.0';
  const netProfit = totalRevenue - (totalCOGS + totalOPEX); // ກຳໄລຕົວຈິງ ບໍ່ຖືກກະທົບໂດຍປັນຜົນ
  const netMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0.0';
  const totalCost = totalCOGS + totalOPEX;
  const roi = totalCost > 0 ? ((netProfit / totalCost) * 100).toFixed(1) : '0.0';

  // 6. Channel Breakdowns (ລວມທັງ Transactions + Supplier Prices)
  const channels = useMemo(() => {
    let cashIn = 0, cashOut = 0;
    let onepayIn = 0, onepayOut = 0;
    let ldbIn = 0, ldbOut = 0;

    // ຈາກ Transactions
    transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      const m = normalizeMethod(t.paymentMethod || t.method);
      if (t.type === 'income' || t.category === 'revenue') {
        if (m === 'cash') cashIn += amt;
        else if (m === 'onepay') onepayIn += amt;
        else if (m === 'ldb') ldbIn += amt;
      } else {
        if (m === 'cash') cashOut += amt;
        else if (m === 'onepay') onepayOut += amt;
        else if (m === 'ldb') ldbOut += amt;
      }
    });

    // ຈາກ Supplier Procurement
    supplierPrices.forEach(p => {
      const amt = Number(p.totalPriceLAK) || 0;
      const m = normalizeMethod(p.paymentMethod);
      if (m === 'cash') cashOut += amt;
      else if (m === 'onepay') onepayOut += amt;
      else if (m === 'ldb') ldbOut += amt;
    });

    return {
      cash: { in: cashIn, out: cashOut, net: cashIn - cashOut },
      onepay: { in: onepayIn, out: onepayOut, net: onepayIn - onepayOut },
      ldb: { in: ldbIn, out: ldbOut, net: ldbIn - ldbOut },
      totalNet: (cashIn + onepayIn + ldbIn) - (cashOut + onepayOut + ldbOut)
    };
  }, [transactions, supplierPrices]);

  return (
    <div className="p-4 sm:p-5 space-y-5 bg-slate-100/90 min-h-screen text-slate-800">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#001839]/5 text-[#001839] flex items-center justify-center border border-[#001839]/10">
            <FileText strokeWidth={1.4} className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-serif tracking-tight text-[#001839]">
                Executive Financial Audit & P&L
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-[#001839] text-white text-[8.5px] font-serif uppercase tracking-[0.2em]">
                Verified P&L
              </span>
            </div>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              ງົບດຸນ, ຕົ້ນທຶນ, ກຳໄລສຸດທິ, ROI ແລະ ກະແສເງິນສົດແຍກຊ່ອງທາງ
            </p>
          </div>
        </div>

        {/* Month Selector */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setCurrentDate(prev => subMonths(prev, 1))}
            className="p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-[#001839] border border-slate-200 cursor-pointer transition"
          >
            <ChevronLeft strokeWidth={1.4} className="w-4 h-4" />
          </button>
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 font-serif text-xs text-[#001839]">
            {LAO_MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
          </div>
          <button 
            onClick={() => setCurrentDate(prev => addMonths(prev, 1))}
            className="p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-[#001839] border border-slate-200 cursor-pointer transition"
          >
            <ChevronRight strokeWidth={1.4} className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Row 1: Core Financial Indicators (Gross, Net, ROI, Dividends) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        {/* Total Revenue */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Total Revenue</span>
          <h3 className="text-xl font-serif tracking-tight text-emerald-800">{Math.round(totalRevenue).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-slate-400">ລາຍຮັບລວມປະຈຳເດືອນ</span>
        </div>

        {/* COGS (Purchasing) */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Cost of Goods (COGS)</span>
          <h3 className="text-xl font-serif tracking-tight text-rose-800">{Math.round(totalCOGS).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-slate-400">ຕົ້ນທຶນວັດຖຸດິບ & ຈັດຊື້</span>
        </div>

        {/* Gross Profit & Margin */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Gross Profit</span>
            <span className="text-xs font-serif text-[#001839] font-bold">{grossMargin}%</span>
          </div>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">{Math.round(grossProfit).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-slate-400">ກຳໄລຂັ້ນຕົ້ນ</span>
        </div>

        {/* Operating Net Profit (ປອດໄພ ບໍ່ຖືກກະທົບໂດຍປັນຜົນ) */}
        <div className="p-4 bg-emerald-50/70 rounded-3xl border border-emerald-200/70 shadow-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-emerald-900 font-semibold">Net Operating Profit</span>
            <span className="text-xs font-serif text-emerald-800 font-bold">{netMargin}%</span>
          </div>
          <h3 className="text-xl font-serif tracking-tight text-emerald-900 font-semibold">{Math.round(netProfit).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-emerald-700/80">ກຳໄລສຸດທິ (OPEX: {Math.round(totalOPEX).toLocaleString()} ₭)</span>
        </div>

        {/* ROI % (Return on Investment) */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Return on Cost (ROI)</span>
            <Percent strokeWidth={1.4} className="w-3.5 h-3.5 text-[#001839]" />
          </div>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">{roi}%</h3>
          <span className="text-[10px] text-slate-400">ອັດຕາຜົນຕອບແທນທຶນ</span>
        </div>

      </div>

      {/* Row 2: Payment Channels Breakdown (Cash vs OnePay vs LDB) */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <div>
            <h3 className="text-sm font-serif uppercase tracking-wider text-[#001839] flex items-center gap-2">
              <Wallet strokeWidth={1.4} className="w-4 h-4 text-[#001839]" />
              <span>Payment Channel Liquidity Audit (ແຍກບັນຊີກະແສເງິນສົດ)</span>
            </h3>
            <p className="text-[11px] text-slate-400">ກວດສອບຍອດເງິນເຂົ້າ-ອອກ ຕົວຈິງແຕ່ລະຊ່ອງທາງໃນເດືອນນີ້</p>
          </div>
          <div className="px-3.5 py-1.5 bg-[#001839] text-white rounded-xl text-xs font-serif">
            Total Net: {Math.round(channels.totalNet).toLocaleString()} ₭
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* CASH Channel */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-serif uppercase tracking-wider text-[#001839] flex items-center gap-1.5 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-700" /> CASH (ເງິນສົດໃນຮ້ານ)
              </span>
              <span className="text-xs font-serif font-bold text-[#001839]">{Math.round(channels.cash.net).toLocaleString()} ₭</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200/60 font-mono">
              <div>
                <span className="text-[9px] text-slate-400 uppercase block font-serif">Inflow</span>
                <span className="text-emerald-700 font-bold">+{Math.round(channels.cash.in).toLocaleString()} ₭</span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-slate-400 uppercase block font-serif">Outflow</span>
                <span className="text-rose-700 font-bold">-{Math.round(channels.cash.out).toLocaleString()} ₭</span>
              </div>
            </div>
          </div>

          {/* BCEL ONEPAY Channel */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-serif uppercase tracking-wider text-[#001839] flex items-center gap-1.5 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-700" /> BCEL ONEPAY (ໂອນ)
              </span>
              <span className="text-xs font-serif font-bold text-[#001839]">{Math.round(channels.onepay.net).toLocaleString()} ₭</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200/60 font-mono">
              <div>
                <span className="text-[9px] text-slate-400 uppercase block font-serif">Inflow</span>
                <span className="text-emerald-700 font-bold">+{Math.round(channels.onepay.in).toLocaleString()} ₭</span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-slate-400 uppercase block font-serif">Outflow</span>
                <span className="text-rose-700 font-bold">-{Math.round(channels.onepay.out).toLocaleString()} ₭</span>
              </div>
            </div>
          </div>

          {/* LDB Channel */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-serif uppercase tracking-wider text-[#001839] flex items-center gap-1.5 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-700" /> ທະນາຄານ LDB
              </span>
              <span className="text-xs font-serif font-bold text-[#001839]">{Math.round(channels.ldb.net).toLocaleString()} ₭</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200/60 font-mono">
              <div>
                <span className="text-[9px] text-slate-400 uppercase block font-serif">Inflow</span>
                <span className="text-emerald-700 font-bold">+{Math.round(channels.ldb.in).toLocaleString()} ₭</span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-slate-400 uppercase block font-serif">Outflow</span>
                <span className="text-rose-700 font-bold">-{Math.round(channels.ldb.out).toLocaleString()} ₭</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Row 3: Dividend Settlement Status (ແຍກຕ່າງຫາກ) */}
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
              ຍອດປັນຜົນຖືກແຍກອອກຈາກຄ່າໃຊ້ຈ່າຍຮ້ານ (OPEX) ເຮັດໃຫ້ກຳໄລປະຈຳເດືອນຖືກຕ້ອງ 100%
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-serif uppercase text-amber-800 block">Total Dividends Settled</span>
          <span className="text-base font-serif font-bold text-amber-950">
            {Math.round(totalDividend).toLocaleString()} ₭
          </span>
        </div>
      </div>

    </div>
  );
}
