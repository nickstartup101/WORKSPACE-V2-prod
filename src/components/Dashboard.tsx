import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { 
  TrendingUp, TrendingDown, Percent, ArrowUpRight, 
  Activity, Wallet, CreditCard, Building2, Calendar
} from 'lucide-react';
import { format, subDays, subMonths } from 'date-fns';

const normalizeMethod = (method: string = ''): 'cash' | 'onepay' | 'ldb' => {
  const m = method.toLowerCase();
  if (m.includes('onepay') || m.includes('bcel') || m.includes('ໂອນ')) return 'onepay';
  if (m.includes('ldb')) return 'ldb';
  return 'cash';
};

export default function Dashboard() {
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'month' | 'prev_month'>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [transactions, setTransactions] = useState<any[]>([]);

  // ດຶງຂໍ້ມູນຈາກ Cashflow (transactions) ບ່ອນດຽວ 100%
  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(collection(db, 'transactions'), (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

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

  // 1. Core KPIs ຄິດໄລ່ຈາກ Cashflow
  const totalRevenue = useMemo(() => {
    return filteredTx
      .filter(t => t.type === 'income' || t.category === 'revenue' || t.category === 'sales')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [filteredTx]);

  const totalCOGS = useMemo(() => {
    return filteredTx
      .filter(t => t.type === 'expense' && (t.category === 'purchasing' || t.category === 'cogs'))
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [filteredTx]);

  const totalOPEX = useMemo(() => {
    return filteredTx
      .filter(t => t.type === 'expense' && t.category !== 'purchasing' && t.category !== 'cogs' && t.category !== 'dividend' && t.category !== 'ປັນຜົນ')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [filteredTx]);

  const grossProfit = totalRevenue - totalCOGS;
  const grossMargin = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0.0';
  const netProfit = totalRevenue - (totalCOGS + totalOPEX);

  // 2. ຍອດເງິນ Cash, OnePay, LDB ດຶງຈາກ Cashflow ໂດຍກົງ
  const channelTotals = useMemo(() => {
    let cashIn = 0, cashOut = 0;
    let onepayIn = 0, onepayOut = 0;
    let ldbIn = 0, ldbOut = 0;

    filteredTx.forEach(t => {
      const amt = Number(t.amount) || 0;
      const m = normalizeMethod(t.paymentMethod || t.method);
      if (t.type === 'income' || t.category === 'revenue' || t.category === 'sales') {
        if (m === 'cash') cashIn += amt;
        else if (m === 'onepay') onepayIn += amt;
        else if (m === 'ldb') ldbIn += amt;
      } else {
        if (m === 'cash') cashOut += amt;
        else if (m === 'onepay') onepayOut += amt;
        else if (m === 'ldb') ldbOut += amt;
      }
    });

    return {
      cashNet: cashIn - cashOut,
      onepayNet: onepayIn - onepayOut,
      ldbNet: ldbIn - ldbOut,
      totalNet: (cashIn + onepayIn + ldbIn) - (cashOut + onepayOut + ldbOut)
    };
  }, [filteredTx]);

  // 3. 7-Day Dynamics ຈາກ Cashflow
  const last7DaysData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateKey = format(d, 'yyyy-MM-dd');
      const label = format(d, 'dd/MM');

      const dayInc = transactions
        .filter(t => (t.date || '').startsWith(dateKey) && (t.type === 'income' || t.category === 'revenue' || t.category === 'sales'))
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
              <span className="px-2 py-0.5 rounded-full bg-[#001839]/5 text-[#001839] text-[9px] font-serif uppercase tracking-widest font-semibold">
                ສາຂາ 1
              </span>
            </div>
            <p className="text-[10px] font-serif tracking-widest text-slate-400 uppercase mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Cashflow Single-Source Connected ({filteredTx.length} Records)
            </p>
          </div>
        </div>

        {/* Period Pills */}
        <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/60">
          <button
            onClick={() => setFilterPeriod('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
              filterPeriod === 'all' ? 'bg-[#001839] text-white shadow-xs font-semibold' : 'text-slate-600'
            }`}
          >
            ທັງໝົດ (All-Time)
          </button>
          <button
            onClick={() => setFilterPeriod('month')}
            className={`px-3 py-1.5 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
              filterPeriod === 'month' ? 'bg-[#001839] text-white shadow-xs font-semibold' : 'text-slate-600'
            }`}
          >
            ເດືອນນີ້
          </button>
          <button
            onClick={() => setFilterPeriod('prev_month')}
            className={`px-3 py-1.5 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
              filterPeriod === 'prev_month' ? 'bg-[#001839] text-white shadow-xs font-semibold' : 'text-slate-600'
            }`}
          >
            ເດືອນກ່ອນ
          </button>
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Total Revenue</span>
          <h3 className="text-xl font-serif tracking-tight text-emerald-800">{Math.round(totalRevenue).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-slate-400">ຍອດຂາຍລວມຈາກ Cashflow</span>
        </div>

        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Purchasing (COGS)</span>
          <h3 className="text-xl font-serif tracking-tight text-rose-800">{Math.round(totalCOGS).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-slate-400">ຕົ້ນທຶນຈັດຊື້ & ວັດຖຸດິບ</span>
        </div>

        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Gross Margin</span>
            <span className="text-xs font-serif text-[#001839] font-bold">{grossMargin}%</span>
          </div>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">{Math.round(grossProfit).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-slate-400">ກຳໄລຂັ້ນຕົ້ນ</span>
        </div>

        <div className="p-4 bg-emerald-50/70 rounded-3xl border border-emerald-200/70 shadow-xs space-y-2">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-emerald-900 font-semibold">Operating Net Profit</span>
          <h3 className="text-xl font-serif tracking-tight text-emerald-900 font-semibold">{Math.round(netProfit).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-emerald-700/80">ກຳໄລສຸດທິ (OPEX: {Math.round(totalOPEX).toLocaleString()} ₭)</span>
        </div>

        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400">Operational OPEX</span>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">{Math.round(totalOPEX).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-slate-400">ຄ່າເຊົ່າ, ເງິນເດືອນ, ບໍລິຫານ</span>
        </div>

      </div>

      {/* Row 2: ຍອດເງິນແຍກຊ່ອງທາງ (Cash vs OnePay vs LDB) ຈາກ Cashflow */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 bg-[#001839] text-white rounded-3xl shadow-xs space-y-1.5">
          <span className="text-[9.5px] font-serif uppercase tracking-[0.2em] text-white/60">Total Net Cashflow</span>
          <h3 className="text-2xl font-serif tracking-tight">{Math.round(channelTotals.totalNet).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-white/40">ເງິນສົດ & ເງິນຝາກທຸກບັນຊີລວມກັນ</span>
        </div>

        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-1.5">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-700" /> CASH (ເງິນສົດໃນຮ້ານ)
          </span>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">{Math.round(channelTotals.cashNet).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-slate-400">ຍອດເງິນສົດສຸດທິຈາກ Cashflow</span>
        </div>

        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-1.5">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
            <span className="w-2 h-2 rounded-full bg-rose-700" /> BCEL ONEPAY (ໂອນ)
          </span>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">{Math.round(channelTotals.onepayNet).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-slate-400">ຍອດເງິນໂອນ OnePay ສຸດທິ</span>
        </div>

        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-1.5">
          <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
            <span className="w-2 h-2 rounded-full bg-blue-700" /> ທະນາຄານ LDB
          </span>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">{Math.round(channelTotals.ldbNet).toLocaleString()} ₭</h3>
          <span className="text-[10px] text-slate-400">ຍອດເງິນໂອນ LDB ສຸດທິ</span>
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
