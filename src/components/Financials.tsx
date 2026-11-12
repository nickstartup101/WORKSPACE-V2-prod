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
  AlertCircle, Upload, Image as ImageIcon, X, Lock, KeyRound, ArrowRight
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type PaymentChannel = 'Cash' | 'Onepay' | 'LDB';

export default function Financials({ appConfig, selectedBranch = 'branch_1' }: { appConfig?: any, selectedBranch?: string }) {
  const { i18n } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. LocalStorage Instant Cache (0.0s Load)
  const cacheKey = `cache_tx_${selectedBranch}`;
  const initialCachedData = useMemo(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  }, [cacheKey]);

  const [allTransactions, setAllTransactions] = useState<any[]>(initialCachedData);
  const [dailyTransactions, setDailyTransactions] = useState<any[]>([]);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // 2. Loading Animation with Progress %
  const [isLoading, setIsLoading] = useState(allTransactions.length === 0);
  const [loadPercent, setLoadPercent] = useState(allTransactions.length > 0 ? 100 : 20);

  // Toast State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

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

  // Modal Image Preview State (ສຳລັບເບິ່ງຮູບອັບໂຫຼດ ແລະ ຮູບໃນຕາຕະລາງ)
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);

  // 3-Way Split Income States
  const [is3WaySplit, setIs3WaySplit] = useState(true);
  const [splitCash, setSplitCash] = useState<number>(0);
  const [splitCashDisplay, setSplitCashDisplay] = useState<string>('');
  const [splitOnepay, setSplitOnepay] = useState<number>(0);
  const [splitOnepayDisplay, setSplitOnepayDisplay] = useState<string>('');
  const [splitLDB, setSplitLDB] = useState<number>(0);
  const [splitLDBDisplay, setSplitLDBDisplay] = useState<string>('');

  // 🌟 PIN Security State (ເມັດສີຟ້າເຂັ້ມ #001839)
  const [pinActionType, setPinActionType] = useState<'edit' | 'delete' | null>(null);
  const [targetTx, setTargetTx] = useState<any>(null);
  const [enteredPinDigits, setEnteredPinDigits] = useState<string>('');
  const [pinErrorMessage, setPinErrorMessage] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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
        setReceiptImageBase64(canvas.toDataURL('image/jpeg', 0.5));
        showToast("ອັບໂຫຼດຮູບໃບບິນສຳເລັດ!", "info");
      };
    };
    reader.readAsDataURL(fileOrBlob);
  };

  // Global Ctrl + V Paste
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

  // Sync Data
  useEffect(() => {
    setLoadPercent(40);
    const qAll = query(collection(db, 'transactions'), orderBy('date', 'desc'));
    const branchId = selectedBranch || 'branch_1';

    const unsubscribeAll = onSnapshot(qAll, (snap) => {
      setLoadPercent(80);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const branchFiltered = branchId === 'all' 
        ? all 
        : all.filter((tx: any) => (tx.branchId || 'branch_1') === branchId);

      setAllTransactions(branchFiltered);

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

  // Financial Summary
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

  // Supplier Bills
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

  // 🌟 PIN Verification Handler with Deep Blue Dots (#001839)
  const masterPin = appConfig?.masterApprovalPin || localStorage.getItem('approval_pin') || localStorage.getItem('admin_master_pin') || '1234';

  const openPinModal = (type: 'edit' | 'delete', tx: any) => {
    setPinActionType(type);
    setTargetTx(tx);
    setEnteredPinDigits('');
    setPinErrorMessage('');
  };

  const closePinModal = () => {
    setPinActionType(null);
    setTargetTx(null);
    setEnteredPinDigits('');
    setPinErrorMessage('');
  };

  const handlePinDigitPress = (digit: string) => {
    if (enteredPinDigits.length >= 4) return;
    const nextPin = enteredPinDigits + digit;
    setEnteredPinDigits(nextPin);
    setPinErrorMessage('');

    if (nextPin.length === 4) {
      if (nextPin === masterPin) {
        setTimeout(() => {
          if (pinActionType === 'edit' && targetTx) {
            setFormData({
              type: targetTx.type,
              amount: targetTx.amount,
              category: targetTx.category || 'Purchasing',
              description: targetTx.description || '',
              source: normalizePaymentChannel(targetTx.source || targetTx.paymentMethod),
              date: targetTx.date,
              time: targetTx.time || format(new Date(), 'HH:mm')
            });
            setDisplayAmount(targetTx.amount.toLocaleString());
            setReceiptImageBase64(targetTx.receiptUrl || '');
            setIsEditing(true);
            setEditingId(targetTx.id);
            closePinModal();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else if (pinActionType === 'delete' && targetTx) {
            deleteDoc(doc(db, 'transactions', targetTx.id))
              .then(() => {
                showToast("ລຶບລາຍການສຳເລັດ!", "info");
                closePinModal();
              })
              .catch(err => {
                showToast(`Error: ${err.message}`, "error");
                closePinModal();
              });
          }
        }, 150);
      } else {
        setTimeout(() => {
          setPinErrorMessage('ລະຫັດ PIN ບໍ່ຖືກຕ້ອງ!');
          setEnteredPinDigits('');
        }, 200);
      }
    }
  };

  const handlePinBackspace = () => {
    if (enteredPinDigits.length > 0) {
      setEnteredPinDigits(prev => prev.slice(0, -1));
      setPinErrorMessage('');
    }
  };

  return (
    <div className="p-4 sm:p-5 space-y-5 bg-slate-100/90 min-h-screen text-slate-800 relative font-sans">

      {/* Loading Progress Bar */}
      {isLoading && (
        <div className="fixed top-0 left-0 right-0 z-[120] h-1 bg-slate-200">
          <div 
            className="h-full bg-[#001839] transition-all duration-300"
            style={{ width: `${loadPercent}%` }}
          />
        </div>
      )}

      {/* Toast Notification */}
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

      {/* ================= 1. HEADER ================= */}
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
                {selectedBranch === 'all' ? 'ALL BRANCHES' : selectedBranch.toUpperCase()}
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

      {/* ================= 2. 4 PAYMENT LIQUIDITY CARDS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
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

      {/* ================= 3. TRANSACTION FORM & RIGHT LEDGER ================= */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">

        {/* LEFT COLUMN: ຟອມປ້ອນຂໍ້ມູນ */}
        <div className="xl:col-span-5 space-y-4">
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
            
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-serif uppercase tracking-wider text-[#001839] flex items-center gap-2">
                <PlusCircle strokeWidth={1.4} className="w-4 h-4 text-emerald-700" />
                <span>{isEditing ? 'ແກ້ໄຂລາຍການ' : 'ບັນທຶກລາຍການ (TRANSACTION ENTRY)'}</span>
              </h3>
              {isEditing && (
                <button 
                  onClick={() => { setIsEditing(false); setEditingId(null); setDisplayAmount(''); setReceiptImageBase64(''); }}
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

              {/* 3-Way Split Section for Income (No Emojis - Pure SVG Vectors) */}
              {formData.type === 'income' && !isEditing && (
                <div className="p-3 bg-emerald-50/50 border border-emerald-200/60 rounded-2xl space-y-2.5">
                  <div className="flex justify-between items-center border-b border-emerald-200/50 pb-1.5">
                    <span className="text-[10px] font-serif uppercase tracking-wider text-emerald-900 font-bold flex items-center gap-1.5">
                      <Wallet strokeWidth={1.4} className="w-3.5 h-3.5 text-emerald-700" />
                      <CreditCard strokeWidth={1.4} className="w-3.5 h-3.5 text-rose-700" />
                      <Building2 strokeWidth={1.4} className="w-3.5 h-3.5 text-blue-700" />
                      <span>ແບ່ງ 3 ສ່ວນລາຍຮັບ (Auto-Balance)</span>
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

              {/* CATEGORY & PAID VIA (No Emojis) */}
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
                        <option value="Sales">Sales (ຂາຍສິນຄ້າ)</option>
                        <option value="dividends">Dividends (ປັນຜົນ)</option>
                        <option value="other">Other Income (ອື່ນໆ)</option>
                      </>
                    ) : (
                      <>
                        <option value="Purchasing">Purchasing (ຈັດຊື້ວັດຖຸດິບ)</option>
                        <option value="rent">Rent (ຄ່າເຊົ່າ)</option>
                        <option value="salary">Salary (ເງິນເດືອນ)</option>
                        <option value="operations">Operations (ດຳເນີນງານ)</option>
                        <option value="admin">Admin (ບໍລິຫານ)</option>
                        <option value="electricity">Electricity (ຄ່າໄຟ)</option>
                        <option value="water">Water (ຄ່ານ້ຳ)</option>
                        <option value="other">Other (ອື່ນໆ)</option>
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
                    <option value="Cash">Cash (ເງິນສົດ)</option>
                    <option value="Onepay">BCEL OnePay (ໂອນ)</option>
                    <option value="LDB">LDB (ໂອນ)</option>
                  </select>
                </div>
              </div>

              {/* 🌟 ບ່ອນອັບໂຫຼດຮູບໃບບິນ + ປຸ່ມ PREVIEW ຮູບ */}
              <div 
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.[0]) processReceiptFile(e.dataTransfer.files[0]); }}
                className={`p-3 rounded-2xl border-2 border-dashed transition-all ${
                  isDragging ? 'border-[#001839] bg-slate-50' : 'border-slate-300 bg-slate-50/60 hover:bg-slate-50'
                }`}
              >
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[9.5px] font-serif uppercase tracking-wider text-[#001839] flex items-center gap-1.5 font-bold">
                    <ImageIcon strokeWidth={1.4} className="w-3.5 h-3.5" />
                    <span>Receipt Image (Drag & Drop / Ctrl + V)</span>
                  </span>
                  {receiptImageBase64 && (
                    <div className="flex items-center gap-2">
                      <button 
                        type="button" 
                        onClick={() => setPreviewModalUrl(receiptImageBase64)} 
                        className="text-[9px] font-serif text-[#001839] hover:underline uppercase flex items-center gap-1 cursor-pointer"
                      >
                        <Eye strokeWidth={1.4} className="w-3 h-3" /> Preview
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setReceiptImageBase64('')} 
                        className="text-[9px] font-serif text-rose-500 uppercase cursor-pointer hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                {receiptImageBase64 ? (
                  <div 
                    onClick={() => setPreviewModalUrl(receiptImageBase64)}
                    className="relative rounded-xl overflow-hidden max-h-28 bg-white border border-slate-200 flex items-center justify-center cursor-pointer group"
                    title="ກົດເພື່ອເບິ່ງຮູບເຕັມ (Click to Preview)"
                  >
                    <img src={receiptImageBase64} alt="Receipt" className="w-full h-28 object-contain" />
                    <div className="absolute inset-0 bg-[#001839]/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-serif gap-1.5">
                      <Eye strokeWidth={1.4} className="w-4 h-4" /> Click to Preview
                    </div>
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
                      <Upload strokeWidth={1.4} className="w-4 h-4 text-[#001839]" />
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

          {/* Pull Supplier Bills Card (No Emojis) */}
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
                        className="px-3 py-1 bg-[#001839] text-white rounded-lg text-[10px] font-serif uppercase cursor-pointer"
                      >
                        Pull
                      </button>
                    ) : (
                      <span className="text-emerald-700 font-serif text-[10px] flex items-center gap-1 font-semibold">
                        <CheckCircle2 strokeWidth={1.4} className="w-3 h-3" /> ດຶງແລ້ວ
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: ຕາຕະລາງລາຍການ (VIEW RECEIPT ໄດ້) ================= */}
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

            {/* Transaction Rows */}
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

                    {/* Right: View Receipt + Channel Badge + Amount + Edit/Delete */}
                    <div className="flex items-center gap-2.5 sm:gap-3.5">
                      
                      {/* 🌟 ປຸ່ມ VIEW RECEIPT ສຳລັບລາຍການທີ່ມີໃບບິນ */}
                      {tx.receiptUrl ? (
                        <button
                          onClick={() => setPreviewModalUrl(tx.receiptUrl)}
                          className="p-1.5 rounded-lg bg-[#001839]/5 hover:bg-[#001839]/10 text-[#001839] border border-[#001839]/10 transition cursor-pointer"
                          title="ເບິ່ງຮູບໃບບິນ (View Receipt)"
                        >
                          <Eye strokeWidth={1.4} className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="w-7 text-center text-slate-200 text-xs font-serif">-</span>
                      )}

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
                      <div className="text-right min-w-[100px]">
                        <p className={`text-xs font-serif font-bold ${isInc ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {showPrivacy ? '••••••' : `${isInc ? '+' : '-'}${Number(tx.amount).toLocaleString()} ₭`}
                        </p>
                      </div>

                      {/* Edit & Delete Buttons */}
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => openPinModal('edit', tx)} 
                          className="p-1.5 text-slate-400 hover:text-[#001839] transition cursor-pointer"
                          title="Edit (ຕ້ອງການ PIN)"
                        >
                          <Edit3 strokeWidth={1.4} className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => openPinModal('delete', tx)} 
                          className="p-1.5 text-slate-400 hover:text-rose-500 transition cursor-pointer"
                          title="Delete (ຕ້ອງການ PIN)"
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

      {/* ================= 4. 🌟 FULL RECEIPT IMAGE PREVIEW MODAL ================= */}
      {previewModalUrl && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white p-5 rounded-3xl max-w-2xl max-h-[90vh] flex flex-col gap-3 border border-slate-200 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
              <span className="text-xs font-serif tracking-wider text-[#001839] uppercase font-bold flex items-center gap-1.5">
                <ImageIcon strokeWidth={1.4} className="w-4 h-4" /> Receipt Image Preview
              </span>
              <button 
                onClick={() => setPreviewModalUrl(null)} 
                className="cursor-pointer text-slate-400 hover:text-slate-600 transition"
              >
                <X strokeWidth={1.4} className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex items-center justify-center p-1 bg-slate-50 rounded-2xl border border-slate-100">
              <img src={previewModalUrl} alt="Receipt Preview" className="max-h-[75vh] w-auto object-contain rounded-xl" />
            </div>
          </div>
        </div>
      )}

      {/* ================= 5. 🌟 LUXURY PIN MODAL WITH DEEP BLUE DOTS (#001839) ================= */}
      {pinActionType && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl border border-slate-200 text-center space-y-4">
            
            <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-1.5 text-xs font-serif uppercase tracking-wider text-[#001839] font-bold">
                <Lock strokeWidth={1.4} className="w-4 h-4 text-[#001839]" />
                <span>Security PIN Verification</span>
              </div>
              <button onClick={closePinModal} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X strokeWidth={1.4} className="w-4 h-4" />
              </button>
            </div>

            <div>
              <p className="text-xs text-slate-500 font-sans">
                {pinActionType === 'edit' ? 'ປ້ອນລະຫັດ PIN ເພື່ອແກ້ໄຂລາຍການ' : 'ປ້ອນລະຫັດ PIN ເພື່ອລຶບລາຍການ'}
              </p>
            </div>

            {/* 🌟 4 DEEP BLUE CIRCLE DOTS (#001839) ຕອນກົດລະຫັດປ່ຽນເປັນເມັດສີຟ້າເຂັ້ມ */}
            <div className="flex justify-center items-center gap-3.5 my-3">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full transition-all duration-200 ${
                    enteredPinDigits.length > idx
                      ? 'bg-[#001839] scale-110 shadow-sm border border-[#001839]'
                      : 'border-2 border-slate-300 bg-slate-50'
                  }`}
                />
              ))}
            </div>

            {pinErrorMessage && (
              <p className="text-xs text-rose-600 font-sans font-medium">{pinErrorMessage}</p>
            )}

            {/* Numeric Keypad (Pure Luxury SVG Layout) */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handlePinDigitPress(num)}
                  className="h-11 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-800 font-serif text-base font-bold transition cursor-pointer border border-slate-100 active:scale-95"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={closePinModal}
                className="h-11 rounded-2xl text-xs font-serif uppercase tracking-wider text-slate-400 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handlePinDigitPress('0')}
                className="h-11 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-800 font-serif text-base font-bold transition cursor-pointer border border-slate-100 active:scale-95"
              >
                0
              </button>
              <button
                type="button"
                onClick={handlePinBackspace}
                className="h-11 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-600 font-serif text-xs uppercase transition cursor-pointer border border-slate-100 active:scale-95 flex items-center justify-center"
                title="Backspace"
              >
                ←
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
