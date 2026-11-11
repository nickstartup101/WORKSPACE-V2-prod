import React, { useState } from 'react';
import { 
  Upload, Sparkles, Plus, Trash2, Calendar, FileText, 
  CreditCard, Store, CheckCircle2, RefreshCw, Eye
} from 'lucide-react';

export default function Suppliers() {
  const [loading, setLoading] = useState(false);
  const [billNo, setBillNo] = useState('#11112026CH');
  const [paymentMethod, setPaymentMethod] = useState('OnePay (ໂອນ)');
  const [category, setCategory] = useState('Purchasing');

  return (
    <div className="p-6 bg-slate-100 min-h-screen text-slate-800">
      {/* 1. Header ດ້ານເທິງ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-200 mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-widest uppercase text-[#001839]/60">Workspace ESTD 2026</span>
          </div>
          <h1 className="text-3xl font-serif text-[#001839] tracking-tight">Supplier Procurement</h1>
          <p className="text-xs text-slate-500 font-sans mt-0.5">ຈັດການລາຍຈ່າຍຈັດຊື້, ສະແກນໃບບິນ AI ແລະ ບັນທຶກບັນຊີຮ້ານຄ້າ</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-white border border-slate-200 text-[#001839] text-xs font-medium rounded-xl hover:bg-slate-50 transition shadow-sm flex items-center gap-2">
            <Store className="w-4 h-4" /> ຈັດການຮ້ານຄ້າ (Suppliers)
          </button>
        </div>
      </div>

      {/* 2. Main Grid: ແຍກ 2 ຝັ່ງ (ຊ້າຍ: ຟອມປ້ອນຂໍ້ມູນ / ຂວາ: ຕາຕະລາງ) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* ===================== ເບື້ອງຊ້າຍ: FORM ປ້ອນຂໍ້ມູນ (5 Columns) ===================== */}
        <div className="xl:col-span-5 bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 flex flex-col gap-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-semibold text-[#001839] uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#001839]" /> ບັນທຶກໃບຈັດຊື້ໃໝ່
            </h2>
            <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> AI Scan Ready
            </span>
          </div>

          {/* AI Bill Scanner Dropzone */}
          <div className="border-2 border-dashed border-[#001839]/20 hover:border-[#001839]/50 bg-slate-50/50 hover:bg-slate-50 rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2">
            <div className="w-12 h-12 rounded-full bg-[#001839]/5 flex items-center justify-center text-[#001839]">
              <Upload className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-[#001839]">ອັບໂຫຼດຮູບໃບບິນ (Drop / Ctrl + V)</p>
            <p className="text-xs text-slate-400">ຮອງຮັບຮູບພາບໃບບິນ Lao / Thai / Eng</p>
          </div>

          {/* ຂໍ້ມູນໃບບິນ: ເວລາ, ເລກທີ, ໝວດໝູ່, ຊ່ອງທາງຈ່າຍ */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">TIME</label>
              <input 
                type="text" 
                defaultValue="03:02 PM" 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-[#001839] font-medium focus:outline-none focus:border-[#001839]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">BILL NO.</label>
              <input 
                type="text" 
                value={billNo}
                onChange={(e) => setBillNo(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-[#001839] font-medium focus:outline-none focus:border-[#001839]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">CATEGORY</label>
              <select 
                value={category} 
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-[#001839] font-medium focus:outline-none focus:border-[#001839]"
              >
                <option value="Purchasing">Purchasing (ຈັດຊື້ສິນຄ້າ)</option>
                <option value="Packaging">Packaging (ບັນຈຸພັນ)</option>
                <option value="Raw Materials">Raw Materials (ວັດຖຸດິບ)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">PAYMENT</label>
              <select 
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-[#001839] font-medium focus:outline-none focus:border-[#001839]"
              >
                <option value="OnePay (ໂອນ)">OnePay (ໂອນ)</option>
                <option value="LDB Trust">LDB Trust (ໂອນ)</option>
                <option value="Cash">Cash (ເງິນສົດ)</option>
              </select>
            </div>
          </div>

          {/* ລາຍການສິນຄ້າໃນບິນ (Item Rows) */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/30 flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 border-b border-slate-200 pb-2">
              <span>ລາຍການສິນຄ້າ / ຮ້ານຄ້າ</span>
              <span>QTY / ລາຄາ</span>
            </div>
            
            <div className="flex items-center gap-3">
              <input 
                type="text" 
                placeholder="ຊື່ສິນຄ້າ / ວັດຖຸດິບ..." 
                className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#001839]"
              />
              <input 
                type="number" 
                defaultValue="1" 
                className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-[#001839]"
              />
              <input 
                type="text" 
                placeholder="ລາຄາ (LAK)" 
                className="w-28 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-right font-medium focus:outline-none focus:border-[#001839]"
              />
            </div>

            <button className="text-xs font-semibold text-[#001839] hover:underline flex items-center gap-1 self-start mt-1">
              <Plus className="w-3.5 h-3.5" /> ເພີ່ມລາຍການ
            </button>
          </div>

          {/* ປຸ່ມບັນທຶກ */}
          <button className="w-full py-3 bg-[#001839] hover:bg-[#00224d] text-white font-medium rounded-xl shadow-md transition flex items-center justify-center gap-2 mt-2">
            <CheckCircle2 className="w-4 h-4" /> ບັນທຶກໃບຈັດຊື້ ({billNo})
          </button>
        </div>

        {/* ===================== ເບື້ອງຂວາ: PROCUREMENT LEDGER TABLE (7 Columns) ===================== */}
        <div className="xl:col-span-7 bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-[#001839] uppercase tracking-wider">
                Procurement Ledger (ປະຫວັດການຈັດຊື້)
              </h2>
              <span className="text-xs text-slate-400">ສະເພາະເດືອນປັດຈຸບັນ (On-Demand Loading)</span>
            </div>
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
              ໜ້າ 1/1 (18 ລາຍການ)
            </span>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="pb-3 pl-2">ວັນທີ/ເວລາ</th>
                  <th className="pb-3">ຮ້ານຄ້າ/ລາຍການ</th>
                  <th className="pb-3 text-right">ລາຄາເດີມ</th>
                  <th className="pb-3 text-right">ລາຄາຕົ້ນ (LAK)</th>
                  <th className="pb-3 text-center">ໃບບິນ</th>
                  <th className="pb-3 text-center pr-2">ຈັດການ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* ຕົວຢ່າງແຖວຂໍ້ມູນ */}
                <tr className="hover:bg-slate-50/80 transition">
                  <td className="py-3 pl-2 text-xs text-slate-500">11/11/2026<br/><span className="text-[10px] text-slate-400">03:02 PM</span></td>
                  <td className="py-3 font-medium text-[#001839]">ຮ້ານ CP ນະຄອນຫຼວງ<br/><span className="text-xs text-slate-400 font-normal">ນົມສົດ Meiji x10</span></td>
                  <td className="py-3 text-right text-xs text-slate-400">450,000 ₭</td>
                  <td className="py-3 text-right font-bold text-emerald-600">450,000 ₭</td>
                  <td className="py-3 text-center">
                    <button className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition">
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                  <td className="py-3 text-center pr-2">
                    <button className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
