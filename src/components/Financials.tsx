import React, { useState, useEffect, useMemo, useRef } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, addDoc, onSnapshot, query, orderBy, 
  deleteDoc, doc, setDoc, serverTimestamp 
} from 'firebase/firestore';
import { format, isSameMonth, parseISO } from 'date-fns';
import { 
  PlusCircle, Eye, EyeOff, Trash2, 
  Sparkles, CheckCircle2, Wallet, CreditCard,
  Building2, DollarSign, Edit3, Check, Split,
  AlertCircle, Upload, Image as ImageIcon, X, FileText
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PinModal from './PinModal';

export type PaymentChannel = 'Cash' | 'Onepay' | 'LDB';

export default function Financials({ appConfig, selectedBranch }: { appConfig?: any, selectedBranch?: string }) {
  const { t, i18n } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. LocalStorage Instant Cache (ໂຫຼດຂໍ້ມູນຈາກ Cache ຂຶ້ນມາກ່ອນທັນທີ 0ms)
  const cacheKey = `cache_tx_${selectedBranch || 'branch_1'}`;
  const initialCachedData = useMemo(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  }, [cacheKey]);

  const [allTransactions, setAllTransactions] = useState<any[]>(initialCachedData);
  const [dailyTransactions, setDailyTransactions] = useState<any[]>([]);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // 2. Loading Animation State (ບອກເປັນ %)
  const [isLoading, setIsLoading] = useState(allTransactions.length === 0);
  const [loadPercent, setLoadPercent] = useState(allTransactions.length > 0 ? 100 : 15);

  // In-App Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  // Timeframe View Mode & Date View
  const [timeframeMode, setTimeframeMode] = useState<'month' | 'all'>('month');
  const [viewDate, setViewDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Form State
  const [formData, setFormData] = useState({
    type: 'expense' as 'income' | 'expense',
    amount: 0,
    category: 'Purchasing',
    description: '',
    source: 'Cash' as PaymentChannel,
    date: format(new Date(), 'yyyy-MM-dd'),
    time: format(new Date(), 'HH:mm')
  });

  const [displayAmount, setDisplayAmount] = useState('');
  const [receiptImageBase64, setReceiptImageBase64] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

  // 3-Way Split Income States
  const [is3WaySplit, setIs3WaySplit] = useState(true);
  const [splitCash, setSplitCash] = useState<number>(0);
  const [splitCashDisplay, setSplitCashDisplay] = useState<string>('');
  const [splitOnepay, setSplitOnepay] = useState<number>(0);
  const [splitOnepayDisplay, setSplitOnepayDisplay] = useState<string>('');
  const [splitLDB, setSplitLDB] = useState<number>(0);
  const [splitLDBDisplay, setSplitLDBDisplay] = useState<string>('');

  // Edit / Delete with PIN states
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditPinModal, setShowEditPinModal] = useState(false);
  const [txToEdit, setTxToEdit] = useState<any>(null);
  const [txToDelete, setTxToDelete] = useState<any>(null);
  const [showDeletePinModal, setShowDeletePinModal] = useState(false);

  // Supplier Purchases Pull States
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [pullDate, setPullDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [billPaymentSources, setBillPaymentSources] = useState<{ [id: string]: PaymentChannel }>({});
  const [importingBillId, setImportingBillId] = useState<string | null>(null);

  const normalizePaymentChannel = (src?: string): PaymentChannel => {
    if (!src) return 'Cash';
    const s = String(src).toLowerCase();
    if (s.includes('ldb')) return 'LDB';
    if (s.includes('onepay') || s.includes('bcel') || s.includes('online') || s.includes('transfer') || s.includes('ໂອນ')) return 'Onepay';
    return 'Cash';
  };

  const formatWithCommas = (val: string | number) => {
    const clean = String(val).replace(/,/g, '');
    if (!clean || isNaN(Number(clean))) return '';
    return Number(clean).toLocaleString();
  };

  // Image Processing & Compression (< 80KB)
  const processReceiptFile = (fileOrBlob: Blob | File) => {
    if (!fileOrBlob) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 750;
        const scale = MAX_WIDTH / img.width;
        canvas.width = img.width > MAX_WIDTH ? MAX_WIDTH : img.width;
        canvas.height = img.width > MAX_WIDTH ? img.height * scale : img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.5);
        setReceiptImageBase64(compressedBase64);
        showToast("ອັບໂຫຼດຮູບໃບບິນສຳເລັດ!", "info");
      };
    };
    reader.readAsDataURL(fileOrBlob);
  };

  // 🌟 Global Clipboard Listener (Ctrl + V ສຳລັບວາງຮູບດ່ວນ)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const clipboard = e.clipboardData;
      if (!clipboard) return;

      if (clipboard.files && clipboard.files.length > 0) {
        for (let i = 0; i < clipboard.files.length; i++) {
          const file = clipboard.files[i];
          if (file.type.startsWith('image/')) {
            e.preventDefault();
            processReceiptFile(file);
            return;
          }
        }
      }

      if (clipboard.items) {
        for (let i = 0; i < clipboard.items.length; i++) {
          const item = clipboard.items[i];
          if (item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            if (blob) {
              e.preventDefault();
              processReceiptFile(blob);
              return;
            }
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Safe Auto-balance for Income Split
  const handleTotalAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/,/g, '');
    if (rawValue === '' || !isNaN(Number(rawValue))) {
      const num = Number(rawValue) || 0;
      setDisplayAmount(formatWithCommas(rawValue));
      setFormData(prev => ({ ...prev, amount: num }));

      if (formData.type === 'income' && is3WaySplit) {
        const remaining = Math.max(0, num - splitCash - splitOnepay);
        setSplitLDB(remaining);
        setSplitLDBDisplay(remaining > 0 ? formatWithCommas(remaining) : '');
      }
    }
  };

  const handleSplitCashChange = (valStr: string) => {
    const clean = valStr.replace(/,/g, '');
    if (clean === '' || !isNaN(Number(clean))) {
      const val = Number(clean) || 0;
      setSplitCash(val);
      setSplitCashDisplay(formatWithCommas(clean));
      const total = formData.amount || (val + splitOnepay + splitLDB);
      const remaining = Math.max(0, total - val - splitOnepay);
      setSplitLDB(remaining);
      setSplitLDBDisplay(remaining > 0 ? formatWithCommas(remaining) : '');
    }
  };

  const handleSplitOnepayChange = (valStr: string) => {
    const clean = valStr.replace(/,/g, '');
    if (clean === '' || !isNaN(Number(clean))) {
      const val = Number(clean) || 0;
      setSplitOnepay(val);
      setSplitOnepayDisplay(formatWithCommas(clean));
      const total = formData.amount || (splitCash + val + splitLDB);
      const remaining = Math.max(0, total - splitCash - val);
      setSplitLDB(remaining);
      setSplitLDBDisplay(remaining > 0 ? formatWithCommas(remaining) : '');
    }
  };

  const handleSplitLDBChange = (valStr: string) => {
    const clean = valStr.replace(/,/g, '');
    if (clean === '' || !isNaN(Number(clean))) {
      const val = Number(clean) || 0;
      setSplitLDB(val);
      setSplitLDBDisplay(formatWithCommas(clean));
      const sum = splitCash + splitOnepay + val;
      if (sum > formData.amount) {
        setFormData(prev => ({ ...prev, amount: sum }));
        setDisplayAmount(formatWithCommas(sum));
      }
    }
  };

  // Real-time Sync from Firestore with Loading % and LocalStorage Cache
  useEffect(() => {
    setLoadPercent(35);
    const qAll = query(collection(db, 'transactions'), orderBy('date', 'desc'));
    const branchId = selectedBranch || 'branch_1';

    const unsubscribeAll = onSnapshot(qAll, (snap) => {
      setLoadPercent(75);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const branchFiltered = branchId === 'all' 
        ? all 
        : all.filter((tx: any) => (tx.branchId || 'branch_1') === branchId);

      setAllTransactions(branchFiltered);

      // Save to LocalStorage Cache
      try {
        localStorage.setItem(cacheKey, JSON.stringify(branchFiltered));
      } catch {}

      const daily = branchFiltered.filter((tx: any) => tx.date === viewDate);
      daily.sort((a: any, b: any) => (b.time || '').localeCompare(a.time || ''));
      setDailyTransactions(daily);

      setLoadPercent(100);
      setTimeout(() => setIsLoading(false), 200);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
      setIsLoading(false);
    });

    const unsubPrices = onSnapshot(collection(db, 'supplierPrices'), (snap) => {
      setSupplierPrices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubscribeAll();
      unsubPrices();
      unsubProducts();
    };
  }, [viewDate, selectedBranch, cacheKey]);

  useEffect(() => {
    setPullDate(viewDate);
    setPaymentDate(viewDate);
  }, [viewDate]);

  // Financial KPIs (ກົງກັບຮູບທີ 3 ແບບ 100%)
  const financialSummary = useMemo(() => {
    const now = new Date();

    const activeList = allTransactions.filter(tx => {
      if (timeframeMode === 'all') return true;
      if (!tx.date) return true;
      try {
        const d = parseISO(tx.date);
        return isSameMonth(d, now);
      } catch {
        return true;
      }
    });

    let totalRevenue = 0;
    let totalPurchasing = 0;
    let totalOPEX = 0;

    let cashIncome = 0, cashExpense = 0;
    let onepayIncome = 0, onepayExpense = 0;
    let ldbIncome = 0, ldbExpense = 0;

    activeList.forEach(tx => {
      const amt = Number(tx.amount) || 0;
      const ch = normalizePaymentChannel(tx.source || tx.paymentMethod);
      const isIncome = tx.type === 'income' || String(tx.category || '').toLowerCase() === 'sales';

      if (isIncome) {
        totalRevenue += amt;
        if (ch === 'Cash') cashIncome += amt;
        else if (ch === 'Onepay') onepayIncome += amt;
        else if (ch === 'LDB') ldbIncome += amt;
      } else {
        const cat = String(tx.category || '').toLowerCase();
        const isPurchasing = cat.includes('purchas') || cat.includes('supply') || cat.includes('ຊື້') || cat.includes('cogs');

        if (isPurchasing) totalPurchasing += amt;
        else totalOPEX += amt;

        if (ch === 'Cash') cashExpense += amt;
        else if (ch === 'Onepay') onepayExpense += amt;
        else if (ch === 'LDB') ldbExpense += amt;
      }
    });

    return {
      totalRevenue,
      totalPurchasing,
      totalOPEX,
      totalExpenses: totalPurchasing + totalOPEX,
      cashIncome, cashExpense, cashNet: cashIncome - cashExpense,
      onepayIncome, onepayExpense, onepayNet: onepayIncome - onepayExpense,
      ldbIncome, ldbExpense, ldbNet: ldbIncome - ldbExpense,
      totalNetLiquidity: (cashIncome - cashExpense) + (onepayIncome - onepayExpense) + (ldbIncome - ldbExpense)
    };
  }, [allTransactions, timeframeMode]);

  // Pull Supplier Bills Grouping
  const importedSupplierPriceIds = useMemo(() => {
    const ids = new Set<string>();
    allTransactions.forEach((tx) => {
      if (tx.supplierPriceIds && Array.isArray(tx.supplierPriceIds)) {
        tx.supplierPriceIds.forEach((id: string) => ids.add(id));
      }
    });
    return ids;
  }, [allTransactions]);

  const supplierBillsForSelectedDate = useMemo(() => {
    const selectedDatePrices = supplierPrices.filter(p => p.date === pullDate);
    const isOther = (name: string) => {
      const n = String(name || '').trim().toUpperCase();
      return n === 'OTHER' || n === 'ອື່ນໆ' || n === '';
    };

    const nonOtherPrices = selectedDatePrices.filter(p => !isOther(p.supplier));
    const otherPrices = selectedDatePrices.filter(p => isOther(p.supplier));

    const groups: { [supplier: string]: any[] } = {};
    nonOtherPrices.forEach(p => {
      const sup = String(p.supplier || '').trim();
      if (!groups[sup]) groups[sup] = [];
      groups[sup].push(p);
    });

    const itemTotalLAK = (item: any): number => {
      if (item.totalPriceLAK !== undefined) return Number(item.totalPriceLAK || 0);
      return item.currency === 'LAK'
        ? Number(item.priceOriginal || 0) * (Number(item.quantity) || 1)
        : Number(item.priceOriginal || 0) * Number(item.exchangeRate || 1) * (Number(item.quantity) || 1);
    };

    const bills: any[] = [];
    Object.keys(groups).forEach(supplierName => {
      const items = groups[supplierName];
      const pendingItems = items.filter(it => !importedSupplierPriceIds.has(it.id));
      const importedItems = items.filter(it => importedSupplierPriceIds.has(it.id));

      if (pendingItems.length > 0) {
        bills.push({
          id: `grouped_${supplierName}_pending_${pullDate}`,
          supplier: supplierName,
          date: pullDate,
          totalPrice: pendingItems.reduce((sum, item) => sum + itemTotalLAK(item), 0),
          items: pendingItems,
          sourceIds: pendingItems.map(it => it.id),
          isImported: false,
          billImageUrl: pendingItems[0]?.billImageUrl || ''
        });
      }
      if (importedItems.length > 0) {
        bills.push({
          id: `grouped_${supplierName}_imported_${pullDate}`,
          supplier: supplierName,
          date: pullDate,
          totalPrice: importedItems.reduce((sum, item) => sum + itemTotalLAK(item), 0),
          items: importedItems,
          sourceIds: importedItems.map(it => it.id),
          isImported: true,
          billImageUrl: importedItems[0]?.billImageUrl || ''
        });
      }
    });

    otherPrices.forEach(p => {
      bills.push({
        id: `single_${p.id}`,
        supplier: p.supplier || 'OTHER',
        date: pullDate,
        totalPrice: itemTotalLAK(p),
        items: [p],
        sourceIds: [p.id],
        isImported: importedSupplierPriceIds.has(p.id),
        billImageUrl: p.billImageUrl || ''
      });
    });

    return bills;
  }, [supplierPrices, pullDate, importedSupplierPriceIds]);

  const handlePullSupplierBill = async (bill: any) => {
    if (!bill) return;
    try {
      setImportingBillId(bill.id);
      const totalAmount = Math.round(bill.totalPrice || 0);
      if (totalAmount <= 0) return;

      const selectedSource: PaymentChannel = billPaymentSources[bill.id] || 'Onepay';
      const todayLocal = new Date();
      const localTimeString = `${String(todayLocal.getHours()).padStart(2, '0')}:${String(todayLocal.getMinutes()).padStart(2, '0')}`;
      const pNames = bill.items.map((it: any) => products.find(prod => prod.id === it.productId)?.name || 'Item').join(', ');

      await addDoc(collection(db, 'transactions'), {
        type: 'expense',
        amount: totalAmount,
        category: 'Purchasing',
        description: `ຊື້ເຄື່ອງເຂົ້າຮ້ານຈາກ ${bill.supplier}: ${pNames}`,
        source: selectedSource,
        paymentMethod: selectedSource,
        receiptUrl: bill.billImageUrl || '',
        date: paymentDate,
        time: localTimeString,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        userId: auth.currentUser?.uid || 'admin',
        supplierName: bill.supplier,
        supplierPriceIds: bill.sourceIds,
        branchId: selectedBranch || 'branch_1'
      });

      showToast(`ດຶງລາຍຈ່າຍຈາກ ${bill.supplier} ສຳເລັດ!`, "success");
    } catch (err: any) {
      showToast(`Error: ${err.message}`, "error");
    } finally {
      setImportingBillId(null);
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const branchId = selectedBranch || 'branch_1';
      const batchGroupId = `split_${Date.now()}`;

      if (formData.type === 'income' && is3WaySplit && !isEditing) {
        const entries: Array<{ amount: number; source: PaymentChannel; label: string }> = [
          { amount: splitCash, source: 'Cash', label: 'ສ່ວນເງິນສົດ' },
          { amount: splitOnepay, source: 'Onepay', label: 'ສ່ວນ OnePay' },
          { amount: splitLDB, source: 'LDB', label: 'ສ່ວນ LDB' }
        ];

        let savedCount = 0;
        for (const item of entries) {
          if (item.amount > 0) {
            await addDoc(collection(db, 'transactions'), {
              type: 'income',
              amount: item.amount,
              category: formData.category || 'Sales',
              description: formData.description ? `${formData.description} • ${item.label}` : item.label,
              source: item.source,
              paymentMethod: item.source,
              receiptUrl: receiptImageBase64 || '',
              date: formData.date,
              time: formData.time,
              batchGroupId,
              updatedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
              userId: auth.currentUser?.uid || 'admin',
              branchId
            });
            savedCount++;
          }
        }
        showToast(`ບັນທຶກລາຍຮັບແຍກ ${savedCount} ຊ່ອງທາງສຳເລັດ!`, "success");
      } else {
        const txData = {
          type: formData.type,
          amount: formData.amount,
          category: formData.category,
          description: formData.description,
          source: formData.source,
          paymentMethod: formData.source,
          receiptUrl: receiptImageBase64 || '',
          date: formData.date,
          time: formData.time,
          updatedAt: serverTimestamp(),
          userId: auth.currentUser?.uid || 'admin',
          branchId
        };

        if (isEditing && editingId) {
          await setDoc(doc(db, 'transactions', editingId), txData, { merge: true });
          showToast("ແກ້ໄຂລາຍການສຳເລັດ!", "success");
        } else {
          await addDoc(collection(db, 'transactions'), { ...txData, createdAt: serverTimestamp() });
          showToast("ບັນທຶກລາຍການສຳເລັດ!", "success");
        }
      }

      setFormData({
        type: 'expense',
        amount: 0,
        category: 'Purchasing',
        description: '',
        source: 'Cash',
        date: format(new Date(), 'yyyy-MM-dd'),
        time: format(new Date(), 'HH:mm')
      });
      setDisplayAmount('');
      setReceiptImageBase64('');
      setSplitCash(0);
      setSplitCashDisplay('');
      setSplitOnepay(0);
      setSplitOnepayDisplay('');
      setSplitLDB(0);
      setSplitLDBDisplay('');
      setIsEditing(false);
      setEditingId(null);
    } catch (err: any) {
      showToast(`Error: ${err.message}`, "error");
    }
  };

  const startEdit = (tx: any) => {
    setTxToEdit(tx);
    setShowEditPinModal(true);
  };

  const handleEditConfirmed = () => {
    if (!txToEdit) return;
    setFormData({
      type: txToEdit.type,
      amount: txToEdit.amount,
      category: txToEdit.category || 'Purchasing',
      description: txToEdit.description || '',
      source: normalizePaymentChannel(txToEdit.source || txToEdit.paymentMethod),
      date: txToEdit.date,
      time: txToEdit.time || format(new Date(), 'HH:mm')
    });
    setDisplayAmount(txToEdit.amount.toLocaleString());
    setReceiptImageBase64(txToEdit.receiptUrl || '');
    setIsEditing(true);
    setEditingId(txToEdit.id);
    setShowEditPinModal(false);
    setTxToEdit(null);
  };

  const startDelete = (tx: any) => {
    setTxToDelete(tx);
    setShowDeletePinModal(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!txToDelete) return;
    try {
      await deleteDoc(doc(db, 'transactions', txToDelete.id));
      showToast("ລຶບລາຍການສຳເລັດ!", "info");
      setShowDeletePinModal(false);
      setTxToDelete(null);
    } catch (err: any) {
      showToast(`Error: ${err.message}`, "error");
    }
  };

  return (
    <div className="p-4 sm:p-5 space-y-5 bg-slate-100/90 min-h-screen text-slate-800 relative font-sans">

      {/* Loading Animation Bar with Percentage % */}
      {isLoading && (
        <div className="fixed top-0 left-0 right-0 z-[120] h-1 bg-slate-200">
          <div 
            className="h-full bg-[#001839] transition-all duration-300"
            style={{ width: `${loadPercent}%` }}
          />
        </div>
      )}

      {/* Modern In-App Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-[100] animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-none">
          <div className={`px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-2.5 text-xs font-serif uppercase tracking-wider ${
            toast.type === 'success' ? 'bg-[#001839] text-white border-emerald-400' : 'bg-[#001839] text-rose-300 border-rose-400'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 strokeWidth={1.4} className="w-4 h-4 text-emerald-400" /> : <AlertCircle strokeWidth={1.4} className="w-4 h-4 text-rose-400" />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* ================= 1. HEADER (ຄືກັນກັບຮູບທີ 3 ເປະ) ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#001839]/5 text-[#001839] flex items-center justify-center border border-[#001839]/10">
            <DollarSign strokeWidth={1.4} className="w-5 h-5 text-[#001839]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-serif tracking-tight text-[#001839]">
                Executive Financials Desk
              </h2>
              <span className="text-[8.5px] font-serif uppercase px-2 py-0.5 rounded-full bg-[#001839]/5 text-[#001839] border border-[#001839]/10 tracking-[0.2em]">
                {(selectedBranch || 'branch_1') === 'branch_1' ? 'BRANCH 1' : selectedBranch}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              Viewing: Current Month ({format(new Date(), 'MMMM yyyy')})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/60">
            <button
              type="button"
              onClick={() => setTimeframeMode('month')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
                timeframeMode === 'month' ? 'bg-[#001839] text-white shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              THIS MONTH
            </button>
            <button
              type="button"
              onClick={() => setTimeframeMode('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
                timeframeMode === 'all' ? 'bg-[#001839] text-white shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ALL-TIME
            </button>
          </div>

          <button 
            onClick={() => setShowPrivacy(!showPrivacy)}
            className="px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-[#001839] font-serif text-xs uppercase tracking-wider rounded-xl transition border border-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            {showPrivacy ? <Eye strokeWidth={1.4} className="w-3.5 h-3.5 text-emerald-700" /> : <EyeOff strokeWidth={1.4} className="w-3.5 h-3.5" />}
            <span>{showPrivacy ? "SHOW" : "HIDE"}</span>
          </button>
        </div>
      </div>

      {/* ================= 2. 4 PAYMENT LIQUIDITY CARDS (ຄືກັນກັບຮູບທີ 3 ເປະ) ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        
        {/* Card 1: TOTAL NET CASHFLOW (Navy #001839) */}
        <div className="bg-[#001839] text-white p-4 sm:p-5 rounded-3xl shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-[0.2em] text-white/60">
              TOTAL NET CASHFLOW
            </span>
            <div className="p-1.5 bg-white/10 rounded-full">
              <DollarSign strokeWidth={1.4} className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-2xl font-serif tracking-tight">
            {showPrivacy ? '••••••••' : `${Math.round(financialSummary.totalNetLiquidity).toLocaleString()} ₭`}
          </p>
          <p className="text-[9.5px] text-white/40 font-mono uppercase">
            IN: +{Math.round(financialSummary.totalRevenue).toLocaleString()} | OUT: -{Math.round(financialSummary.totalExpenses).toLocaleString()}
          </p>
        </div>

        {/* Card 2: CASH IN HAND */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-700" />
              <span>CASH IN HAND</span>
            </span>
            <span className="text-[8.5px] font-serif px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded font-bold uppercase">CASH</span>
          </div>
          <p className="text-xl font-serif tracking-tight text-[#001839]">
            {showPrivacy ? '••••••' : `${Math.round(financialSummary.cashNet).toLocaleString()} ₭`}
          </p>
          <div className="flex justify-between text-[9.5px] font-mono text-slate-400 font-medium">
            <span className="text-emerald-700 font-bold">+{Math.round(financialSummary.cashIncome).toLocaleString()}</span>
            <span className="text-rose-700 font-bold">-{Math.round(financialSummary.cashExpense).toLocaleString()}</span>
          </div>
        </div>

        {/* Card 3: ONEPAY BALANCE */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
              <span className="w-2 h-2 rounded-full bg-rose-700" />
              <span>ONEPAY BALANCE</span>
            </span>
            <span className="text-[8.5px] font-serif px-2 py-0.5 bg-rose-50 text-rose-800 rounded font-bold uppercase">ONEPAY</span>
          </div>
          <p className="text-xl font-serif tracking-tight text-[#001839]">
            {showPrivacy ? '••••••' : `${Math.round(financialSummary.onepayNet).toLocaleString()} ₭`}
          </p>
          <div className="flex justify-between text-[9.5px] font-mono text-slate-400 font-medium">
            <span className="text-emerald-700 font-bold">+{Math.round(financialSummary.onepayIncome).toLocaleString()}</span>
            <span className="text-rose-700 font-bold">-{Math.round(financialSummary.onepayExpense).toLocaleString()}</span>
          </div>
        </div>

        {/* Card 4: LDB BALANCE */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
              <span className="w-2 h-2 rounded-full bg-blue-700" />
              <span>LDB BALANCE</span>
            </span>
            <span className="text-[8.5px] font-serif px-2 py-0.5 bg-blue-50 text-blue-800 rounded font-bold uppercase">LDB</span>
          </div>
          <p className="text-xl font-serif tracking-tight text-[#001839]">
            {showPrivacy ? '••••••' : `${Math.round(financialSummary.ldbNet).toLocaleString()} ₭`}
          </p>
          <div className="flex justify-between text-[9.5px] font-mono text-slate-400 font-medium">
            <span className="text-emerald-700 font-bold">+{Math.round(financialSummary.ldbIncome).toLocaleString()}</span>
            <span className="text-rose-700 font-bold">-{Math.round(financialSummary.ldbExpense).toLocaleString()}</span>
          </div>
        </div>

      </div>

      {/* ================= 3. TRANSACTION FORM & RIGHT LEDGER TABLE (ຄືກັນກັບຮູບທີ 3) ================= */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">

        {/* LEFT COLUMN: ຟອມປ້ອນຂໍ້ມູນ (5 ຖັນ) */}
        <div className="xl:col-span-5 space-y-4">
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
            
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-serif uppercase tracking-wider text-[#001839] flex items-center gap-2">
                <PlusCircle strokeWidth={1.4} className="w-4 h-4 text-emerald-700" />
                <span>{isEditing ? 'ແກ້ໄຂລາຍການ' : 'ບັນທຶກລາຍການ (TRANSACTION ENTRY)'}</span>
              </h3>
              {isEditing && (
                <button 
                  onClick={() => { setIsEditing(false); setEditingId(null); setDisplayAmount(''); }}
                  className="text-[10px] font-serif text-rose-500 uppercase tracking-widest cursor-pointer hover:underline"
                >
                  Cancel
                </button>
              )}
            </div>

            <form onSubmit={handleAddTransaction} className="space-y-3.5">
              
              {/* Type Switcher: EXPENSE vs INCOME */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
                <button 
                  type="button" 
                  onClick={() => setFormData({...formData, type: 'expense', category: 'Purchasing'})}
                  className={`py-2 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
                    formData.type === 'expense' ? 'bg-[#001839] text-white shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  EXPENSE (ລາຍຈ່າຍ)
                </button>
                <button 
                  type="button" 
                  onClick={() => setFormData({...formData, type: 'income', category: 'Sales'})}
                  className={`py-2 rounded-xl text-xs font-serif uppercase tracking-wider transition ${
                    formData.type === 'income' ? 'bg-[#001839] text-white shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  INCOME (ລາຍຮັບ)
                </button>
              </div>

              {/* DATE & TIME */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9.5px] font-serif uppercase tracking-wider text-[#001839]">DATE</label>
                  <input 
                    type="date"
                    required
                    className="w-full h-9 px-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-medium text-[#001839] outline-none"
                    value={formData.date}
                    onChange={e => setFormData({...formData, date: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9.5px] font-serif uppercase tracking-wider text-[#001839]">TIME</label>
                  <input 
                    type="time"
                    required
                    className="w-full h-9 px-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-medium text-[#001839] outline-none"
                    value={formData.time}
                    onChange={e => setFormData({...formData, time: e.target.value})}
                  />
                </div>
              </div>

              {/* TOTAL AMOUNT (₭) */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[9.5px] font-serif uppercase tracking-wider text-[#001839]">
                    TOTAL AMOUNT (₭)
                  </label>
                  {formData.type === 'income' && (
                    <span className="text-[9px] font-serif uppercase tracking-wider text-emerald-700 flex items-center gap-1 font-semibold">
                      <Split strokeWidth={1.4} className="w-3 h-3" />
                      Auto-Balance Split Active
                    </span>
                  )}
                </div>
                <input 
                  type="text"
                  required
                  placeholder="0"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xl font-serif font-bold text-[#001839] outline-none"
                  value={displayAmount}
                  onChange={handleTotalAmountChange}
                />
              </div>

              {/* 3-Way Split Section for Income */}
              {formData.type === 'income' && !isEditing && (
                <div className="p-3 bg-emerald-50/50 border border-emerald-200/60 rounded-2xl space-y-2.5">
                  <div className="flex justify-between items-center border-b border-emerald-200/50 pb-1.5">
                    <span className="text-[10px] font-serif uppercase tracking-wider text-emerald-900 font-bold">
                      ແບ່ງ 3 ສ່ວນລາຍຮັບ (Auto-Balance)
                    </span>
                    <span className="text-[9.5px] font-mono font-bold text-emerald-800">
                      Sum: {(splitCash + splitOnepay + splitLDB).toLocaleString()} ₭
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[8.5px] font-serif uppercase tracking-wider text-emerald-800 block truncate">1. CASH</label>
                      <input 
                        type="text"
                        placeholder="0"
                        className="w-full h-8 px-2 rounded-xl bg-white border border-emerald-200 text-xs font-mono font-bold text-[#001839] outline-none"
                        value={splitCashDisplay}
                        onChange={e => handleSplitCashChange(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[8.5px] font-serif uppercase tracking-wider text-rose-800 block truncate">2. ONEPAY</label>
                      <input 
                        type="text"
                        placeholder="0"
                        className="w-full h-8 px-2 rounded-xl bg-white border border-rose-200 text-xs font-mono font-bold text-[#001839] outline-none"
                        value={splitOnepayDisplay}
                        onChange={e => handleSplitOnepayChange(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[8.5px] font-serif uppercase tracking-wider text-blue-800 block truncate">3. LDB</label>
                      <input 
                        type="text"
                        placeholder="0"
                        className="w-full h-8 px-2 rounded-xl bg-white border border-blue-200 text-xs font-mono font-bold text-[#001839] outline-none"
                        value={splitLDBDisplay}
                        onChange={e => handleSplitLDBChange(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* CATEGORY & PAID VIA */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9.5px] font-serif uppercase tracking-wider text-[#001839]">CATEGORY</label>
                  <select 
                    className="w-full h-9 px-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-serif text-[#001839] outline-none cursor-pointer"
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                    required
                  >
                    {formData.type === 'income' ? (
                      <>
                        <option value="Sales">🛒 Sales (ຂາຍສິນຄ້າ)</option>
                        <option value="dividends">💰 Dividends (ປັນຜົນ)</option>
                        <option value="other">📦 Other Income</option>
                      </>
                    ) : (
                      <>
                        <option value="Purchasing">🛒 Purchasing (ຈັດຊື້ວັດຖຸດິບ)</option>
                        <option value="rent">🏠 Rent (ຄ່າເຊົ່າ)</option>
                        <option value="salary">👥 Salary (ເງິນເດືອນ)</option>
                        <option value="operations">⚙️ Operations (ດຳເນີນງານ)</option>
                        <option value="admin">💼 Admin (ບໍລິຫານ)</option>
                        <option value="other">📦 Other</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9.5px] font-serif uppercase tracking-wider text-[#001839]">PAID VIA</label>
                  <select 
                    className="w-full h-9 px-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-serif text-[#001839] outline-none cursor-pointer"
                    value={formData.source}
                    onChange={e => setFormData({...formData, source: e.target.value as PaymentChannel})}
                  >
                    <option value="Cash">💵 Cash (ເງິນສົດ)</option>
                    <option value="Onepay">📱 BCEL OnePay</option>
                    <option value="LDB">🏦 ທະນາຄານ LDB</option>
                  </select>
                </div>
              </div>

              {/* 🌟 ບ່ອນອັບໂຫຼດຮູບໃບບິນ (Dropzone ພ້ອມ Drag & Drop ແລະ Ctrl + V) */}
              <div 
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.[0]) processReceiptFile(e.dataTransfer.files[0]); }}
                className={`p-3 rounded-2xl border-2 border-dashed transition-all ${
                  isDragging ? 'border-[#001839] bg-slate-50' : 'border-slate-300 bg-slate-50/60 hover:bg-slate-50'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[9.5px] font-serif uppercase tracking-wider text-[#001839] flex items-center gap-1.5 font-bold">
                    <ImageIcon strokeWidth={1.4} className="w-3.5 h-3.5" />
                    <span>Receipt Image (Drag & Drop / Ctrl + V)</span>
                  </span>
                  {receiptImageBase64 && (
                    <button type="button" onClick={() => setReceiptImageBase64('')} className="text-[9px] font-serif text-rose-500 uppercase cursor-pointer hover:underline">Remove</button>
                  )}
                </div>

                {receiptImageBase64 ? (
                  <div className="relative rounded-xl overflow-hidden max-h-28 bg-white border border-slate-200 flex items-center justify-center">
                    <img src={receiptImageBase64} alt="Receipt" className="w-full h-28 object-contain" />
                  </div>
                ) : (
                  <div>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      accept="image/*" 
                      onChange={e => e.target.files?.[0] && processReceiptFile(e.target.files[0])} 
                      className="hidden" 
                      id="tx-receipt-upload" 
                    />
                    <label htmlFor="tx-receipt-upload" className="w-full py-3 rounded-xl border border-slate-200 flex flex-col items-center justify-center gap-1 cursor-pointer bg-white hover:bg-slate-50 transition shadow-xs">
                      <Upload strokeWidth={1.4} className="w-4 h-4 text-emerald-700" />
                      <span className="text-[11px] font-serif uppercase tracking-wider text-[#001839]">ອັບໂຫຼດຮູບໃບບິນ (Drop / Ctrl+V)</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[9.5px] font-serif uppercase tracking-wider text-[#001839]">DESCRIPTION / MEMO</label>
                <input 
                  type="text"
                  placeholder="ລາຍລະອຽດ ຫຼື ໝາຍເຫດ..."
                  className="w-full h-8.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-[#001839] outline-none"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>

              <button 
                type="submit" 
                className="w-full h-10 bg-[#001839] hover:bg-[#00285d] text-white font-serif text-xs uppercase tracking-widest rounded-xl transition shadow-xs cursor-pointer mt-1"
              >
                {isEditing ? 'Update Transaction' : 'Save Transaction'}
              </button>
            </form>
          </div>

          {/* Pull Supplier Bills Card */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <Sparkles strokeWidth={1.4} className="w-4 h-4 text-[#001839]" />
              <h3 className="text-xs font-serif uppercase tracking-wider text-[#001839]">
                Pull Supplier Purchases
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={pullDate} onChange={e => setPullDate(e.target.value)} className="h-8 px-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-[#001839] outline-none" />
              <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="h-8 px-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-blue-600 outline-none" />
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {supplierBillsForSelectedDate.length === 0 ? (
                <p className="text-center text-xs text-slate-400 font-serif py-4">ບໍ່ມີບິນໃນວັນທີນີ້</p>
              ) : (
                supplierBillsForSelectedDate.map(bill => (
                  <div key={bill.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center text-xs">
                    <div>
                      <p className="font-bold text-[#001839]">{bill.supplier}</p>
                      <p className="font-mono text-slate-500">{Math.round(bill.totalPrice).toLocaleString()} ₭</p>
                    </div>
                    {!bill.isImported ? (
                      <button 
                        type="button" 
                        onClick={() => handlePullSupplierBill(bill)} 
                        className="px-3 py-1 bg-[#001839] text-white rounded-lg text-[10px] font-serif uppercase"
                      >
                        Pull
                      </button>
                    ) : (
                      <span className="text-emerald-700 font-serif text-[10px]">✓ ດຶງແລ້ວ</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: ຕາຕະລາງລາຍການ (7 ຖັນ - ຄືກັນກັບຮູບທີ 3 ເປະ) ================= */}
        <div className="xl:col-span-7">
          <div className="bg-white border border-slate-200/80 shadow-xs rounded-3xl overflow-hidden min-h-[550px] flex flex-col">
            
            {/* Header: Date picker & Records count */}
            <div className="p-4 border-b border-slate-100 flex items-center gap-3">
              <input 
                type="date" 
                value={viewDate}
                onChange={e => setViewDate(e.target.value)}
                className="text-xs font-mono font-bold bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 outline-none cursor-pointer text-[#001839]"
              />
              <span className="text-[11px] text-slate-400 font-serif uppercase">
                ({dailyTransactions.length} RECORDS)
              </span>
            </div>

            {/* Transaction Rows (Left vertical bar, Title, Subtitle, Channel badge, Amount, Edit, Delete) */}
            <div className="flex-1 overflow-x-auto divide-y divide-slate-100">
              {dailyTransactions.map(tx => {
                const ch = normalizePaymentChannel(tx.source || tx.paymentMethod);
                const isInc = tx.type === 'income' || String(tx.category || '').toLowerCase() === 'sales';

                return (
                  <div key={tx.id} className="p-4 flex justify-between items-center hover:bg-slate-50/70 transition">
                    
                    {/* Left: Indicator Line + Title + Description */}
                    <div className="flex items-center gap-3.5">
                      <div className={`w-1 h-9 rounded-full ${isInc ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                      <div>
                        <p className="text-xs font-bold text-[#001839] capitalize">{tx.category || 'Sales'}</p>
                        <p className="text-[10px] text-slate-400 font-sans mt-0.5">{tx.description || tx.time}</p>
                      </div>
                    </div>

                    {/* Right: Channel badge + Amount + Edit/Delete */}
                    <div className="flex items-center gap-3 sm:gap-4">
                      
                      {/* Channel Badge (ONEPAY / CASH / LDB) */}
                      <span className={`px-2.5 py-0.5 rounded-md text-[9px] font-serif uppercase tracking-wider font-semibold ${
                        ch === 'Cash' 
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/60' 
                          : ch === 'Onepay' 
                            ? 'bg-rose-50 text-rose-800 border border-rose-200/60' 
                            : 'bg-blue-50 text-blue-800 border border-blue-200/60'
                      }`}>
                        {ch.toUpperCase()}
                      </span>

                      {/* Currency Amount (+ / -) */}
                      <div className="text-right min-w-[110px]">
                        <p className={`text-xs font-serif font-bold ${isInc ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {showPrivacy ? '••••••' : `${isInc ? '+' : '-'}${Number(tx.amount).toLocaleString()} ₭`}
                        </p>
                      </div>

                      {/* Edit & Delete Buttons */}
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => startEdit(tx)} 
                          className="p-1.5 text-slate-400 hover:text-[#001839] transition cursor-pointer"
                          title="Edit"
                        >
                          <Edit3 strokeWidth={1.4} className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => startDelete(tx)} 
                          className="p-1.5 text-slate-400 hover:text-rose-500 transition cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 strokeWidth={1.4} className="w-3.5 h-3.5" />
                        </button>
                      </div>

                    </div>
                  </div>
                );
              })}

              {dailyTransactions.length === 0 && (
                <div className="p-12 text-center text-slate-400 text-xs font-serif uppercase tracking-widest">
                  No records for this date
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

      {/* Edit & Delete Verification PIN Modals */}
      <PinModal
        isOpen={showEditPinModal}
        onClose={() => setShowEditPinModal(fa
                                          
