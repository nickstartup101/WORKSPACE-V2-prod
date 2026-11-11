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
  Calendar, ChevronLeft, ChevronRight,
  Store, Edit3, ImagePlus, CheckCircle2
} from 'lucide-react';
import { format, subMonths, addMonths } from 'date-fns';
import * as XLSX from 'xlsx';
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

  // Month selector
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

  // Product form
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [prodFormName, setProdFormName] = useState('');
  const [prodFormUnit, setProdFormUnit] = useState('UNIT');
  const [prodFormPackSize, setProdFormPackSize] = useState('');
  const [prodFormSku, setProdFormSku] = useState('');
  const [prodFormImageBase64, setProdFormImageBase64] = useState('');
  const [prodSaving, setProdSaving] = useState(false);

  // Supplier form
  const [newSupName, setNewSupName] = useState('');
  const [newSupCode, setNewSupCode] = useState('');

  // Bill Form
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

  // Real-time Sync
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

  const processImageFile = (blobOrFile: Blob | File) => {
    if (!blobOrFile) return;
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
    reader.readAsDataURL(blobOrFile);
  };

  const processProductImageFile = (blobOrFile: Blob | File) => {
    if (!blobOrFile) return;
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
    reader.readAsDataURL(blobOrFile);
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const clipboard = e.clipboardData;
      if (!clipboard) return;

      let foundImage = false;

      if (clipboard.files && clipboard.files.length > 0) {
        for (let i = 0; i < clipboard.files.length; i++) {
          const file = clipboard.files[i];
          if (file.type.startsWith('image/')) {
            e.preventDefault();
            if (showProductManager) processProductImageFile(file);
            else processImageFile(file);
            foundImage = true;
            break;
          }
        }
      }

      if (!foundImage && clipboard.items) {
        for (let i = 0; i < clipboard.items.length; i++) {
          const item = clipboard.items[i];
          if (item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            if (blob) {
              e.preventDefault();
              if (showProductManager) processProductImageFile(blob);
              else processImageFile(blob);
              foundImage = true;
              break;
            }
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [showProductManager]);

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

      if (prodFormImageBase64) dataToSave.imageUrl = prodFormImageBase64;

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
      alert('✅ ບັນທຶກສິນຄ້າສຳເລັດ!');
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
    <div className="min-h-screen bg-slate-100/90 text-slate-800 p-4 sm:p-5 space-y-5">

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#001839]/5 text-[#001839] flex items-center justify-center border border-[#001839]/10">
            <Truck strokeWidth={1.4} className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-serif tracking-tight text-[#001839]">
                {i18n.language === 'la' ? 'ລະບົບຈັດຊື້ & ຜູ້ສະໜອງ' : 'Supplier Procurement'}
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-[#001839] text-white text-[8.5px] font-serif uppercase tracking-[0.2em]">
                Luxury Editorial
              </span>
            </div>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              {products.length} ສິນຄ້າ • <span className="font-serif">Month {selectedLedgerMonth}</span> ({sortedSupplierPrices.length} ບິນ)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowSupplierModal(true)}
            className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-[#001839] rounded-xl text-xs font-serif uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition border border-slate-200 shadow-xs"
          >
            <Store strokeWidth={1.4} className="w-3.5 h-3.5 text-[#001839]" />
            <span>Suppliers ({suppliersList.length})</span>
          </button>

          <button 
            onClick={() => setShowProductManager(true)}
            className="px-3.5 py-2 bg-[#001839] hover:bg-[#00285d] text-white rounded-xl text-xs font-serif uppercase tracking-wider flex items-center gap-1.5 shadow-sm cursor-pointer transition"
          >
            <List strokeWidth={1.4} className="w-3.5 h-3.5" />
            <span>Products ({products.length})</span>
          </button>
        </div>
      </div>

      {/* Grid: items-start ເພື່ອໃຫ້ຟອມຊ້າຍຍັບຕາມເນື້ອຫາຕົວຈິງ ບໍ່ຍືດຊ່ອງຫວ່າງຂາວ */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">

        {/* ================= LEFT: Bill Entry Form ================= */}
        <div className="xl:col-span-5 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col space-y-4">
          
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <span className="px-2 py-0.5 bg-[#001839]/5 text-[#001839] rounded-full text-[8.5px] font-serif uppercase tracking-[0.2em]">
                {entryMode === 'batch' ? 'Multi-Item Bill' : 'Single Entry'}
              </span>
              <h3 className="text-sm font-serif tracking-tight text-[#001839] uppercase mt-1 flex items-center gap-2">
                <Receipt strokeWidth={1.4} className="w-4 h-4 text-emerald-700" />
                <span>ບັນທຶກໃບບິນຈັດຊື້</span>
              </h3>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setEntryMode('batch')}
                className={
                  "px-2.5 py-1 text-[10px] font-serif uppercase tracking-wider rounded-lg cursor-pointer transition " +
                  (entryMode === 'batch' ? "bg-[#001839] text-white shadow-xs" : "text-slate-500 hover:text-slate-800")
                }
              >
                Batch
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryMode('single');
                  if (billItems.length > 1) setBillItems([billItems[0]]);
                }}
                className={
                  "px-2.5 py-1 text-[10px] font-serif uppercase tracking-wider rounded-lg cursor-pointer transition " +
                  (entryMode === 'single' ? "bg-[#001839] text-white shadow-xs" : "text-slate-500 hover:text-slate-800")
                }
              >
                Single
              </button>
            </div>
          </div>

          <form onSubmit={handleSaveBillBatch} className="space-y-4">
            
            {/* Receipt Image Dropzone */}
            <div 
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.[0]) processImageFile(e.dataTransfer.files[0]); }}
              className={
                "p-3.5 rounded-2xl border border-dashed transition " +
                (isDragging ? "border-[#001839] bg-slate-50" : "border-slate-300 bg-slate-50/60 hover:bg-slate-50")
              }
            >
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-serif tracking-wider uppercase text-[#001839] flex items-center gap-1.5">
                  <ImageIcon strokeWidth={1.4} className="w-3.5 h-3.5 text-[#001839]" />
                  <span>Receipt Image (Drop / Ctrl+V)</span>
                </span>
                {billImageBase64 && (
                  <button type="button" onClick={() => setBillImageBase64('')} className="text-[9.5px] font-serif text-rose-500 uppercase tracking-widest cursor-pointer hover:underline">Remove</button>
                )}
              </div>

              {billImageBase64 ? (
                <div className="relative rounded-xl overflow-hidden max-h-32 bg-slate-100 flex items-center justify-center border border-slate-200">
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
                  <label htmlFor="supplier-upload" className="w-full py-3.5 rounded-xl border border-slate-200 flex flex-col items-center justify-center gap-1 cursor-pointer text-slate-500 hover:bg-white transition bg-white shadow-xs">
                    <Upload strokeWidth={1.4} className="w-4 h-4 text-emerald-700" />
                    <span className="text-xs font-serif uppercase tracking-wider text-[#001839]">ອັບໂຫຼດຮູບໃບບິນ (Drop / Ctrl+V)</span>
                  </label>
                </div>
              )}
            </div>

            {/* Date, Time, Bill No */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[9.5px] font-serif uppercase tracking-wider text-[#001839] mb-1 block">Date</label>
                <input 
                  type="date"
                  required
                  className="w-full h-8.5 px-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-medium text-[#001839] focus:outline-none focus:border-[#001839]"
                  value={billDate}
                  onChange={e => setBillDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[9.5px] font-serif uppercase tracking-wider text-[#001839] mb-1 block">Time</label>
                <input 
                  type="time"
                  required
                  className="w-full h-8.5 px-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-medium text-[#001839] focus:outline-none focus:border-[#001839]"
                  value={billTime}
                  onChange={e => setBillTime(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[9.5px] font-serif uppercase tracking-wider text-[#001839] mb-1 block">Bill No.</label>
                <div className="w-full h-8.5 rounded-xl bg-slate-100 border border-slate-200 text-[#001839] font-serif text-[11px] font-semibold flex items-center justify-center">
                  {generatedBillNo}
                </div>
              </div>
            </div>

            {/* Supplier, Category, Payment */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[9.5px] font-serif uppercase tracking-wider text-[#001839] mb-1 block">Supplier</label>
                <select 
                  className="w-full h-8.5 px-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-[#001839] cursor-pointer focus:outline-none focus:border-[#001839]"
                  value={supplier}
                  onChange={e => setSupplier(e.target.value)}
                >
                  {suppliersList.map(s => (
                    <option key={s.id} value={s.name}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[9.5px] font-serif uppercase tracking-wider text-[#001839] mb-1 block">Category</label>
                <select 
                  className="w-full h-8.5 px-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-serif text-[#001839] cursor-pointer focus:outline-none focus:border-[#001839]"
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
                <label className="text-[9.5px] font-serif uppercase tracking-wider text-[#001839] mb-1 block">Payment</label>
                <select 
                  className="w-full h-8.5 px-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-serif text-[#001839] cursor-pointer focus:outline-none"
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
                <label className="text-[9.5px] font-serif uppercase tracking-wider text-[#001839] mb-1 block">Currency</label>
                <select
                  value={currency}
                  onChange={e => {
                    setCurrency(e.target.value);
                    if (e.target.value === 'LAK') setExchangeRate(1);
                    else if (e.target.value === 'THB') setExchangeRate(650);
                  }}
                  className="w-full h-8.5 px-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-serif text-[#001839] cursor-pointer focus:outline-none focus:border-[#001839]"
                >
                  <option value="LAK">LAK (ກີບ)</option>
                  <option value="THB">THB (ບາດ)</option>
                </select>
              </div>
              {currency !== 'LAK' && (
                <div>
                  <label className="text-[9.5px] font-serif uppercase tracking-wider text-[#001839] mb-1 block">Exchange Rate</label>
                  <input
                    type="number"
                    step="any"
                    value={exchangeRate}
                    onChange={e => setExchangeRate(parseFloat(e.target.value) || 1)}
                    className="w-full h-8.5 px-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-medium text-[#001839] focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Items in Bill */}
            <div className="space-y-2 pt-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-serif uppercase tracking-wider text-[#001839]">Items in this Bill</label>
                {entryMode === 'batch' && (
                  <button
                    type="button"
                    onClick={addNewItemRow}
                    className="px-2 py-0.5 bg-[#001839]/5 hover:bg-[#001839]/10 text-[#001839] rounded-lg text-[9.5px] font-serif uppercase tracking-wider flex items-center gap-1 cursor-pointer transition border border-[#001839]/10"
                  >
                    <Plus strokeWidth={1.4} className="w-3 h-3" /> Add Item
                  </button>
                )}
              </div>

              {/* Items List (ໄຫຼລົງອັດຕະໂນມັດ) */}
              <div className="space-y-2">
                {billItems.map((item, index) => {
                  const selectedProd = products.find(p => p.id === item.productId);

                  return (
                    <div key={item.id} className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200 space-y-2 relative">
                      {billItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItemRow(index)}
                          className="absolute top-2 right-2 text-slate-400 hover:text-rose-500 p-0.5 cursor-pointer"
                        >
                          <Trash2 strokeWidth={1.4} className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <div className="space-y-1 relative pr-6">
                        <label className="text-[8.5px] font-serif uppercase tracking-wider text-slate-500">Product #{index + 1}</label>
                        <input 
                          type="text"
                          required
                          className={
                            "w-full h-8 px-2.5 pr-8 rounded-xl bg-white border text-xs outline-none cursor-pointer text-[#001839] " +
                            (!item.productId && item.productSearch ? "border-amber-400" : "border-slate-200")
                          }
                          placeholder="ຄົ້ນຫາຊື່ສິນຄ້າ..."
                          value={item.isDropdownOpen ? item.productSearch : (selectedProd?.name || item.productSearch)}
                          onFocus={() => updateItemRow(index, { isDropdownOpen: true })}
                          onClick={() => updateItemRow(index, { isDropdownOpen: true })}
                          onChange={(e) => updateItemRow(index, { productSearch: e.target.value, isDropdownOpen: true, productId: '' })}
                        />
                        <Search strokeWidth={1.4} className="absolute right-8 top-6 w-3 h-3 text-slate-400 pointer-events-none" />

                        {item.isDropdownOpen && (
                          <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-44 overflow-y-auto">
                            {products
                              .filter(p => !item.productSearch || p.name.toLowerCase().includes(item.productSearch.toLowerCase()))
                              .map(p => (
                                <button
                                  key={p.id}
                                  type="button"
                                  className="w-full text-left p-2 hover:bg-slate-50 border-b border-slate-100 flex items-center justify-between cursor-pointer"
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
                                      <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-[9px] font-serif text-[#001839]">
                                        {p.name.slice(0, 1)}
                                      </div>
                                    )}
                                    <span className="text-xs font-medium text-slate-800">{p.name}</span>
                                  </div>
                                  <span className="text-[9px] font-serif text-slate-400 uppercase">{p.unit || 'UNIT'}</span>
                                </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-12 gap-1.5">
                        <div className="col-span-6">
                          <label className="text-[8.5px] font-serif uppercase tracking-wider text-slate-500">Price ({currency})</label>
                          <input 
                            type="text"
                            required
                            placeholder="0"
                            className="w-full h-8 px-2 rounded-xl bg-white border border-slate-200 text-xs font-mono font-medium text-[#001839]"
                            value={item.displayPrice}
                            onChange={e => handleItemPriceChange(index, e.target.value)}
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="text-[8.5px] font-serif uppercase tracking-wider text-slate-500">Qty</label>
                          <input 
                            type="number"
                            min="1"
                            step="any"
                            required
                            placeholder="1"
                            className="w-full h-8 px-1.5 rounded-xl bg-white border border-slate-200 text-xs font-mono font-medium text-center text-[#001839]"
                            value={item.quantity || ''}
                            onChange={e => updateItemRow(index, { quantity: parseFloat(e.target.value) || 1 })}
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="text-[8.5px] font-serif uppercase tracking-wider text-slate-500">Unit</label>
                          <input 
                            type="text"
                            placeholder="UNIT"
                            className="w-full h-8 px-1 rounded-xl bg-white border border-slate-200 text-xs font-serif uppercase text-center text-[#001839]"
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

            {/* Remark Field */}
            <div>
              <label className="text-[9.5px] font-serif uppercase tracking-wider text-[#001839] mb-1 block">Remark (ໝາຍເຫດ)</label>
              <input 
                type="text"
                placeholder="ລາຍລະອຽດເພີ່ມເຕີມ..."
                className="w-full h-8.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-[#001839] focus:outline-none focus:border-[#001839]"
                value={billRemark}
                onChange={e => setBillRemark(e.target.value)}
              />
            </div>

            {/* 🌟 TOTAL CARD & BUTTON: ຍັບຂຶ້ນມາຊິດກ້ອງ Remark ທັນທີ ບໍ່ມີຊ່ອງຫວ່າງຂາວ! */}
            <div className="space-y-2.5 pt-1">
              <div className="p-3.5 bg-[#001839] text-white rounded-2xl flex justify-between items-center shadow-xs">
                <div>
                  <p className="text-[9px] font-serif uppercase tracking-[0.2em] text-white/60">Total Cost (LAK)</p>
                  <p className="text-lg font-serif tracking-tight mt-0.5">{Math.round(grandTotalLAK).toLocaleString()} ₭</p>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={saveLoading}
                className="w-full h-10 bg-[#001839] hover:bg-[#00285d] text-white font-serif text-xs uppercase tracking-widest rounded-2xl shadow-xs cursor-pointer transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <CheckCircle2 strokeWidth={1.4} className="w-4 h-4 text-emerald-400" />
                <span>{saveLoading ? 'Saving...' : 'ບັນທຶກໃບບິນຈັດຊື້ (' + generatedBillNo + ')'}</span>
              </button>
            </div>

          </form>
        </div>

        {/* ================= RIGHT: Active Procurement Ledger ================= */}
        <div className="xl:col-span-7 bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
          
          <div className="p-4 border-b border-slate-100 space-y-3 shrink-0">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h3 className="text-sm font-serif tracking-tight text-[#001839] uppercase flex items-center gap-2">
                  <Receipt strokeWidth={1.4} className="w-4 h-4 text-emerald-700" />
                  <span>Active Procurement Ledger</span>
                </h3>
                <span className="text-[11px] text-slate-500">
                  {'ເດືອນ ' + selectedLedgerMonth + ' • ລວມ: '}
                  <strong className="text-[#001839] font-serif text-xs tracking-tight">{Math.round(ledgerTotalLAK).toLocaleString() + " ₭"}</strong>
                </span>
              </div>

              <button onClick={() => {
                const headers = ['ວັນທີ', 'ສິນຄ້າ', 'ຮ້ານຄ້າ', 'ລາຄາເດີມ', 'ລາຄາທຶນ (LAK)', 'ຈຳນວນ', 'ຫົວໜ່ວຍ'];
                const rows = sortedSupplierPrices.map(p => {
                  const prod = products.find(prod => prod.id === p.productId);
                  return [
                    toStandardDateString(p.date || p.createdAt),
                    prod?.name || 'Item',
                    p.supplier,
                    (p.priceOriginal || 0) + ' ' + (p.currency || 'LAK'),
                    p.totalPriceLAK || 0,
                    p.quantity,
                    p.unit
                  ];
                });
                const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Suppliers");
                XLSX.writeFile(workbook, "Suppliers_" + selectedLedgerMonth + ".xlsx");
              }} className="px-3 py-1 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-serif uppercase tracking-wider text-[#001839] cursor-pointer transition border border-slate-200 flex items-center gap-1.5">
                <Download strokeWidth={1.4} className="w-3.5 h-3.5 text-[#001839]" />
                <span>Export Excel</span>
              </button>
            </div>

            {/* Month Switcher */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handlePrevMonth}
                  className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                  title="ເດືອນກ່ອນໜ້າ"
                >
                  <ChevronLeft strokeWidth={1.4} className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-serif text-[#001839]">
                  <Calendar strokeWidth={1.4} className="w-3.5 h-3.5 text-[#001839]" />
                  <span>{LAO_MONTHS[currentDate.getMonth()] + ' ' + currentDate.getFullYear()}</span>
                </div>

                <button
                  onClick={handleNextMonth}
                  className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                  title="ເດືອນຖັດໄປ"
                >
                  <ChevronRight strokeWidth={1.4} className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => {
                    setIsLedgerLoading(true);
                    setCurrentDate(new Date());
                  }}
                  className="px-2 py-0.5 text-[9.5px] font-serif uppercase tracking-wider rounded-lg bg-slate-100 hover:bg-slate-200 text-[#001839] cursor-pointer"
                >
                  This Month
                </button>
              </div>

              <span className="text-[10px] font-serif text-slate-400 uppercase tracking-wider">
                {'Page ' + currentPage + ' / ' + totalPages}
              </span>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto flex-1 relative bg-white">
            {isLedgerLoading && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 z-20">
                <div className="w-7 h-7 border-2 border-[#001839]/20 border-t-[#001839] rounded-full animate-spin" />
                <p className="text-[11px] font-serif uppercase tracking-widest text-[#001839]">Loading...</p>
              </div>
            )}

            <table className="w-full text-left text-xs">
              <thead className="text-[9.5px] font-serif uppercase tracking-wider text-slate-400 bg-slate-50/70 sticky top-0 border-b border-slate-100">
                <tr>
                  <th className="p-3 pl-4">Date</th>
                  <th className="p-3">Product</th>
                  <th className="p-3">Supplier</th>
                  <th className="p-3 text-right">Original</th>
                  <th className="p-3 text-right">Cost (LAK)</th>
                  <th className="p-3 text-center">Bill</th>
                  <th className="p-3 text-center pr-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!isLedgerLoading && paginatedSupplierPrices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-slate-400 text-xs font-serif">
                      {'No records for ' + selectedLedgerMonth}
                    </td>
                  </tr>
                ) : (
                  paginatedSupplierPrices.map(p => {
                    const prod = products.find(prod => prod.id === p.productId);

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition">
                        <td className="p-3 pl-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {toStandardDateString(p.date || p.createdAt)}
                        </td>

                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            {prod?.imageUrl ? (
                              <img 
                                src={prod.imageUrl} 
                                alt="" 
                                onClick={() => setPreviewImageUrl(prod.imageUrl)}
                                className="w-8 h-8 object-contain rounded-lg border border-slate-200 bg-white p-0.5 cursor-pointer shrink-0" 
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-serif text-[#001839] shrink-0">
                                {prod?.name?.slice(0, 1) || 'P'}
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-[#001839] text-xs">{prod?.name || 'Item'}</p>
                              <p className="text-[9.5px] text-slate-400 font-mono">
                                {p.quantity + ' ' + p.unit}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="p-3 font-medium text-slate-700 whitespace-nowrap">
                          {p.supplier}
                        </td>

                        <td className="p-3 text-right font-mono text-slate-500 whitespace-nowrap">
                          {(p.priceOriginal || 0).toLocaleString() + ' ' + (p.currency || 'LAK')}
                        </td>

                        <td className="p-3 text-right font-serif text-xs text-[#001839] font-semibold whitespace-nowrap">
                          {Math.round(Number(p.totalPriceLAK || 0)).toLocaleString() + " ₭"}
                        </td>

                        <td className="p-3 text-center whitespace-nowrap">
                          {p.billImageUrl ? (
                            <button
                              onClick={() => setPreviewImageUrl(p.billImageUrl)}
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#001839] inline-flex items-center justify-center cursor-pointer transition border border-slate-200"
                              title="ເບິ່ງຮູບ"
                            >
                              <Eye strokeWidth={1.4} className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-slate-300 text-xs">-</span>
                          )}
                        </td>

                        <td className="p-3 text-center pr-3 whitespace-nowrap">
                          <button
                            onClick={() => handleDeleteEntry(p.id)}
                            className="p-1 text-slate-400 hover:text-rose-500 rounded-lg cursor-pointer transition"
                            title="Delete"
                          >
                            <Trash2 strokeWidth={1.4} className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!isLedgerLoading && totalPages > 1 && (
            <div className="p-3 border-t border-slate-100 flex justify-between items-center text-xs shrink-0 bg-slate-50/50">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="px-3 py-1 rounded-lg bg-white text-[#001839] font-serif uppercase tracking-wider text-[10px] disabled:opacity-30 cursor-pointer border border-slate-200"
              >
                ◀ Prev
              </button>
              <span className="text-[10px] font-serif text-slate-500 uppercase tracking-wider">
                {'Page ' + currentPage + ' / ' + totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="px-3 py-1 rounded-lg bg-white text-[#001839] font-serif uppercase tracking-wider text-[10px] disabled:opacity-30 cursor-pointer border border-slate-200"
              >
                Next ▶
              </button>
            </div>
          )}

        </div>

      </div>

      {/* Modals: Suppliers & Product & Zoom */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Store strokeWidth={1.4} className="w-4 h-4 text-[#001839]" />
                <h3 className="text-sm font-serif tracking-tight text-[#001839] uppercase">Supplier Directory</h3>
              </div>
              <button onClick={() => setShowSupplierModal(false)} className="cursor-pointer text-slate-400"><X strokeWidth={1.4} className="w-4 h-4" /></button>
            </div>
            <div className="p-3 bg-slate-50 rounded-2xl space-y-2 border border-slate-200">
              <div className="flex items-center gap-2">
                <input type="text" placeholder="Supplier Name..." value={newSupName} onChange={e => setNewSupName(e.target.value)} className="flex-1 h-8 px-2.5 rounded-lg bg-white border border-slate-200 text-xs text-[#001839]" />
                <input type="text" placeholder="CODE" value={newSupCode} onChange={e => setNewSupCode(e.target.value.toUpperCase())} className="w-16 h-8 px-2 rounded-lg bg-white border border-slate-200 text-xs text-center font-mono text-[#001839]" />
                <button type="button" onClick={handleAddSupplier} className="h-8 px-3 bg-[#001839] text-white rounded-lg text-xs font-serif uppercase tracking-wider cursor-pointer">Add</button>
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {suppliersList.map(sup => (
                <div key={sup.id} className="p-2.5 bg-slate-50 rounded-xl flex justify-between items-center border border-slate-100">
                  <span className="font-medium text-xs text-slate-800">{sup.name} ({sup.code})</span>
                  {suppliersList.length > 1 && (
                    <button onClick={() => handleDeleteSupplier(sup.id)} className="text-slate-400 hover:text-rose-500 cursor-pointer"><Trash2 strokeWidth={1.4} className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setShowSupplierModal(false)} className="w-full h-9 bg-slate-100 text-slate-800 text-xs font-serif uppercase tracking-wider rounded-xl cursor-pointer">Close</button>
          </div>
        </div>
      )}

      {showProductManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-5 shadow-2xl border border-slate-200 space-y-3.5 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-serif tracking-tight text-[#001839] uppercase">Product Catalog</h3>
              <button onClick={() => { setShowProductManager(false); setEditingProductId(null); }} className="cursor-pointer text-slate-400"><X strokeWidth={1.4} className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSaveProduct} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
              <div className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-3">
                  <input type="file" ref={prodImgInputRef} accept="image/*" onChange={e => e.target.files?.[0] && processProductImageFile(e.target.files[0])} className="hidden" id="pm-upload" />
                  <label htmlFor="pm-upload" className="w-full h-20 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer bg-white">
                    {prodFormImageBase64 ? <img src={prodFormImageBase64} alt="" className="w-full h-full object-contain p-1" /> : <ImagePlus strokeWidth={1.4} className="w-4 h-4 text-[#001839]" />}
                  </label>
                </div>
                <div className="col-span-9 space-y-1.5">
                  <input type="text" required placeholder="Product Name..." value={prodFormName} onChange={e => setProdFormName(e.target.value)} className="w-full h-8 px-2.5 rounded-lg bg-white border border-slate-200 text-xs text-[#001839]" />
                  <div className="flex gap-2">
                    <input type="text" placeholder="Pack size" value={prodFormPackSize} onChange={e => setProdFormPackSize(e.target.value)} className="flex-1 h-8 px-2 rounded-lg bg-white border border-slate-200 text-xs text-[#001839]" />
                    <input type="text" placeholder="UNIT" value={prodFormUnit} onChange={e => setProdFormUnit(e.target.value)} className="w-20 h-8 px-2 rounded-lg bg-white border border-slate-200 text-xs text-center font-serif text-[#001839]" />
                    <button type="submit" disabled={prodSaving} className="px-4 h-8 bg-[#001839] text-white rounded-lg text-xs font-serif uppercase tracking-wider cursor-pointer">{prodSaving ? '...' : '+ Add'}</button>
                  </div>
                </div>
              </div>
            </form>
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {products.map(p => (
                <div key={p.id} className="p-2.5 bg-slate-50 rounded-xl flex items-center justify-between border border-slate-100">
                  <div className="flex items-center gap-2.5">
                    {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-8 h-8 object-contain rounded-md border border-slate-200 bg-white" /> : <div className="w-8 h-8 rounded-md bg-slate-200 flex items-center justify-center text-xs font-serif text-[#001839]">{p.name.slice(0, 1)}</div>}
                    <div><p className="font-medium text-xs text-slate-800">{p.name}</p><p className="text-[9px] text-slate-400 font-mono">{p.unit} {p.packSize ? '• ' + p.packSize : ''}</p></div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => handleEditProductClick(p)} className="p-1 text-[#001839] hover:bg-slate-200 rounded-md cursor-pointer"><Edit3 strokeWidth={1.4} className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={async () => { if (window.confirm('Delete?')) await deleteDoc(doc(db, 'products', p.id)); }} className="p-1 text-slate-400 hover:text-rose-500 rounded-md cursor-pointer"><Trash2 strokeWidth={1.4} className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => { setShowProductManager(false); setEditingProductId(null); }} className="w-full h-9 bg-slate-100 text-slate-800 text-xs font-serif uppercase tracking-wider rounded-xl cursor-pointer">Close</button>
          </div>
        </div>
      )}

      {previewImageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white p-4 rounded-3xl max-w-2xl max-h-[90vh] flex flex-col gap-2 border border-slate-200 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <span className="text-xs font-serif tracking-wider text-[#001839] uppercase">Image Preview</span>
              <button onClick={() => setPreviewImageUrl(null)} className="cursor-pointer text-slate-400"><X strokeWidth={1.4} className="w-4 h-4" /></button>
            </div>
            <img src={previewImageUrl} alt="Preview" className="max-h-[75vh] object-contain rounded-xl" />
          </div>
        </div>
      )}

    </div>
  );
}
