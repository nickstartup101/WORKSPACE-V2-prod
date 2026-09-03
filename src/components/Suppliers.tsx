import React, { useState, useEffect, useMemo, useRef } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, addDoc, onSnapshot, query, orderBy, 
  deleteDoc, doc, updateDoc, serverTimestamp 
} from 'firebase/firestore';
import { 
  Plus, Trash2, Edit3, Save, X, Search, Download, 
  List, Check, Receipt, ShoppingBag, 
  Image as ImageIcon, Upload, Eye, Wallet, CreditCard,
  Building2, DollarSign, Calendar, Tag, Truck
} from 'lucide-react';
import { format } from 'date-fns';
import { utils, writeFile } from 'xlsx';
import { useTranslation } from 'react-i18next';
import ApprovalModal from './ApprovalModal';

const SUPPLIER_CODES: Record<string, string> = {
  'CHANHOM': 'CH',
  'LATDA': 'LD',
  'HEAVENLY': 'HV',
  'DMART': 'DM',
  'MARRY ANN': 'MA',
  'LUCKKHANA': 'LK',
  'LA TERRASSE': 'LT',
  'VIS': 'VS',
  'OTHER': 'OT'
};

export type PaymentMethod = 'Cash' | 'Onepay' | 'LDB';
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
      if (parts.length === 3) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    return clean;
  }
  if (raw && typeof raw.toDate === 'function') {
    try { return format(raw.toDate(), 'yyyy-MM-dd'); } catch { return ''; }
  }
  return '';
};

