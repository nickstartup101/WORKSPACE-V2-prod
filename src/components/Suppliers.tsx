import React, { useState, useEffect, useMemo, useRef } from 'react';
import { auth, db } from '../firebase';
import { 
  collection, addDoc, onSnapshot, 
  deleteDoc, doc, setDoc, updateDoc, serverTimestamp,
  query, where, limit 
} from 'firebase/firestore';
import { 
  Plus, Trash2, Search, Download, 
  List, Receipt, Image as ImageIcon, Upload, Eye, X, Truck,
  Sparkles, Bot, Check, Key, Calendar, ChevronLeft, ChevronRight, Zap,
  CreditCard, Wallet, Building2, Store, Edit3, ImagePlus
} from 'lucide-react';
import { format, subMonths, addMonths } from 'date-fns';
import { utils, writeFile } from 'xlsx';
import { useTranslation } from 'react-i18next';

const LAO_MONTHS = [
  'ມັງກອນ (Jan)', 'ກຸມພາ (Feb)', 'ມີນາ (Mar)', 'ເມສາ (Apr)', 
  'ພຶດສະພາ (May)', 'ມິຖຸນາ (Jun)', 'ກໍລະກົດ (Jul)', 'ສິງຫາ (Aug)', 
  'ກັນຍາ (Sep)', 'ຕຸລາ (Oct)', 'ພະຈິກ (Nov)', 'ທັນວາ (Dec)'
];

const DEFAULT_SUPPLIERS = [
  { id: 'CHANHOM', name: 'CHANHOM', code: 'CH' },
  { id: 'LATDA', name: 'LATDA', code: 'LD' },
  { id: 'LUCKKHANA', name: 'ລັກຂະນາ (LUCKKHANA)', code: 'LK' },
  { id: 'SOKTHAVY', name: 'Sokthavy', code: 'ST' },
  { id: 'LAZADA', name: 'Lazada', code: 'LZ' },
  { id: 'HEAVENLY', name: 'HEAVENLY', code: 'HV' },
  { id: 'DMART', name: 'DMART', code: 'DM' },
  { id: 'MARRY_ANN', name: 'MARRY ANN', code: 'MA' },
  { id: 'OTHER', name: 'Other', code: 'OT' }
];

export type PaymentMethod = 'Onepay' | 'LDB' | 'Cash';
export type ExpenseCategory = 'purchasing' | 'rental' | 'salary' | 'operation' | 'admin' | 'sales' | 'other';

interface FormItemRow {
  id: string;
  productId: string;
  productSearch: string;
  unit: string;
  priceMode: 'total' | 'per_pack';
  priceOriginal: number;
  displayPrice: string;
  quantity: number;
  quantityPerUnit: number;
  remark: string;
  isDropdownOpen?: boolean;
}

interface ScannedItemPreview {
  rawName: string;
  quantity: number;
  pricePerUnit: number;
  totalPrice: number;
  unit: string;
  matchedProductId: string;
  matchedProductName: string;
}

const toStandardDateString = (raw: any): string => {
  if (!raw) return '';
  if (typeof raw === 'string') {
    const clean = raw.trim().split('T')[0];
    if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts.length === 3) return parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0');
    }
    if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3 && parts[2].length === 4) return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0');
    }
    return clean;
  }
  if (raw && typeof raw.toDate === 'function') {
    try { return format(raw.toDate(), 'yyyy-MM-dd'); } catch { return ''; }
  }
  return '';
};

