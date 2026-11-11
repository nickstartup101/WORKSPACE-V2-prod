import React, { useState } from 'react';
import { 
  Settings as SettingsIcon, Shield, KeyRound, Lock, 
  Store, Building2, CheckCircle2, Save 
} from 'lucide-react';

export default function Settings() {
  const [cashflowPin, setCashflowPin] = useState(localStorage.getItem('cashflow_pin') || '1234');
  const [approvalPin, setApprovalPin] = useState(localStorage.getItem('approval_pin') || '1234');
  const [adminPin, setAdminPin] = useState(localStorage.getItem('admin_master_pin') || '8888');
  const [savedMsg, setSavedMsg] = useState(false);

  const handleSaveSecurity = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('cashflow_pin', cashflowPin);
    localStorage.setItem('approval_pin', approvalPin);
    localStorage.setItem('admin_master_pin', adminPin);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
  };

  return (
    <div className="p-4 sm:p-5 space-y-5 bg-slate-100/90 min-h-screen text-slate-800">
      
      {/* Header */}
      <div className="p-4 sm:p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#001839]/5 text-[#001839] flex items-center justify-center border border-[#001839]/10">
            <SettingsIcon strokeWidth={1.4} className="w-5 h-5 text-[#001839]" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-serif tracking-tight text-[#001839]">
              Workspace Security & System Settings
            </h2>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              ກຳນົດລະຫັດ PIN ຄວາມປອດໄພ, ລະຫັດອະນຸມັດ ແລະ ຕັ້ງຄ່າສາຂາ
            </p>
          </div>
        </div>
      </div>

      {/* Security PIN Settings Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* Passcode Configuration Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Shield strokeWidth={1.4} className="w-5 h-5 text-[#001839]" />
            <h3 className="text-sm font-serif uppercase tracking-wider text-[#001839]">
              Passcode & Access Security
            </h3>
          </div>

          <form onSubmit={handleSaveSecurity} className="space-y-4">
            <div>
              <label className="text-xs font-serif uppercase tracking-wider text-[#001839] block mb-1">
                1. Cashflow Access PIN (ລະຫັດເຂົ້າໜ້າ Cashflow)
              </label>
              <input
                type="text"
                maxLength={6}
                value={cashflowPin}
                onChange={e => setCashflowPin(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-mono font-bold text-[#001839] outline-none"
              />
              <span className="text-[10px] text-slate-400">ລະຫັດປ້ອງກັນການເຂົ້າເບິ່ງກະແສເງິນສົດ (Default: 1234)</span>
            </div>

            <div>
              <label className="text-xs font-serif uppercase tracking-wider text-[#001839] block mb-1">
                2. Transaction Approval PIN (ລະຫັດອະນຸມັດລາຍຈ່າຍ)
              </label>
              <input
                type="text"
                maxLength={6}
                value={approvalPin}
                onChange={e => setApprovalPin(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-mono font-bold text-[#001839] outline-none"
              />
              <span className="text-[10px] text-slate-400">ລະຫັດອະນຸມັດທຸລະກຳລາຍຈ່າຍເກີນ 5 ລ້ານກີບ (Default: 1234)</span>
            </div>

            <div>
              <label className="text-xs font-serif uppercase tracking-wider text-[#001839] block mb-1">
                3. Master Admin Override PIN (ລະຫັດຜູ້ບໍລິຫານສູງສຸດ)
              </label>
              <input
                type="text"
                maxLength={6}
                value={adminPin}
                onChange={e => setAdminPin(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-mono font-bold text-[#001839] outline-none"
              />
              <span className="text-[10px] text-slate-400">ລະຫັດ Master ປົດລັອກທຸກຟັງຊັນ (Default: 8888)</span>
            </div>

            <button
              type="submit"
              className="w-full h-11 bg-[#001839] hover:bg-[#00285d] text-white rounded-xl text-xs font-serif uppercase tracking-widest transition shadow-xs flex items-center justify-center gap-2 cursor-pointer pt-1"
            >
              <Save strokeWidth={1.4} className="w-4 h-4" />
              <span>Save Passcodes</span>
            </button>

            {savedMsg && (
              <p className="text-xs text-emerald-700 font-serif text-center flex items-center justify-center gap-1">
                <CheckCircle2 strokeWidth={1.4} className="w-4 h-4" /> ບັນທຶກລະຫັດ PIN ສຳເລັດແລ້ວ!
              </p>
            )}
          </form>
        </div>

        {/* Branch Info Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Store strokeWidth={1.4} className="w-5 h-5 text-[#001839]" />
            <h3 className="text-sm font-serif uppercase tracking-wider text-[#001839]">
              Workspace Environment
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl space-y-1">
              <span className="text-[10px] font-serif uppercase text-slate-400">Current Branch</span>
              <p className="font-serif text-[#001839] text-sm font-bold">ສາຂາ 1 (ດອນໜູນ) - Main HQ</p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl space-y-1">
              <span className="text-[10px] font-serif uppercase text-slate-400">Base Currency</span>
              <p className="font-serif text-[#001839] text-sm font-bold">LAK (ລາວກີບ) • Dual-Currency THB Ready</p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl space-y-1">
              <span className="text-[10px] font-serif uppercase text-slate-400">Design System</span>
              <p className="font-serif text-[#001839] text-sm font-bold">Luxury Editorial Theme (DM Serif + Stroke 1.4)</p>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