export default function Suppliers() {
  const { t, i18n } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [selectedFilterDate, setSelectedFilterDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const [entryMode, setEntryMode] = useState<'batch' | 'single'>('batch');
  const [isDragging, setIsDragging] = useState(false);

  // Modals
  const [showProductManager, setShowProductManager] = useState(false);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editPriceData, setEditPriceData] = useState<any>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Form State
  const [billDate, setBillDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [billTime, setBillTime] = useState<string>(format(new Date(), 'HH:mm'));
  const [supplier, setSupplier] = useState<string>('CHANHOM');
  const [category, setCategory] = useState<ExpenseCategory>('purchasing');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
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

  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalType, setApprovalType] = useState<'create' | 'delete' | null>(null);
  const [pendingAction, setPendingAction] = useState<any>(null);

  // Auto Bill No
  const generatedBillNo = useMemo(() => {
    try {
      const parts = billDate.split('-');
      if (parts.length === 3) {
        const ddmmyyyy = `${parts[2]}${parts[1]}${parts[0]}`;
        const code = SUPPLIER_CODES[supplier] || (supplier ? supplier.slice(0, 2).toUpperCase() : 'OT');
        return `#${ddmmyyyy}${code}`;
      }
    } catch {}
    return `#${format(new Date(), 'ddMMyyyy')}${SUPPLIER_CODES[supplier] || 'OT'}`;
  }, [billDate, supplier]);

  // Image Processing
  const processImageFile = (file: File) => {
    if (!file || !file.type.startsWith('image/')) {
      alert(i18n.language === 'la' ? 'ກະລຸນາເລືອກໄຟລ໌ຮູບພາບ (JPG, PNG)' : 'Please select an image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = img.width > MAX_WIDTH ? MAX_WIDTH : img.width;
        canvas.height = img.width > MAX_WIDTH ? (img.height * scaleSize) : img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        setBillImageBase64(canvas.toDataURL('image/jpeg', 0.75));
      };
    };
    reader.readAsDataURL(file);
  };

  // Clipboard Paste (Ctrl + V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            processImageFile(blob);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // 📡 Real-time Firestore Sync (Products & Supplier Prices)
  useEffect(() => {
    const unsubP = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubS = onSnapshot(collection(db, 'supplierPrices'), (snap) => {
      setSupplierPrices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => {
      unsubP();
      unsubS();
    };
  }, []);

  const sortedSupplierPrices = useMemo(() => {
    return [...supplierPrices].sort((a, b) => {
      const dateA = toStandardDateString(a.date || a.createdAt);
      const dateB = toStandardDateString(b.date || b.createdAt);
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return String(b.time || '').localeCompare(String(a.time || ''));
    });
  }, [supplierPrices]);

  const updateItemRow = (index: number, fields: Partial<FormItemRow>) => {
    setBillItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...fields };
      return updated;
    });
  };

  const formatWithCommas = (val: string) => {
    const num = val.replace(/,/g, '');
    if (!num) return '';
    if (isNaN(Number(num))) return val;
    return Number(num).toLocaleString();
  };

  const handleItemPriceChange = (index: number, rawVal: string) => {
    const cleanNum = rawVal.replace(/,/g, '');
    if (cleanNum === '' || !isNaN(Number(cleanNum))) {
      updateItemRow(index, {
        displayPrice: formatWithCommas(rawVal),
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
      alert('Please select a supplier.');
      return;
    }

    for (let i = 0; i < billItems.length; i++) {
      if (!billItems[i].productId) {
        alert(`ລາຍການທີ ${i + 1} ຍັງບໍ່ໄດ້ເລືອກສິນຄ້າ. ກະລຸນາເລືອກຈາກລາຍຊື່.`);
        return;
      }
    }

    try {
      setSaveLoading(true);
      const batchGroupId = `bill_${Date.now()}`;
      const finalRate = currency === 'LAK' ? 1 : (Number(exchangeRate) || 1);

      for (const item of billItems) {
        const qty = Number(item.quantity) || 1;
        const qtyPerUnit = Number(item.quantityPerUnit) || 1;
        let singlePriceOriginal = Number(item.priceOriginal) || 0;

        if (item.priceMode === 'total') {
          singlePriceOriginal = Number(item.priceOriginal) / qty;
        }

        const calculatedPriceLAK = singlePriceOriginal * finalRate;
        const totalOriginal = item.priceMode === 'total' ? Number(item.priceOriginal) : singlePriceOriginal * qty;
        const totalLAK = totalOriginal * finalRate;

        await addDoc(collection(db, 'supplierPrices'), {
          billNo: generatedBillNo,
          batchGroupId,
          billImageUrl: billImageBase64 || '',
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

      alert(`ບັນທຶກເລກບິນ ${generatedBillNo} ສຳເລັດ!`);
      setBillImageBase64('');
      setBillRemark('');
      setBillItems([{
        id: `item-${Date.now()}`,
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
      alert(`Error: ${err.message}`);
    } finally {
      setSaveLoading(false);
    }
  };

  const addUnlistedProductForItem = async (name: string, itemIndex: number) => {
    const productName = prompt("Enter New Product Name:", name);
    if (productName) {
      const docRef = await addDoc(collection(db, 'products'), {
        name: productName.trim(),
        unit: billItems[itemIndex]?.unit || 'UNIT',
        isApproved: true,
        createdAt: serverTimestamp()
      });
      updateItemRow(itemIndex, {
        productId: docRef.id,
        productSearch: productName.trim(),
        isDropdownOpen: false
      });
    }
  };

  const handleExport = () => {
    const headers = ['Bill No', 'Date', 'Product', 'Supplier', 'Price LAK', 'Total LAK', 'Qty', 'Unit'];
    const rows = sortedSupplierPrices.map(p => [
      p.billNo || '-',
      toStandardDateString(p.date || p.createdAt),
      products.find(prod => prod.id === p.productId)?.name || 'Item',
      p.supplier,
      p.priceLAK || 0,
      p.totalPriceLAK || 0,
      p.quantity,
      p.unit
    ]);
    const worksheet = utils.aoa_to_sheet([headers, ...rows]);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, 'Suppliers');
    writeFile(workbook, `Suppliers_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white dark:bg-[#073069] rounded-[2rem] border border-slate-200/80 dark:border-white/10 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Truck className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
              {i18n.language === 'la' ? 'ລະບົບຈັດຊື້ & ຜູ້ສະໜອງ (Supplier Procurement)' : 'Supplier Procurement Desk'}
            </h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
              {products.length} ສິນຄ້າໃນຖານຂໍ້ມູນ • {supplierPrices.length} ໃບບິນຈັດຊື້ທັງໝົດ
            </p>
          </div>
        </div>

        <button 
          onClick={() => setShowProductManager(true)}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-white rounded-xl text-xs font-bold uppercase cursor-pointer"
        >
          <List className="w-3.5 h-3.5 inline mr-1" /> Manage Items ({products.length})
        </button>
      </div>

      {/* Main Grid: Form (5 Cols) & Table (7 Cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

        {/* LEFT: Procurement Bill Entry Form */}
        <div className="xl:col-span-5 space-y-6">
          <div className="bg-white dark:bg-[#073069] p-5 sm:p-6 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-xl space-y-5">
            
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-white/10 pb-4">
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
                  className={`px-3 py-1 text-[10px] font-black uppercase rounded-lg cursor-pointer ${entryMode === 'batch' ? 'bg-[#052659] text-white' : 'text-slate-500'}`}
                >
                  ຫຼາຍລາຍການ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEntryMode('single');
                    if (billItems.length > 1) setBillItems([billItems[0]]);
                  }}
                  className={`px-3 py-1 text-[10px] font-black uppercase rounded-lg cursor-pointer ${entryMode === 'single' ? 'bg-[#052659] text-white' : 'text-slate-500'}`}
                >
                  ລາຍການດ່ຽວ
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveBillBatch} className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[9.5px] font-black uppercase text-slate-400">Date</label>
                  <input 
                    type="date"
                    required
                    className="w-full h-10 px-2 rounded-xl bg-slate-50 dark:bg-white/5 border text-xs font-bold"
                    value={billDate}
                    onChange={e => setBillDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[9.5px] font-black uppercase text-slate-400">Time</label>
                  <input 
                    type="time"
                    required
                    className="w-full h-10 px-2 rounded-xl bg-slate-50 dark:bg-white/5 border text-xs font-bold"
                    value={billTime}
                    onChange={e => setBillTime(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[9.5px] font-black uppercase text-slate-400">Bill No.</label>
                  <div className="w-full h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 font-mono font-black text-xs flex items-center justify-center">
                    {generatedBillNo}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[9.5px] font-black uppercase text-slate-400">Supplier</label>
                  <select 
                    className="w-full h-10 px-2 rounded-xl bg-slate-50 dark:bg-white/5 border text-xs font-bold cursor-pointer"
                    value={supplier}
                    onChange={e => setSupplier(e.target.value)}
                  >
                    <option value="CHANHOM">CHANHOM (CH)</option>
                    <option value="LATDA">LATDA (LD)</option>
                    <option value="HEAVENLY">HEAVENLY (HV)</option>
                    <option value="DMART">DMART (DM)</option>
                    <option value="MARRY ANN">MARRY ANN (MA)</option>
                    <option value="LUCKKHANA">Luckkhana (LK)</option>
                    <option value="LA TERRASSE">La Terrasse (LT)</option>
                    <option value="VIS">VIS (VS)</option>
                    <option value="OTHER">Other (OT)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9.5px] font-black uppercase text-slate-400">Category</label>
                  <select 
                    className="w-full h-10 px-2 rounded-xl bg-slate-50 dark:bg-white/5 border text-xs font-bold cursor-pointer"
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
                  <label className="text-[9.5px] font-black uppercase text-slate-400">Payment</label>
                  <select 
                    className="w-full h-10 px-2 rounded-xl bg-slate-50 dark:bg-white/5 border text-xs font-bold cursor-pointer"
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as any)}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Onepay">OnePay</option>
                    <option value="LDB">LDB</option>
                  </select>
                </div>
              </div>

              {/* 🖼️ Receipt Drag & Drop & Ctrl+V */}
              <div 
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.[0]) processImageFile(e.dataTransfer.files[0]); }}
                className={`p-3.5 rounded-2xl border-2 border-dashed transition-all ${
                  isDragging ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-[#052659]/50'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[9.5px] font-black uppercase text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                    <span>Receipt Image (Drop or Ctrl+V)</span>
                  </span>
                  {billImageBase64 && (
                    <button type="button" onClick={() => setBillImageBase64('')} className="text-[9px] font-black text-red-500 uppercase cursor-pointer">Remove</button>
                  )}
                </div>

                {billImageBase64 ? (
                  <div className="relative rounded-xl overflow-hidden max-h-32 bg-black/10 flex items-center justify-center">
                    <img src={billImageBase64} alt="Receipt" className="w-full h-32 object-cover" />
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
                    <label htmlFor="supplier-upload" className="w-full py-3 rounded-xl border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-1 cursor-pointer text-slate-400">
                      <Upload className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs font-bold">Upload Photo / Paste (Ctrl+V)</span>
                    </label>
                  </div>
                )}
              </div>

              {/* 🔍 Product Search & Dropdown (Always Opens & Lists Products) */}
              <div className="space-y-3 pt-2">
                {billItems.map((item, index) => {
                  const selectedProd = products.find(p => p.id === item.productId);

                  return (
                    <div key={item.id} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#052659]/60 border border-slate-200 dark:border-white/10 space-y-2.5">
                      
                      <div className="space-y-1 relative">
                        <label className="text-[9px] font-black uppercase text-slate-400">Product Resource</label>
                        <input 
                          type="text"
                          required
                          className="w-full h-10 px-3 pr-8 rounded-xl bg-white dark:bg-[#073069] border text-xs font-bold outline-none cursor-pointer"
                          placeholder="Search product from database..."
                          value={item.isDropdownOpen ? item.productSearch : (selectedProd?.name || item.productSearch)}
                          onFocus={() => updateItemRow(index, { isDropdownOpen: true })}
                          onClick={() => updateItemRow(index, { isDropdownOpen: true })}
                          onChange={(e) => updateItemRow(index, { productSearch: e.target.value, isDropdownOpen: true, productId: '' })}
                        />
                        <Search className="absolute right-3 top-7 w-3.5 h-3.5 text-slate-400 pointer-events-none" />

                        {item.isDropdownOpen && (
                          <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-[#073069] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl max-h-56 overflow-y-auto">
                            {products
                              .filter(p => !item.productSearch || p.name.toLowerCase().includes(item.productSearch.toLowerCase()))
                              .map(p => (
                                <button
                                  key={p.id}
                                  type="button"
                                  className="w-full text-left p-2.5 hover:bg-slate-100 dark:hover:bg-white/10 border-b border-slate-50 dark:border-white/5 flex justify-between items-center cursor-pointer"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    updateItemRow(index, {
                                      productId: p.id,
                                      productSearch: p.name,
                                      unit: p.unit || item.unit,
                                      quantityPerUnit: p.packSize || 1,
                                      isDropdownOpen: false
                                    });
                                  }}
                                >
                                  <span className="text-xs font-bold text-slate-800 dark:text-white">{p.name}</span>
                                  <span className="text-[9px] text-slate-400 font-bold uppercase">{p.unit || 'UNIT'}</span>
                                </button>
                            ))}

                            {item.productSearch && !products.some(p => p.name.toLowerCase() === item.productSearch.toLowerCase()) && (
                              <button
                                type="button"
                                className="w-full text-left p-2.5 bg-primary/5 text-primary text-xs font-bold uppercase cursor-pointer"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  addUnlistedProductForItem(item.productSearch, index);
                                }}
                              >
                                + Add Custom "{item.productSearch}"
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Price, Qty, Unit */}
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-6">
                          <input 
                            type="text"
                            required
                            placeholder="Price"
                            className="w-full h-9 px-2.5 rounded-xl bg-white dark:bg-[#073069] border text-xs font-mono font-bold"
                            value={item.displayPrice}
                            onChange={e => handleItemPriceChange(index, e.target.value)}
                          />
                        </div>
                        <div className="col-span-3">
                          <input 
                            type="number"
                            min="1"
                            step="any"
                            required
                            placeholder="Qty"
                            className="w-full h-9 px-2 rounded-xl bg-white dark:bg-[#073069] border text-xs font-mono font-bold text-center"
                            value={item.quantity || ''}
                            onChange={e => updateItemRow(index, { quantity: parseFloat(e.target.value) || 1 })}
                          />
                        </div>
                        <div className="col-span-3">
                          <input 
                            type="text"
                            placeholder="Unit"
                            className="w-full h-9 px-2 rounded-xl bg-white dark:bg-[#073069] border text-xs font-bold text-center uppercase"
                            value={item.unit}
                            onChange={e => updateItemRow(index, { unit: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total & Submit */}
              <div className="p-3.5 bg-[#052659] text-white rounded-2xl flex justify-between items-center">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[#5483B3]">Total Cost</p>
                  <p className="text-lg font-black font-mono">{Math.round(grandTotalLAK).toLocaleString()} ₭</p>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={saveLoading}
                className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase rounded-2xl shadow-lg cursor-pointer"
              >
                {saveLoading ? 'SAVING...' : `ບັນທຶກໃບບິນຈັດຊື້ (${generatedBillNo})`}
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT: Active Pricing Index Table */}
        <div className="xl:col-span-7 space-y-6">
          <div className="bg-white dark:bg-[#073069] rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-white/5 flex justify-between items-center">
              <h3 className="text-xs font-black uppercase text-slate-800 dark:text-white">Active Procurement Ledger</h3>
              <button onClick={handleExport} className="px-3 py-1 bg-slate-100 dark:bg-white/10 rounded-xl text-xs font-bold uppercase text-blue-500 cursor-pointer">
                <Download className="w-3 h-3 inline mr-1" /> Excel
              </button>
            </div>

            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-left text-xs">
                <thead className="text-[9px] font-bold uppercase text-slate-400 bg-slate-50 dark:bg-white/5">
                  <tr>
                    <th className="p-3.5">Bill No / Date</th>
                    <th className="p-3.5">Product Name</th>
                    <th className="p-3.5">Supplier</th>
                    <th className="p-3.5">Total (LAK)</th>
                    <th className="p-3.5 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {sortedSupplierPrices.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                      <td className="p-3.5">
                        <span className="font-mono text-[9px] font-bold text-emerald-500 block">{p.billNo}</span>
                        <span className="text-[10px] text-slate-400">{toStandardDateString(p.date || p.createdAt)}</span>
                      </td>
                      <td className="p-3.5 font-bold text-slate-800 dark:text-white">
                        {products.find(prod => prod.id === p.productId)?.name || 'Item'}
                      </td>
                      <td className="p-3.5 text-slate-400 uppercase">{p.supplier}</td>
                      <td className="p-3.5 font-mono font-black text-slate-900 dark:text-white">
                        {Math.round(Number(p.totalPriceLAK || 0)).toLocaleString()} ₭
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold">{p.quantity} {p.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

      {/* Product Manager Modal */}
      {showProductManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-white dark:bg-[#073069] w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-xs font-black uppercase">Database Products</h3>
              <button onClick={() => setShowProductManager(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {products.map(p => (
                <div key={p.id} className="p-3 bg-slate-50 dark:bg-white/5 rounded-2xl flex justify-between items-center text-xs">
                  <span className="font-bold">{p.name}</span>
                  <span className="text-slate-400 uppercase font-mono">{p.unit || 'UNIT'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
