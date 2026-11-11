import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { 
  FileText, Download, Calendar, ChevronLeft, ChevronRight, 
  TrendingUp, TrendingDown, DollarSign, Wallet, ArrowUpRight
} from 'lucide-react';
import { format, subMonths, addMonths } from 'date-fns';
import * as XLSX from 'xlsx';

export default function FinanceReport() {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const selectedMonth = useMemo(() => format(currentDate, 'yyyy-MM'), [currentDate]);
  const [loading, setLoading] = useState<boolean>(true);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    setLoading(true);
    const start = selectedMonth + '-01';
    const end = selectedMonth + '-31';

    const qTx = query(
      collection(db, 'transactions'),
      where('date', '>=', start),
      where('date', '<=', end)
    );

    const unsub = onSnapshot(qTx, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => {
      onSnapshot(collection(db, 'transactions'), (fallback) => {
        const docs = fallback.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((t: any) => (t.date || '').startsWith(selectedMonth));
        setTransactions(docs);
        setLoading(false);
      });
    });

    return () => unsub();
  }, [selectedMonth]);

  const revenue = useMemo(() => {
    return transactions
      .filter(t => t.type === 'income' || t.category === 'revenue')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  }, [transactions]);

  const expenses = useMemo(() => {
    return transactions
      .filter(t => t.type === 'expense' && t.category !== 'dividend')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  }, [transactions]);

  const netBalance = revenue - expenses;

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
                Financial Statement & Ledger
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-[#001839] text-white text-[8.5px] font-serif uppercase tracking-[0.2em]">
                Monthly Audit
              </span>
            </div>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              ລາຍງານງົບດຸນປະຈຳເດືອນ <span className="font-serif">{selectedMonth}</span> ({transactions.length} ລາຍການ)
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
            {format(currentDate, 'MMMM yyyy')}
          </div>
          <button 
            onClick={() => setCurrentDate(prev => addMonths(prev, 1))}
            className="p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-[#001839] border border-slate-200 cursor-pointer transition"
          >
            <ChevronRight strokeWidth={1.4} className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <span className="text-[10px] font-serif uppercase tracking-wider text-slate-400">Total Monthly Revenue</span>
          <h3 className="text-2xl font-serif tracking-tight text-emerald-800">{Math.round(revenue).toLocaleString()} ₭</h3>
          <span className="text-xs text-slate-400 font-sans">ລາຍຮັບທັງໝົດໃນເດືອນ</span>
        </div>

        <div className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <span className="text-[10px] font-serif uppercase tracking-wider text-slate-400">Total Monthly Expenses</span>
          <h3 className="text-2xl font-serif tracking-tight text-rose-800">{Math.round(expenses).toLocaleString()} ₭</h3>
          <span className="text-xs text-slate-400 font-sans">ລາຍຈ່າຍທັງໝົດ (ຕັດປັນຜົນອອກ)</span>
        </div>

        <div className="p-5 bg-[#001839] text-white rounded-3xl shadow-xs space-y-2">
          <span className="text-[10px] font-serif uppercase tracking-[0.2em] text-white/60">Net Monthly Profit</span>
          <h3 className="text-2xl font-serif tracking-tight">{Math.round(netBalance).toLocaleString()} ₭</h3>
          <span className="text-xs text-white/40 font-sans">ກຳໄລສຸດທິປະຈຳເດືອນ</span>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-sm font-serif uppercase tracking-wider text-[#001839]">Transaction Records</h3>
          <span className="text-xs font-serif text-slate-400">{transactions.length} Records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-serif uppercase tracking-wider text-slate-400">
              <tr>
                <th className="p-3 pl-4">Date</th>
                <th className="p-3">Title / Description</th>
                <th className="p-3">Category</th>
                <th className="p-3">Payment</th>
                <th className="p-3 text-right pr-4">Amount (LAK)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 font-serif">No transactions found for this month</td>
                </tr>
              ) : (
                transactions.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/60 transition">
                    <td className="p-3 pl-4 font-mono text-slate-500">{t.date}</td>
                    <td className="p-3 font-medium text-[#001839]">{t.title || t.remark || 'Transaction'}</td>
                    <td className="p-3 font-serif uppercase text-[10px] text-slate-500">{t.category || '-'}</td>
                    <td className="p-3 font-serif text-[11px] text-slate-600">{t.paymentMethod || 'Cash'}</td>
                    <td className={`p-3 pr-4 text-right font-serif text-xs font-semibold ${t.type === 'income' ? 'text-emerald-800' : 'text-rose-800'}`}>
                      {t.type === 'income' ? '+' : '-'}{Math.round(Number(t.amount || 0)).toLocaleString()} ₭
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