export default function Suppliers() {
  const { i18n } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prodImgInputRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [suppliersList, setSuppliersList] = useState<any[]>(DEFAULT_SUPPLIERS);
  const [entryMode, setEntryMode] = useState<'batch' | 'single'>('batch');
  const [isDragging, setIsDragging] = useState(false);

  // ເລືອກເດືອນ
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const selectedLedgerMonth = useMemo(() => format(currentDate, 'yyyy-MM'), [currentDate]);
  const [isLedgerLoading, setIsLedgerLoading] = useState<boolean>(true);

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 20;

  // Modals
  const [showProductManager, setShowProductManager] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Form ສ້າງ/ແກ້ໄຂສິນຄ້າ (ພ້ອມອັບໂຫຼດຮູບ)
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [prodFormName, setProdFormName] = useState('');
  const [prodFormUnit, setProdFormUnit] = useState('UNIT');
  const [prodFormPackSize, setProdFormPackSize] = useState('');
  const [prodFormSku, setProdFormSku] = useState('');
  const [prodFormImageBase64, setProdFormImageBase64] = useState('');
  const [prodSaving, setProdSaving] = useState(false);

  // Form ສ້າງຮ້ານຄ້າໃໝ່
  const [newSupName, setNewSupName] = useState('');
  const [newSupCode, setNewSupCode] = useState('');

  // Form State ບັນທຶກບິນ
  const [billDate, setBillDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [billTime, setBillTime] = useState<string>(format(new Date(), 'HH:mm'));
  const [supplier, setSupplier] = useState<string>('CHANHOM');
  const [category, setCategory] = useState<ExpenseCategory>('purchasing');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Onepay');
  const [currency, setCurrency] = useState<string>('LAK');
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [billImageBase64, setBillImageBase64] = useState<string>('');
  const [billRemark, setBillRemark] = useState<string>('');
  const [saveLoading, setSaveLoading] = useState(false);

  const [billItems, setBillItems] = useState<FormItemRow[]>([
    {
      id: 'item-1',
      productId: '',
      productSearch: '',
      unit: 'UNIT',
      priceMode: 'total',
      priceOriginal: 0,
      displayPrice: '',
      quantity: 1,
      quantityPerUnit: 1,
      remark: '',
      isDropdownOpen: false
    }
  ]);

  const generatedBillNo = useMemo(() => {
    try {
      const parts = billDate.split('-');
      if (parts.length === 3) {
        const ddmmyyyy = parts[2] + parts[1] + parts[0];
        const matched = suppliersList.find(s => s.name === supplier || s.id === supplier);
        const code = matched ? (matched.code || matched.name.slice(0, 2).toUpperCase()) : 'OT';
        return '#' + ddmmyyyy + code;
      }
    } catch {}
    return '#' + format(new Date(), 'ddMMyyyy') + 'OT';
  }, [billDate, supplier, suppliersList]);

  // 1. ດຶງຂໍ້ມູນ Real-time: Products, Supplier Prices, Supplier List
  useEffect(() => {
    setIsLedgerLoading(true);

    const unsubP = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const monthStart = selectedLedgerMonth + '-01';
    const monthEnd = selectedLedgerMonth + '-31';

    const qSupplierPrices = query(
      collection(db, 'supplierPrices'),
      where('date', '>=', monthStart),
      where('date', '<=', monthEnd)
    );

    const unsubS = onSnapshot(qSupplierPrices, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSupplierPrices(docs);
      setCurrentPage(1);
      setIsLedgerLoading(false);
    }, () => {
      const fallbackQ = query(collection(db, 'supplierPrices'), limit(50));
      onSnapshot(fallbackQ, (fallbackSnap) => {
        setSupplierPrices(fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setIsLedgerLoading(false);
      });
    });

    const unsubSup = onSnapshot(doc(db, 'settings', 'supplier_list'), (snap) => {
      if (snap.exists() && Array.isArray(snap.data()?.suppliers)) {
        setSuppliersList(snap.data().suppliers);
      }
    });

    return () => {
      unsubP();
      unsubS();
      unsubSup();
    };
  }, [selectedLedgerMonth]);

  const sortedSupplierPrices = useMemo(() => {
    return [...supplierPrices].sort((a, b) => {
      const dateA = toStandardDateString(a.date || a.createdAt);
      const dateB = toStandardDateString(b.date || b.createdAt);
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return String(b.time || '').localeCompare(String(a.time || ''));
    });
  }, [supplierPrices]);

  const paginatedSupplierPrices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedSupplierPrices.slice(start, start + pageSize);
  }, [sortedSupplierPrices, currentPage]);

  const totalPages = Math.ceil(sortedSupplierPrices.length / pageSize) || 1;

  const ledgerTotalLAK = useMemo(() => {
    return sortedSupplierPrices.reduce((acc, p) => acc + Number(p.totalPriceLAK || 0), 0);
  }, [sortedSupplierPrices]);

  const handlePrevMonth = () => {
    setIsLedgerLoading(true);
    setCurrentDate(prev => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setIsLedgerLoading(true);
    setCurrentDate(prev => addMonths(prev, 1));
  };

  // 🌟 ບີບອັດຮູບໃບບິນ
  const processImageFile = (file: File) => {
    if (!file || !file.type.startsWith('image/')) {
      alert('ກະລຸນາເລືອກໄຟລ໌ຮູບພາບ (JPG, PNG)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 750;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = img.width > MAX_WIDTH ? MAX_WIDTH : img.width;
        canvas.height = img.width > MAX_WIDTH ? (img.height * scaleSize) : img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        setBillImageBase64(canvas.toDataURL('image/jpeg', 0.45));
      };
    };
    reader.readAsDataURL(file);
  };

  // 🌟 ບີບອັດຮູບສິນຄ້າ (Thumbnail < 25KB)
  const processProductImageFile = (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const SIZE = 240;
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, SIZE, SIZE);
        setProdFormImageBase64(canvas.toDataURL('image/jpeg', 0.7));
      };
    };
    reader.readAsDataURL(file);
  };

  // 🌟 ຮອງຮັບ Ctrl+V ສຳລັບຮູບໃບບິນ ແລະ ຮູບສິນຄ້າ
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            // ຖ້າກຳລັງເປີດ Modal ຈັດການສິນຄ້າຢູ່ ➔ ວາງໃສ່ຮູບສິນຄ້າ
            if (showProductManager) {
              processProductImageFile(blob);
            } else {
              // ຖ້າຢູ່ໜ້າຫຼັກ ➔ ວາງໃສ່ຮູບໃບບິນ
              processImageFile(blob);
            }
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [showProductManager]);

  // ບັນທຶກສິນຄ້າໃໝ່ ຫຼື ອັບເດດຮູບສິນຄ້າເກົ່າ
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodFormName.trim()) return;

    try {
      setProdSaving(true);
      const dataToSave: any = {
        name: prodFormName.trim(),
        unit: prodFormUnit.trim() || 'UNIT',
        packSize: prodFormPackSize.trim() || '',
        sku: prodFormSku.trim().toUpperCase() || '',
        updatedAt: serverTimestamp()
      };

      if (prodFormImageBase64) {
        dataToSave.imageUrl = prodFormImageBase64;
      }

      if (editingProductId) {
        await updateDoc(doc(db, 'products', editingProductId), dataToSave);
      } else {
        dataToSave.createdAt = serverTimestamp();
        dataToSave.isApproved = true;
        await addDoc(collection(db, 'products'), dataToSave);
      }

      setEditingProductId(null);
      setProdFormName('');
      setProdFormUnit('UNIT');
      setProdFormPackSize('');
      setProdFormSku('');
      setProdFormImageBase64('');
      alert('✅ ບັນທຶກສິນຄ້າ ແລະ ຮູບພາບສຳເລັດ!');
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setProdSaving(false);
    }
  };

  const handleEditProductClick = (prod: any) => {
    setEditingProductId(prod.id);
    setProdFormName(prod.name || '');
    setProdFormUnit(prod.unit || 'UNIT');
    setProdFormPackSize(prod.packSize || '');
    setProdFormSku(prod.sku || '');
    setProdFormImageBase64(prod.imageUrl || '');
  };

  // ຈັດການຮ້ານຄ້າ
  const handleAddSupplier = async () => {
    if (!newSupName.trim()) return;
    const cleanCode = newSupCode.trim().toUpperCase() || newSupName.trim().slice(0, 2).toUpperCase();
    const newEntry = {
      id: newSupName.trim().toUpperCase().replace(/\s+/g, '_'),
      name: newSupName.trim(),
      code: cleanCode
    };
    const updated = [...suppliersList, newEntry];
    setSuppliersList(updated);
    try {
      await setDoc(doc(db, 'settings', 'supplier_list'), { suppliers: updated }, { merge: true });
    } catch {}
    setNewSupName('');
    setNewSupCode('');
  };

  const handleDeleteSupplier = async (supId: string) => {
    const updated = suppliersList.filter(s => s.id !== supId);
    setSuppliersList(updated);
    try {
      await setDoc(doc(db, 'settings', 'supplier_list'), { suppliers: updated }, { merge: true });
    } catch {}
  };

  const updateItemRow = (index: number, fields: Partial<FormItemRow>) => {
    setBillItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...fields };
      return updated;
    });
  };

  const addNewItemRow = () => {
    setBillItems(prev => [
      ...prev,
      {
        id: 'item-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        productId: '',
        productSearch: '',
        unit: 'UNIT',
        priceMode: 'total',
        priceOriginal: 0,
        displayPrice: '',
        quantity: 1,
        quantityPerUnit: 1,
        remark: '',
        isDropdownOpen: false
      }
    ]);
  };

  const removeItemRow = (index: number) => {
    if (billItems.length === 1) return;
    setBillItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleItemPriceChange = (index: number, rawVal: string) => {
    const cleanNum = rawVal.replace(/,/g, '');
    if (cleanNum === '' || !isNaN(Number(cleanNum))) {
      updateItemRow(index, {
        displayPrice: Number(cleanNum || 0).toLocaleString(),
        priceOriginal: Number(cleanNum) || 0
      });
    }
  };

  const grandTotalLAK = useMemo(() => {
    const rate = currency === 'LAK' ? 1 : (Number(exchangeRate) || 1);
    return billItems.reduce((acc, item) => {
      const orig = Number(item.priceOriginal) || 0;
      const qty = Number(item.quantity) || 1;
      const totalOrig = item.priceMode === 'total' ? orig : orig * qty;
      return acc + (totalOrig * rate);
    }, 0);
  }, [billItems, currency, exchangeRate]);

  // ບັນທຶກບິນ
  const handleSaveBillBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplier) {
      alert('ກະລຸນາເລືອກຜູ້ສະໜອງ (Supplier)');
      return;
    }

    for (let i = 0; i < billItems.length; i++) {
      if (!billItems[i].productId) {
        alert('ລາຍການທີ ' + (i + 1) + ' ຍັງບໍ່ໄດ້ເລືອກສິນຄ້າ.');
        return;
      }
    }

    try {
      setSaveLoading(true);
      const batchGroupId = 'bill_' + Date.now();
      const finalRate = currency === 'LAK' ? 1 : (Number(exchangeRate) || 1);

      for (let i = 0; i < billItems.length; i++) {
        const item = billItems[i];
        const qty = Number(item.quantity) || 1;
        const qtyPerUnit = Number(item.quantityPerUnit) || 1;
        let singlePriceOriginal = Number(item.priceOriginal) || 0;

        if (item.priceMode === 'total') {
          singlePriceOriginal = Number(item.priceOriginal) / qty;
        }

        const calculatedPriceLAK = singlePriceOriginal * finalRate;
        const totalOriginal = item.priceMode === 'total' ? Number(item.priceOriginal) : singlePriceOriginal * qty;
        const totalLAK = totalOriginal * finalRate;

        const imageToSave = (i === 0) ? (billImageBase64 || '') : '';

        await addDoc(collection(db, 'supplierPrices'), {
          billNo: generatedBillNo,
          batchGroupId,
          billImageUrl: imageToSave,
          billRemark: billRemark.trim(),
          productId: item.productId,
          supplier,
          category,
          paymentMethod,
          currency,
          exchangeRate: finalRate,
          priceOriginal: singlePriceOriginal,
          priceLAK: calculatedPriceLAK,
          totalPriceOriginal: totalOriginal,
          totalPriceLAK: totalLAK,
          quantity: qty,
          quantityPerUnit: qtyPerUnit,
          unit: item.unit || 'UNIT',
          remark: item.remark || '',
          date: billDate,
          time: billTime,
          priceMode: item.priceMode,
          createdAt: serverTimestamp(),
          userId: auth.currentUser?.uid || 'admin',
          userEmail: auth.currentUser?.email || 'admin@example.com',
        });
      }

      alert('ບັນທຶກເລກບິນ ' + generatedBillNo + ' ສຳເລັດ!');
      setBillImageBase64('');
      setBillRemark('');
      setBillItems([{
        id: 'item-' + Date.now(),
        productId: '',
        productSearch: '',
        unit: 'UNIT',
        priceMode: 'total',
        priceOriginal: 0,
        displayPrice: '',
        quantity: 1,
        quantityPerUnit: 1,
        remark: '',
        isDropdownOpen: false
      }]);
    } catch (err: any) {
      alert('Error saving to Firestore: ' + err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (window.confirm('ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບລາຍການນີ້?')) {
      try {
        await deleteDoc(doc(db, 'supplierPrices', id));
      } catch (err: any) {
        alert('Error: ' + err.message);
      }
    }
  };

  return (
    <div className="space-y-6">

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white dark:bg-[#073069] rounded-[2rem] border border-slate-200/80 dark:border-white/10 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Truck className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                {i18n.language === 'la' ? 'ລະບົບຈັດຊື້ & ຜູ້ສະໜອງ (Supplier Procurement)' : 'Supplier Procurement Desk'}
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[9px] font-black uppercase flex items-center gap-1">
                <Zap className="w-2.5 h-2.5" /> High-Speed
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
              {products.length + ' ສິນຄ້າໃນຄັງ • ສະແດງເດືອນ ' + selectedLedgerMonth + ' (' + sortedSupplierPrices.length + ' ບິນ)'}
            </p>
          </div>
        </div>

        {/* ປຸ່ມຈັດການຮ້ານຄ້າ & ສິນຄ້າ */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowSupplierModal(true)}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-white rounded-xl text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Store className="w-3.5 h-3.5 text-indigo-500" />
            <span>ຈັດການຮ້ານຄ້າ ({suppliersList.length})</span>
          </button>

          <button 
            onClick={() => setShowProductManager(true)}
            className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
          >
            <List className="w-3.5 h-3.5" />
            <span>ຈັດການສິນຄ້າ ({products.length})</span>
          </button>
        </div>
      </div>

      {/* 🌟 ປັບ items-stretch ໃຫ້ສອງ Card ສູງເທົ່າກັນ 100% */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">

        {/* ======================================================== */}
        {/* LEFT: Bill Entry Form */}
        {/* ======================================================== */}
        <div className="xl:col-span-5 flex flex-col h-full">
          <div className="bg-white dark:bg-[#073069] p-5 sm:p-6 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-xl flex flex-col h-full space-y-4">
            
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-white/10 pb-3">
              <div>
                <span className="px-2.5 py-1 bg-primary/10 text-primary rounded-full text-[9px] font-black uppercase">
                  {entryMode === 'batch' ? 'MULTI-ITEM BILL' : 'SINGLE ENTRY'}
                </span>
                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase mt-1 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-500" />
                  <span>ບັນທຶກໃບບິນຈັດຊື້</span>
                </h3>
              </div>

              <div className="flex bg-slate-100 dark:bg-black/20 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setEntryMode('batch')}
                  className={
                    "px-3 py-1 text-[10px] font-black uppercase rounded-lg cursor-pointer " +
                    (entryMode === 'batch' ? "bg-[#052659] text-white" : "text-slate-500")
                  }
                >
                  ຫຼາຍລາຍການ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEntryMode('single');
                    if (billItems.length > 1) setBillItems([billItems[0]]);
                  }}
                  className={
                    "px-3 py-1 text-[10px] font-black uppercase rounded-lg cursor-pointer " +
                    (entryMode === 'single' ? "bg-[#052659] text-white" : "text-slate-500")
                  }
                >
                  ລາຍການດ່ຽວ
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveBillBatch} className="space-y-3.5 flex-1 flex flex-col justify-between">
              <div className="space-y-3.5">
                {/* 🌟 ອັບໂຫຼດຮູບໃບບິນ (Drop ຫຼື Ctrl+V) */}
                <div 
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.[0]) processImageFile(e.dataTransfer.files[0]); }}
                  className={
                    "p-3 rounded-2xl border-2 border-dashed transition-all " +
                    (isDragging ? "border-emerald-500 bg-emerald-500/10" : "border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-[#052659]/50")
                  }
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-300 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                      <span>Receipt Image (Drop ຫຼື Ctrl+V)</span>
                    </span>
                    {billImageBase64 && (
                      <button type="button" onClick={() => setBillImageBase64('')} className="text-[9px] font-black text-red-500 uppercase cursor-pointer">Remove</button>
                    )}
                  </div>

                  {billImageBase64 ? (
                    <div className="relative rounded-xl overflow-hidden max-h-32 bg-black/10 flex items-center justify-center">
                      <img src={billImageBase64} alt="Receipt" className="w-full h-32 object-contain cursor-pointer" onClick={() => setPreviewImageUrl(billImageBase64)} />
                    </div>
                  ) : (
                    <div>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        accept="image/*" 
                        onChange={e => e.target.files?.[0] && processImageFile(e.target.files[0])} 
                        className="hidden" 
                        id="supplier-upload" 
                      />
                      <label htmlFor="supplier-upload" className="w-full py-3 rounded-xl border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-1 cursor-pointer text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all">
                        <Upload className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">ອັບໂຫຼດຮູບໃບບິນ (Drop / Ctrl+V)</span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Date, Time, Bill No */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400">Date</label>
                    <input 
                      type="date"
                      required
                      className="w-full h-9 px-2 rounded-xl bg-slate-50 dark:bg-white/5 border text-xs font-bold"
                      value={billDate}
                      onChange={e => setBillDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400">Time</label>
                    <input 
                      type="time"
                      required
                      className="w-full h-9 px-2 rounded-xl bg-slate-50 dark:bg-white/5 border text-xs font-bold"
                      value={billTime}
                      onChange={e => setBillTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400">Bill No.</label>
                    <div className="w-full h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 font-mono font-black text-xs flex items-center justify-center">
                      {generatedBillNo}
                    </div>
                  </div>
                </div>

                {/* Supplier, Category, Payment */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400">Supplier</label>
                    <select 
                      className="w-full h-9 px-2 rounded-xl bg-slate-50 dark:bg-white/5 border text-xs font-bold cursor-pointer"
                      value={supplier}
                      onChange={e => setSupplier(e.target.value)}
                    >
                      {suppliersList.map(s => (
                        <option key={s.id} value={s.name}>{s.name} ({s.code})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400">Category</label>
                    <select 
                      className="w-full h-9 px-2 rounded-xl bg-slate-50 dark:bg-white/5 border text-xs font-bold cursor-pointer"
                      value={category}
                      onChange={e => setCategory(e.target.value as any)}
                    >
                      <option value="purchasing">Purchasing</option>
                      <option value="rental">Rental</option>
                      <option value="salary">Salary</option>
                      <option value="operation">Operation</option>
                      <option value="admin">Admin</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-rose-500">Payment</label>
                    <select 
                      className="w-full h-9 px-2 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-500/30 text-xs font-bold text-rose-600 dark:text-rose-400 cursor-pointer"
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value as any)}
                    >
                      <option value="Onepay">OnePay (ໂອນ)</option>
                      <option value="LDB">LDB</option>
                      <option value="Cash">Cash (ເງິນສົດ)</option>
                    </select>
                  </div>
                </div>

                {/* Currency & Exchange Rate */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400">Currency</label>
                    <select
                      value={currency}
                      onChange={e => {
                        setCurrency(e.target.value);
                        if (e.target.value === 'LAK') setExchangeRate(1);
                        else if (e.target.value === 'THB') setExchangeRate(650);
                      }}
                      className="w-full h-9 px-2 rounded-xl bg-slate-50 dark:bg-white/5 border text-xs font-bold cursor-pointer"
                    >
                      <option value="LAK">LAK (ກີບ)</option>
                      <option value="THB">THB (ບາດ)</option>
                    </select>
                  </div>
                  {currency !== 'LAK' && (
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400">Rate</label>
                      <input
                        type="number"
                        step="any"
                        value={exchangeRate}
                        onChange={e => setExchangeRate(parseFloat(e.target.value) || 1)}
                        className="w-full h-9 px-2 rounded-xl bg-slate-50 dark:bg-white/5 border text-xs font-bold font-mono"
                      />
                    </div>
                  )}
                </div>

                {/* Items in Bill */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[9.5px] font-black uppercase text-slate-400">Items in this Bill</label>
                    {entryMode === 'batch' && (
                      <button
                        type="button"
                        onClick={addNewItemRow}
                        className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-[9.5px] font-black uppercase flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> ເພີ່ມລາຍການ
                      </button>
                    )}
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {billItems.map((item, index) => {
                      const selectedProd = products.find(p => p.id === item.productId);

                      return (
                        <div key={item.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-[#052659]/60 border border-slate-200 dark:border-white/10 space-y-2 relative">
                          {billItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeItemRow(index)}
                              className="absolute top-2 right-2 text-red-400 hover:text-red-500 p-0.5 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <div className="space-y-1 relative pr-6">
                            <label className="text-[8.5px] font-black uppercase text-slate-400">Product #{index + 1}</label>
                            <input 
                              type="text"
                              required
                              className={
                                "w-full h-8 px-2.5 pr-8 rounded-xl bg-white dark:bg-[#073069] border text-xs font-bold outline-none cursor-pointer " +
                                (!item.productId && item.productSearch ? "border-amber-400" : "border-slate-200 dark:border-white/10 text-slate-800 dark:text-white")
                              }
                              placeholder="ຄົ້ນຫາຊື່ສິນຄ້າ..."
                              value={item.isDropdownOpen ? item.productSearch : (selectedProd?.name || item.productSearch)}
                              onFocus={() => updateItemRow(index, { isDropdownOpen: true })}
                              onClick={() => updateItemRow(index, { isDropdownOpen: true })}
                              onChange={(e) => updateItemRow(index, { productSearch: e.target.value, isDropdownOpen: true, productId: '' })}
                            />
                            <Search className="absolute right-8 top-6 w-3 h-3 text-slate-400 pointer-events-none" />

                            {item.isDropdownOpen && (
                              <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-[#073069] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl max-h-48 overflow-y-auto">
                                {products
                                  .filter(p => !item.productSearch || p.name.toLowerCase().includes(item.productSearch.toLowerCase()))
                                  .map(p => (
                                    <button
                                      key={p.id}
                                      type="button"
                                      className="w-full text-left p-2 hover:bg-slate-100 dark:hover:bg-white/10 border-b border-slate-50 dark:border-white/5 flex items-center justify-between cursor-pointer"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        updateItemRow(index, {
                                          productId: p.id,
                                          productSearch: p.name,
                                          unit: p.unit || item.unit,
                                          isDropdownOpen: false
                                        });
                                      }}
                                    >
                                      <div className="flex items-center gap-2">
                                        {p.imageUrl ? (
                                          <img src={p.imageUrl} alt="" className="w-6 h-6 object-cover rounded-md" />
                                        ) : (
                                          <div className="w-6 h-6 rounded-md bg-slate-200 dark:bg-white/10 flex items-center justify-center text-[9px] font-bold">
                                            {p.name.slice(0, 1)}
                                          </div>
                                        )}
                                        <span className="text-xs font-bold text-slate-800 dark:text-white">{p.name}</span>
                                      </div>
                                      <span className="text-[9px] text-slate-400 uppercase">{p.unit || 'UNIT'}</span>
                                    </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-12 gap-1.5">
                            <div className="col-span-6">
                              <label className="text-[8px] font-black uppercase text-slate-400">Price ({currency})</label>
                              <input 
                                type="text"
                                required
                                placeholder="ລາຄາ"
                                className="w-full h-8 px-2 rounded-xl bg-white dark:bg-[#073069] border text-xs font-mono font-bold"
                                value={item.displayPrice}
                                onChange={e => handleItemPriceChange(index, e.target.value)}
                              />
                            </div>
                            <div className="col-span-3">
                              <label className="text-[8px] font-black uppercase text-slate-400">Qty</label>
                              <input 
                                type="number"
                                min="1"
                                step="any"
                                required
                                placeholder="ຈຳນວນ"
                                className="w-full h-8 px-1.5 rounded-xl bg-white dark:bg-[#073069] border text-xs font-mono font-bold text-center"
                                value={item.quantity || ''}
                                onChange={e => updateItemRow(index, { quantity: parseFloat(e.target.value) || 1 })}
                              />
                            </div>
                            <div className="col-span-3">
                              <label className="text-[8px] font-black uppercase text-slate-400">Unit</label>
                              <input 
                                type="text"
                                placeholder="ຫົວໜ່ວຍ"
                                className="w-full h-8 px-1.5 rounded-xl bg-white dark:bg-[#073069] border text-xs font-bold text-center uppercase"
                                value={item.unit}
                                onChange={e => updateItemRow(index, { unit: e.target.value })}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400">Remark (ໝາຍເຫດ)</label>
                  <input 
                    type="text"
                    placeholder="ໝາຍເຫດ..."
                    className="w-full h-8 px-3 rounded-xl bg-slate-50 dark:bg-white/5 border text-xs"
                    value={billRemark}
                    onChange={e => setBillRemark(e.target.value)}
                  />
                </div>
              </div>

              {/* Total & Submit Button */}
              <div className="space-y-3 pt-2">
                <div className="p-3 bg-[#052659] text-white rounded-2xl flex justify-between items-center">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#5483B3]">Total Cost (LAK)</p>
                    <p className="text-base font-black font-mono">{Math.round(grandTotalLAK).toLocaleString()} ₭</p>
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={saveLoading}
                  className="w-full h-11 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase rounded-2xl shadow-lg cursor-pointer transition-all disabled:opacity-50"
                >
                  {saveLoading ? 'SAVING...' : 'ບັນທຶກໃບບິນຈັດຊື້ (' + generatedBillNo + ')'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ======================================================== */}
        {/* RIGHT: Active Procurement Ledger (Design ໃໝ່ 100%) */}
        {/* ======================================================== */}
        <div className="xl:col-span-7 flex flex-col h-full space-y-4">
          
          <div cl
