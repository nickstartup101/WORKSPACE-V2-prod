import React, { useState } from 'react';
import { 
  TrendingUp, TrendingDown, Percent, ArrowUpRight, 
  Wallet, Building2, CreditCard, Sparkles, Activity
} from 'lucide-react';

export default function Dashboard() {
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'month' | 'prev_month'>('all');

  return (
    <div className="p-4 sm:p-5 space-y-5 bg-slate-100/90 min-h-screen text-slate-800">
      
      {/* Executive Header Bar */}
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
              <span className="px-2 py-0.5 rounded-full bg-[#001839]/5 text-[#001839] text-[9px] font-serif uppercase tracking-widest">
                ສາຂາ 1
              </span>
            </div>
            <p className="text-[10px] font-serif tracking-widest text-slate-400 uppercase mt-0.5">
              Live Real-Time Data Connected
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/60">
          <button
            onClick={() => setFilterPeriod('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
              filterPeriod === 'all' 
                ? 'bg-[#001839] text-white shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ທັງໝົດ (All-Time)
          </button>
          <button
            onClick={() => setFilterPeriod('month')}
            className={`px-3 py-1.5 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
              filterPeriod === 'month' 
                ? 'bg-[#001839] text-white shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ເດືອນນີ້
          </button>
          <button
            onClick={() => setFilterPeriod('prev_month')}
            className={`px-3 py-1.5 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
              filterPeriod === 'prev_month' 
                ? 'bg-[#001839] text-white shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ເດືອນກ່ອນ
          </button>
        </div>
      </div>

      {/* Row 1: KPI Cards (Editorial Tones - ບໍ່ມີສີສະທ້ອນແສງ) */}
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
              988,680,004 ₭
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
              494,669,591 ₭
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
              50.0%
            </h3>
            <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">ອັດຕາກຳໄລຂັ້ນຕົ້ນ</span>
          </div>
        </div>

        {/* Net Profit (Card ໂທນອ່ອນແບບ Luxury) */}
        <div className="p-4 bg-emerald-50/70 rounded-3xl border border-emerald-200/70 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-serif uppercase tracking-[0.18em] text-emerald-900 font-semibold">Net Profit</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-800 text-white flex items-center justify-center">
              <ArrowUpRight strokeWidth={1.4} className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-serif tracking-tight text-emerald-900 font-semibold">
              311,302,001 ₭
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
              182,708,412 ₭
            </h3>
            <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">ຄ່າເຊົ່າ, ເງິນເດືອນ, ບໍລິຫານ</span>
          </div>
        </div>

      </div>

      {/* Row 2: Cash Breakdown (Minimalist Monochrome & Slate) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        
        {/* Total Net Cashflow */}
        <div className="p-4 bg-[#001839] text-white rounded-3xl shadow-xs flex flex-col justify-between space-y-2">
          <span className="text-[9.5px] font-serif uppercase tracking-[0.2em] text-white/60">Total Net Cashflow</span>
          <h3 className="text-2xl font-serif tracking-tight">311,302,001 ₭</h3>
          <span className="text-[10px] text-white/40">ຍອດເງິນສົດໝູນວຽນທັງໝົດ</span>
        </div>

        {/* Cash Card */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-700" /> CASH (ເງິນສົດໃນຮ້ານ)
            </span>
          </div>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">171,069,336 ₭</h3>
          <span className="text-[10px] text-slate-400">ເງິນສົດຕົວຈິງໃນລີ້ນຊັກ</span>
        </div>

        {/* BCEL OnePay */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-700" /> BCEL ONEPAY
            </span>
          </div>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">130,498,665 ₭</h3>
          <span className="text-[10px] text-slate-400">ບັນຊີ OnePay ຫຼັກ</span>
        </div>

        {/* LDB Bank */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-600" /> ທະນາຄານ LDB
            </span>
          </div>
          <h3 className="text-xl font-serif tracking-tight text-[#001839]">9,734,000 ₭</h3>
          <span className="text-[10px] text-slate-400">ບັນຊີສຳຮອງ LDB Trust</span>
        </div>

      </div>

      {/* Row 3: 7-Day Cashflow Chart (ປ່ຽນເປັນໂທນສີກົມມະທ່າຫຼູຫຼາ) */}
      <div className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-serif uppercase tracking-wider text-[#001839]">
            ກະແສເງິນສົດ 7 ວັນລ່າສຸດ (7-Day Cashflow Dynamics)
          </h3>
          <span className="text-[10px] font-serif text-slate-400 uppercase">Unit: LAK (ກີບ)</span>
        </div>

        {/* Chart Visualization Area */}
        <div className="h-56 w-full flex items-end justify-between gap-4 pt-6 pb-2 px-2 border-b border-slate-100">
          {[
            { date: '05/11', height: '85%', val: '24.5M' },
            { date: '06/11', height: '0%', val: '0' },
            { date: '07/11', height: '0%', val: '0' },
            { date: '08/11', height: '0%', val: '0' },
            { date: '09/11', height: '0%', val: '0' },
            { date: '10/11', height: '0%', val: '0' },
            { date: '11/11', height: '0%', val: '0' },
          ].map((bar, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
              <div className="w-full max-w-[50px] bg-slate-50 rounded-t-xl h-full flex items-end justify-center p-1">
                {bar.height !== '0%' ? (
                  <div 
                    style={{ height: bar.height }} 
                    className="w-full bg-[#001839] rounded-t-lg transition-all group-hover:bg-[#00285d] shadow-xs"
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
