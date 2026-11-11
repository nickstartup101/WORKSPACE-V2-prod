import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Receipt, Plus, CheckCircle2, Clock, DollarSign, Store, User } from 'lucide-react';

export default function DebtLedger() {
  const [debts, setDebts] = useState<any[]>([]);
  const [debtType, setDebtType] = useState<'payable' | 'receivable'>('payable'); // AP ຫຼື AR
  const [creditorName, setCreditorName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'debts'), (snap) => {
      setDebts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const filteredDebts = useMemo(() => {
    return debts.filter(d => d.type === debtType);
  }, [debts, debtType]);

  const totalOutstanding = useMemo(() => {
    return filteredDebts
      .filter(d => !d.isSettled)
      .reduce((s, d) => s + (Number(d.amount) || 0), 0);
  }, [filteredDebts]);

  const handleCreateDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditorName || !amount) return;

    try {
      setSaving(true);
      await addDoc(collection(db, 'debts'), {
        type: debtType,
        creditorName: creditorName.trim(),
        amount: Number(amount.replace(/,/g, '')) || 0,
        dueDate: dueDate || '',
        note: note.trim(),
        isSettled: false,
        createdAt: serverTimestamp(),
      });
      setCreditorName('');
      setAmount('');
      setDueDate('');
      setNote('');
      alert('ບັນທຶກໜີ້ສິນສຳເລັດ!');
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSettled = async (id: string, current: boolean) => {
    await updateDoc(doc(db, 'debts', id), { isSettled: !current });
  };

  return (
    <div className="p-4 sm:p-5 space-y-5 bg-slate-100/90 min-h-screen text-slate-800">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#001839]/5 text-[#001839] flex items-center justify-center border border-[#001839]/10">
            <Receipt strokeWidth={1.4} className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-serif tracking-tight text-[#001839]">
                Accounts Payable & Receivable
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-[#001839] text-white text-[8.5px] font-serif uppercase tracking-[0.2em]">
                AP / AR Ledger
              </span>
            </div>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              ຈັດການໜີ້ຕ້ອງສົ່ງໃຫ້ຮ້ານຄ້າ ແລະ ໜີ້ຕ້ອງຮັບຈາກລູກຄ້າ
            </p>
          </div>
        </div>

        {/* Type Toggle */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/60">
          <button
            onClick={() => setDebtType('payable')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
              debtType === 'payable' ? 'bg-[#001839] text-white shadow-xs font-semibold' : 'text-slate-600'
            }`}
          >
            ໜີ້ຕ້ອງສົ່ງ (AP)
          </button>
          <button
            onClick={() => setDebtType('receivable')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
              debtType === 'receivable' ? 'bg-[#001839] text-white shadow-xs font-semibold' : 'text-slate-600'
            }`}
          >
            ໜີ້ຕ້ອງຮັບ (AR)
          </button>
        </div>
      </div>

      {/* Grid: Form on Left + Ledger on Right */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        
        {/* Form Entry */}
        <div className="xl:col-span-4 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <h3 className="text-sm font-serif uppercase tracking-wider text-[#001839]">
            {debtType === 'payable' ? 'ບັນທຶກໜີ້ຕ້ອງສົ່ງໃໝ່' : 'ບັນທຶກໜີ້ຕ້ອງຮັບໃໝ່'}
          </h3>

          <form onSubmit={handleCreateDebt} className="space-y-3">
            <div>
              <label className="text-[10px] font-serif uppercase tracking-wider text-[#001839] block mb-1">
                {debtType === 'payable' ? 'Supplier / ເຈົ້າໜີ້' : 'Customer / ລູກໜີ້'}
              </label>
              <input
                type="text"
                required
                placeholder="ຊື່ຮ້ານຄ້າ ຫຼື ຊື່ບຸກຄົນ..."
                value={creditorName}
                onChange={e => setCreditorName(e.target.value)}
                className="w-full h-8.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-[#001839] outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-serif uppercase tracking-wider text-[#001839] block mb-1">ຈຳນວນເງິນ (LAK)</label>
              <input
                type="text"
                required
                placeholder="0"
                value={amount}
                onChange={e => setAmount(Number(e.target.value.replace(/,/g, '') || 0).toLocaleString())}
                className="w-full h-8.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-medium text-[#001839] outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-serif uppercase tracking-wider text-[#001839] block mb-1">ກຳນົດຊຳລະ (Due Date)</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full h-8.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-[#001839] outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-serif uppercase tracking-wider text-[#001839] block mb-1">ໝາຍເຫດ</label>
              <input
                type="text"
                placeholder="ລາຍລະອຽດໜີ້ສິນ..."
                value={note}
                onChange={e => setNote(e.target.value)}
                className="w-full h-8.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-[#001839] outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full h-10 bg-[#001839] hover:bg-[#00285d] text-white rounded-xl text-xs font-serif uppercase tracking-widest transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer mt-2"
            >
              <Plus strokeWidth={1.4} className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'ບັນທຶກລາຍການ'}</span>
            </button>
          </form>
        </div>

        {/* Table View */}
        <div className="xl:col-span-8 bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center">
            <div>
              <h3 className="text-sm font-serif uppercase tracking-wider text-[#001839]">
                {debtType === 'payable' ? 'Active Payables Ledger' : 'Active Receivables Ledger'}
              </h3>
              <span className="text-xs text-slate-400">
                ຍອດຄ້າງຊຳລະລວມ: <strong className="text-rose-800 font-serif text-sm">{Math.round(totalOutstanding).toLocaleString()} ₭</strong>
              </span>
            </div>
            <span className="text-xs font-serif text-slate-400">{filteredDebts.length} ລາຍການ</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-serif uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="p-3 pl-4">Creditor / Debtor</th>
                  <th className="p-3">Due Date</th>
                  <th className="p-3">Note</th>
                  <th className="p-3 text-right">Amount (LAK)</th>
                  <th className="p-3 text-center pr-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDebts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 font-serif">ບໍ່ມີລາຍການໜີ້ສິນ</td>
                  </tr>
                ) : (
                  filteredDebts.map(d => (
                    <tr key={d.id} className="hover:bg-slate-50/60 transition">
                      <td className="p-3 pl-4 font-medium text-[#001839]">{d.creditorName}</td>
                      <td className="p-3 font-mono text-slate-500">{d.dueDate || '-'}</td>
                      <td className="p-3 text-slate-400">{d.note || '-'}</td>
                      <td className="p-3 text-right font-serif font-semibold text-rose-800">
                        {Math.round(Number(d.amount || 0)).toLocaleString()} ₭
                      </td>
                      <td className="p-3 text-center pr-4">
                        <button
                          onClick={() => handleToggleSettled(d.id, d.isSettled)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-serif uppercase tracking-wider cursor-pointer transition ${
                            d.isSettled 
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                              : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {d.isSettled ? 'ຊຳລະແລ້ວ' : 'ຄ້າງຊຳລະ'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
}
