import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { 
  Lock, KeyRound, Shield, CheckCircle2, XCircle, ArrowUpRight, 
  TrendingUp, TrendingDown, Wallet, CreditCard, Building2, Plus, 
  Trash2, Eye, EyeOff, ShieldCheck, DollarSign
} from 'lucide-react';
import { format } from 'date-fns';

export default function Financials() {
  // Security PIN State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');

  // Transactions State
  const [transactions, setTransactions] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [category, setCategory] = useState('sales');
  const [paymentMethod, setPaymentMethod] = useState('Onepay');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);

  // Approval Modal
  const [approvingTx, setApprovingTx] = useState<any | null>(null);
  const [approvalPin, setApprovalPin] = useState('');
  const [approvalError, setApprovalError] = useState('');

  // ດຶງ PIN ຈາກ LocalStorage ຫຼື ຄ່າ Default '1234'
  const savedCashflowPin = localStorage.getItem('cashflow_pin') || '1234';
  const savedApprovalPin = localStorage.getItem('approval_pin') || '1234';

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'transactions'), (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (enteredPin === savedCashflowPin) {
      setIsAuthenticated(true);
      setPinError('');
    } else {
      setPinError('ລະຫັດ PIN ບໍ່ຖືກຕ້ອງ! ກະລຸນາລອງໃໝ່');
      setEnteredPin('');
    }
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = Number(amount.replace(/,/g, ''));
    if (!title || !numAmt) return;

    try {
      setSaving(true);
      // ຖ້າຍອດເກີນ 5 ລ້ານກີບ ໃຫ້ຕັ້ງສະຖານະເປັນ Pending Approval
      const requiresApproval = type === 'expense' && numAmt >= 5000000;

      await addDoc(collection(db, 'transactions'), {
        title: title.trim(),
        amount: numAmt,
        type,
        category,
        paymentMethod,
        date,
        isApproved: !requiresApproval,
        createdAt: serverTimestamp(),
      });

      setTitle('');
      setAmount('');
      alert(requiresApproval ? 'ບັນທຶກແລ້ວ! ລາຍຈ່າຍນີ້ເກີນ 5,000,000 ₭ ຕ້ອງລໍຖ້າອະນຸມັດ.' : 'ບັນທຶກລາຍການສຳເລັດ!');
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleApproveTransaction = async () => {
    if (approvalPin !== savedApprovalPin) {
      setApprovalError('ລະຫັດອະນຸມັດບໍ່ຖືກຕ້ອງ!');
      return;
    }
    if (approvingTx) {
      await updateDoc(doc(db, 'transactions', approvingTx.id), {
        isApproved: true,
        approvedAt: serverTimestamp()
      });
      setApprovingTx(null);
      setApprovalPin('');
      setApprovalError('');
    }
  };

  // 1. ໜ້າຈໍຖາມລະຫັດ PIN ເຂົ້າ Cashflow (Security Gate)
  if (!isAuthenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="bg-white p-7 sm:p-8 rounded-3xl border border-slate-200/80 shadow-lg max-w-sm w-full text-center space-y-4">
          <div className="w-14 h-14 bg-[#001839]/5 text-[#001839] rounded-2xl flex items-center justify-center mx-auto border border-[#001839]/10">
            <Lock strokeWidth={1.4} className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-serif text-[#001839] uppercase tracking-wider">
              Protected Cashflow Area
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              ກະລຸນາປ້ອນລະຫັດ PIN ເພື່ອເຂົ້າເບິ່ງ ແລະ ບັນທຶກກະແສເງິນສົດ
            </p>
          </div>

          <form onSubmit={handleVerifyPin} className="space-y-3">
            <input
              type="password"
              maxLength={6}
              autoFocus
              placeholder="••••"
              value={enteredPin}
              onChange={e => setEnteredPin(e.target.value)}
              className="w-full h-12 text-center text-2xl font-mono tracking-[0.4em] bg-slate-50 border border-slate-200 rounded-2xl text-[#001839] outline-none focus:border-[#001839]"
            />
            {pinError && <p className="text-xs text-rose-600 font-medium">{pinError}</p>}

            <button
              type="submit"
              className="w-full h-11 bg-[#001839] hover:bg-[#00285d] text-white rounded-xl text-xs font-serif uppercase tracking-widest cursor-pointer transition shadow-xs"
            >
              Verify PIN
            </button>
            <p className="text-[10px] text-slate-400 font-mono">Default PIN: 1234 (ປ່ຽນໄດ້ໃນ Settings)</p>
          </form>
        </div>
      </div>
    );
  }

  // 2. ໜ້າຕາ Cashflow ຕົວຈິງຫຼັງຈາກຜ່ານລະຫັດແລ້ວ
  return (
    <div className="p-4 sm:p-5 space-y-5 bg-slate-100/90 min-h-screen text-slate-800">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#001839]/5 text-[#001839] flex items-center justify-center border border-[#001839]/10">
            <ShieldCheck strokeWidth={1.4} className="w-5 h-5 text-emerald-700" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-serif tracking-tight text-[#001839]">
                Cashflow Management & Approval Desk
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[8.5px] font-serif uppercase tracking-[0.2em]">
                Unlocked
              </span>
            </div>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              ບັນທຶກລາຍຮັບ-ລາຍຈ່າຍຮ້ານ, ແຍກຊ່ອງທາງ ແລະ ອະນຸມັດທຸລະກຳ
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsAuthenticated(false)}
          className="px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-[#001839] rounded-xl text-xs font-serif uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
        >
          <Lock strokeWidth={1.4} className="w-3.5 h-3.5" /> Lock Screen
        </button>
      </div>

      {/* Grid: Form on Left + Transactions on Right */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        
        {/* Form Entry */}
        <div className="xl:col-span-4 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <h3 className="text-sm font-serif uppercase tracking-wider text-[#001839]">
            ບັນທຶກທຸລະກຳໃໝ່ (New Cashflow Entry)
          </h3>

          <form onSubmit={handleSaveTransaction} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('income')}
                className={`py-2 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
                  type === 'income' ? 'bg-emerald-700 text-white font-bold' : 'bg-slate-100 text-slate-600'
                }`}
              >
                + ລາຍຮັບ (Income)
              </button>
              <button
                type="button"
                onClick={() => setType('expense')}
                className={`py-2 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
                  type === 'expense' ? 'bg-rose-700 text-white font-bold' : 'bg-slate-100 text-slate-600'
                }`}
              >
                - ລາຍຈ່າຍ (Expense)
              </button>
            </div>

            <div>
              <label className="text-[10px] font-serif uppercase tracking-wider text-[#001839] block mb-1">ຫົວຂໍ້ທຸລະກຳ</label>
              <input
                type="text"
                required
                placeholder="ເຊັ່ນ: ຂາຍໜ້າຮ້ານ, ຄ່າໄຟຟ້າ, ຄ່າເຊົ່າ..."
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full h-8.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-[#001839] outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
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
                <label className="text-[10px] font-serif uppercase tracking-wider text-[#001839] block mb-1">ຊ່ອງທາງຈ່າຍ</label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full h-8.5 px-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-serif text-[#001839] outline-none"
                >
                  <option value="Onepay">OnePay (ໂອນ)</option>
                  <option value="Cash">Cash (ເງິນສົດ)</option>
                  <option value="LDB">LDB Trust (ໂອນ)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-serif uppercase tracking-wider text-[#001839] block mb-1">ໝວດໝູ່</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full h-8.5 px-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-serif text-[#001839] outline-none"
                >
                  {type === 'income' ? (
                    <>
                      <option value="sales">Sales (ຂາຍສິນຄ້າ)</option>
                      <option value="other_income">Other Income</option>
                    </>
                  ) : (
                    <>
                      <option value="purchasing">Purchasing (COGS)</option>
                      <option value="rental">Rental (ຄ່າເຊົ່າ)</option>
                      <option value="salary">Salary (ເງິນເດືອນ)</option>
                      <option value="operation">Operations (ດຳເນີນງານ)</option>
                      <option value="admin">Admin / ບໍລິຫານ</option>
                      <option value="dividend">Dividend (ປັນຜົນ)</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-serif uppercase tracking-wider text-[#001839] block mb-1">ວັນທີ</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full h-8.5 px-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-[#001839] outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full h-10 bg-[#001839] hover:bg-[#00285d] text-white rounded-xl text-xs font-serif uppercase tracking-widest transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer mt-2"
            >
              <Plus strokeWidth={1.4} className="w-4 h-4" />
              <span>{saving ? 'Processing...' : 'Save Transaction'}</span>
            </button>
          </form>
        </div>

        {/* Ledger & Approvals */}
        <div className="xl:col-span-8 bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="text-sm font-serif uppercase tracking-wider text-[#001839]">
              Transactions & Approvals Desk
            </h3>
            <span className="text-xs font-serif text-slate-400">{transactions.length} ລາຍການ</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-serif uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="p-3 pl-4">Date</th>
                  <th className="p-3">Title</th>
                  <th className="p-3">Channel</th>
                  <th className="p-3 text-right">Amount (LAK)</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center pr-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/60 transition">
                    <td className="p-3 pl-4 font-mono text-slate-500">{t.date}</td>
                    <td className="p-3 font-medium text-[#001839]">{t.title}</td>
                    <td className="p-3 font-serif uppercase text-[10px] text-slate-600">{t.paymentMethod || 'Onepay'}</td>
                    <td className={`p-3 text-right font-serif text-xs font-bold ${t.type === 'income' ? 'text-emerald-800' : 'text-rose-800'}`}>
                      {t.type === 'income' ? '+' : '-'}{Math.round(Number(t.amount || 0)).toLocaleString()} ₭
                    </td>
                    <td className="p-3 text-center">
                      {t.isApproved ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[9px] font-serif uppercase">Approved</span>
                      ) : (
                        <button
                          onClick={() => setApprovingTx(t)}
                          className="px-2.5 py-1 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[9px] font-serif uppercase cursor-pointer"
                        >
                          Pending Approval 🔒
                        </button>
                      )}
                    </td>
                    <td className="p-3 text-center pr-3">
                      <button
                        onClick={async () => {
                          if (window.confirm('ລຶບລາຍການນີ້?')) await deleteDoc(doc(db, 'transactions', t.id));
                        }}
                        className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 strokeWidth={1.4} className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Transaction Approval PIN Modal */}
      {approvingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white p-6 rounded-3xl max-w-sm w-full space-y-4 border border-slate-200 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
              <h3 className="text-sm font-serif uppercase tracking-wider text-[#001839]">Transaction Approval</h3>
              <button onClick={() => setApprovingTx(null)} className="text-slate-400">✕</button>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl space-y-1 text-xs">
              <p><strong>ລາຍການ:</strong> {approvingTx.title}</p>
              <p><strong>ຍອດເງິນ:</strong> {Number(approvingTx.amount).toLocaleString()} ₭</p>
            </div>
            <div>
              <label className="text-[10px] font-serif uppercase tracking-wider text-[#001839] block mb-1">
                Enter Approval PIN (ລະຫັດອະນຸມັດ)
              </label>
              <input
                type="password"
                maxLength={6}
                placeholder="••••"
                value={approvalPin}
                onChange={e => setApprovalPin(e.target.value)}
                className="w-full h-10 text-center text-lg font-mono tracking-widest bg-slate-50 border border-slate-200 rounded-xl outline-none"
              />
              {approvalError && <p className="text-xs text-rose-600 mt-1">{approvalError}</p>}
            </div>
            <button
              onClick={handleApproveTransaction}
              className="w-full h-10 bg-[#001839] hover:bg-[#00285d] text-white rounded-xl text-xs font-serif uppercase tracking-widest cursor-pointer"
            >
              Confirm Approval
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
