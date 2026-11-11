import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { 
  TrendingUp, TrendingDown, Percent, ArrowUpRight, 
  Activity, Wallet, CreditCard, Building2, Calendar, RefreshCw
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';

export default function Dashboard() {
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'month' | 'prev_month'>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);

  // 1. Real-time Listeners
  useEffect(() => {
    setLoading(true);

    const unsubTx = onSnapshot(collection(db, 'transactions'), (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubSp = onSnapshot(collection(db, 'supplierPrices'), (snap) => {
      setSupplierPrices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => {
      unsubTx();
      unsubSp();
    };
  }, []);

  // 2. Filter ຕາມຊ່ວງເວລາ (All-Time, ເດືອນນີ້, ເດືອນກ່ອນ)
  const currentMonthStr = useMemo(() => format(new Date(), 'yyyy-MM'), []);
  const prevMonthStr = useMemo(() => format(subMonths(new Date(), 1), 'yyyy-MM'), []);

  const filteredTx = useMemo(() => {
    if (filterPeriod === 'month') {
      return transactions.filter(t => (t.date || '').startsWith(currentMonthStr));
    }
    if (filterPeriod === 'prev_month') {
      return transactions.filter(t => (t.date || '').startsWith(prevMonthStr));
    }
    return transactions;
  }, [transactions, filterPeriod, currentMonthStr, prevMonthStr]);

  const filteredSp = useMemo(() => {
    if (filterPeriod === 'month') {
      return supplierPrices.filter(p => (p.date || '').startsWith(currentMonthStr));
    }
    if (filterPeriod === 'prev_month') {
      return supplierPrices.filter(p => (p.date || '').startsWith(prevMonthStr));
    }
    return supplierPrices;
  }, [supplierPrices, filterPeriod, currentMonthStr, prevMonthStr]);

  // 3. ຄິດໄລ່ຕົວເລກການເງິນຕົວຈິງ
  const totalRevenue = useMemo(() => {
    return filteredTx
      .filter(t => t.type === 'income' || t.category === 'revenue' || t.category === 'sales')
      .reduce((sum, t) => sum + (Number(t.amount) || Number(t.total) || 0), 0);
  }, [filteredTx]);

  const totalCOGS = useMemo(() => {
    const fromSupplier = filteredSp.reduce((sum, p) => sum + (Number(p.totalPriceLAK) || 0), 0);
    const fromTx = filteredTx
      .filter(t => t.type === 'expense' && (t.category === 'purchasing' || t.category === 'cogs'))
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    return fromSupplier > 0 ? fromSupplier : fromTx;
  }, [filteredSp, filteredTx]);

  const totalOPEX = useMemo(() => {
    return filteredTx
      .filter(t => t.type === 'expense' && t.category !== 'purchasing' && t.category !== 'cogs' && t.category !== 'dividend')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [filteredTx]);

  const grossProfit = totalRevenue - totalCOGS;
  const grossMargin = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0.0';
  const netProfit = totalRevenue - (totalCOGS + totalOPEX);

  // 4. ແຍກຊ່ອງທາງເງິນສົດ & ທະນາຄານ
  const cashTotal = useMemo(() => {
    const inc = filteredTx.filter(t => (t.type === 'income' || t.category === 'revenue') && (t.paymentMethod === 'Cash' || t.paymentMethod === 'ເງິນສົດ')).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const exp = filteredTx.filter(t => t.type === 'expense' && (t.paymentMethod === 'Cash' || t.paymentMethod === 'ເງິນສົດ')).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return inc - exp;
  }, [filteredTx]);

  const onepayTotal = useMemo(() => {
    const inc = filteredTx.filter(t => (t.type === 'income' || t.category === 'revenue') && (t.paymentMethod === 'Onepay' || t.paymentMethod === 'BCEL OnePay' || t.paymentMethod === 'ໂອນ')).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const exp = filteredTx.filter(t => t.type === 'expense' && (t.paymentMethod === 'Onepay' || t.paymentMethod === 'BCEL OnePay' || t.paymentMethod === 'ໂອນ')).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return inc - exp;
  }, [filteredTx]);

  const ldbTotal = useMemo(() => {
    const inc = filteredTx.filter(t => (t.type === 'income' || t.category === 'revenue') && (t.paymentMethod === 'LDB' || t.paymentMethod === 'LDB Trust')).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const exp = filteredTx.filter(t => t.type === 'expense' && (t.paymentMethod === 'LDB' || t.paymentMethod === 'LDB Trust')).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return inc - exp;
  }, [filteredTx]);

  const totalNetCashflow = cashTotal + onepayTotal + ldbTotal;

  // 5. ຄິດໄລ່ກະແສເງິນສົດ 7 ວັນລ່າສຸດຕົວຈິງ (Dynamic 7-Day Dynamics)
  const last7DaysData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateKey = format(d, 'yyyy-MM-dd');
      const label = format(d, 'dd/MM');

      const dayIncome = transactions
        .filter(t => (t.date || '').startsWith(dateKey) && (t.type === 'income' || t.category === 'revenue'))
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);

      const dayExpense = transactions
        .filter(t => (t.date || '').startsWith(dateKey) && t.type === 'expense')
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);

      days.push({
        date: label,
        net: dayIncome - dayExpense,
        income: dayIncome
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
          <div className="w-10 h-10 rounded-2xl bg-[#001839]/5 text-[#001839] flex items-center justify-center border border-[#001839]/10 shadow-xs">
            <Activity strokeWidth={1.4} className="w-5 h-5 text-[#001839]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-serif tracking-tight text-[#001839] uppercase">
                Executive Dashboard
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-[#001839]/5 text-[#001839] text-[9px] font-serif uppercase tracking-widest font-semibold">
                ສາຂາ 1
              </span>
            </div>
            <p className="text-[10px] font-serif tracking-widest text-slate-400 uppercase mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Real-Time Data Connected ({transactions.length} Transactions)
            </p>
          </div>
        </div>

        {/* Filter Period Pills */}
        <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/60">
          <button
            onClick={() => setFilterPeriod('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
              filterPeriod === 'all' 
                ? 'bg-[#001839] text-white shadow-xs font-semibold' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ທັງໝົດ (All-Time)
          </button>
          <button
            onClick={() => setFilterPeriod('month')}
            className={`px-3 py-1.5 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
              filterPeriod === 'month' 
                ? 'bg-[#001839] text-white shadow-xs font-semibold' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ເດືອນນີ້
          </button>
          <button
            onClick={() => setFilterPeriod('prev_month')}
            className={`px-3 py-1.5 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
              filterPeriod === 'prev_month' 
                ? 'bg-[#001839] text-white shadow-xs font-semibold' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ເດືອນກ່ອນ
          </button>
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        {/* Total Revenue */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-serif uppercase tracking-[0.18em] text-slate-400">Total Revenue</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center">
              <TrendingUp strokeWidth={1.4} className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-serif tracking-tight text-emerald-800">
              {Math.round(totalRevenue).toLocaleString()} ₭
            </h3>
            <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">ຍອດຂາຍລວມສະສົມ</span>
          </div>
        </div>

        {/* Purchasing (COGS) */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-serif uppercase tracking-[0.18em] text-slate-400">Purchasing (COGS)</span>
            <div className="w-6 h-6 rounded-lg bg-rose-50 text-rose-800 flex items-center justify-center">
              <TrendingDown strokeWidth={1.4} className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-serif tracking-tight text-rose-800">
              {Math.round(totalCOGS).toLocaleString()} ₭
            </h3>
            <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">ຕົ້ນທຶນສິນຄ້າ ແລະ ວັດຖຸດິບ</span>
          </div>
        </div>

        {/* Gross Margin */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-serif uppercase tracking-[0.18em] text-slate-400">Gross Margin</span>
            <div className="w-6 h-6 rounded-lg bg-slate-100 text-[#001839] flex items-center justify-center">
              <Percent strokeWidth={1.4} className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-serif tracking-tight text-[#001839]">
              {grossMargin}%
            </h3>
            <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">ອັດຕາກຳໄລຂັ້ນຕົ້ນ</span>
          </div>
        </div>

        {/* Net Profit */}
        <div className="p-4 bg-emerald-50/70 rounded-3xl border border-emerald-200/70 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-serif uppercase tracking-[0.18em] text-emerald-900 font-semibold">Net Profit</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-800 text-white flex items-center justify-center">
              <ArrowUpRight strokeWidth={1.4} className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-serif tracking-tight text-emerald-900 font-semibold">
              {Math.round(netProfit).toLocaleString()} ₭
            </h3>
            <span className="text-[10px] text-emerald-700/80 font-sans mt-0.5 block">ກຳໄລສຸດທິຫຼັງຫັກລາຍຈ່າຍ</span>
          </div>
        </div>

        {/* OPEX */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-serif uppercase tracking-[0.18em] text-slate-400">OPEX (ຄ່າດຳເນີນງານ)</span>
            <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
              <Activity strokeWidth={1.4} className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-serif tracking-tight text-[#001839]">
              {Math.round(totalOPEX).toLocaleString()} ₭
            </h3>
            <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">ຄ່າເຊົ່າ, ເງິນເດືອນ, ບໍລິຫານ</span>
          </div>
        </div>

      </div>

      {/* Row 2: Cash Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 bg-[#001839] text-white rounded-3xl shadow-xs flex flex-col justify-between space-y-2">
          <span className="text-[9.5px] font-serif uppercase tracking-[0.2em] text-white/60">Total Net Cashflow</span>
          <h3 className="text-2xl font-serif tracking-tight">{Math.round(totalNetCashflow).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-white/40 font-sans">ຍອດເງິນສົດໝູນວຽນທັງໝົດ</span>
        </div>

        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-2">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-700" /> CASH (ເງິນສົດໃນຮ້ານ)
          </span>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">{Math.round(cashTotal).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-slate-400 font-sans">ເງິນສົດຕົວຈິງໃນລີ້ນຊັກ</span>
        </div>

        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-2">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-700" /> BCEL ONEPAY
          </span>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">{Math.round(onepayTotal).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-slate-400 font-sans">ບັນຊີ OnePay ຫຼັກ</span>
        </div>

        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-2">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-600" /> ທະນາຄານ LDB
          </span>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">{Math.round(ldbTotal).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-slate-400 font-sans">ບັນຊີສຳຮອງ LDB Trust</span>
        </div>
      </div>

      {/* Row 3: 7-Day Cashflow Dynamics (Real 7-Day Data) */}
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
                    style={{ height: `${Math.max(bar.heightPercent, 10)}%` }} 
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
