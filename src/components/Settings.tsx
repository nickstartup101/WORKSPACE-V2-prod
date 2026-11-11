import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { 
  Settings as SettingsIcon, Shield, Lock, Store, 
  Users, UserPlus, Trash2, CheckCircle2, Save, KeyRound, ShieldAlert
} from 'lucide-react';

interface StaffUser {
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'staff';
}

const DEFAULT_USERS: StaffUser[] = [
  { email: 'admin@ladolce.la', name: 'Tonick bouddasien', role: 'admin' },
  { email: 'staff@ladolce.la', name: 'Staff Member', role: 'staff' },
];

export default function Settings() {
  // Passcode states
  const [cashflowPin, setCashflowPin] = useState(localStorage.getItem('cashflow_pin') || '1234');
  const [approvalPin, setApprovalPin] = useState(localStorage.getItem('approval_pin') || '1234');
  const [adminPin, setAdminPin] = useState(localStorage.getItem('admin_master_pin') || '8888');
  const [savedMsg, setSavedMsg] = useState(false);

  // RBAC User Permission states
  const [usersList, setUsersList] = useState<StaffUser[]>(DEFAULT_USERS);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'manager' | 'staff'>('staff');
  const [userSavedMsg, setUserSavedMsg] = useState(false);

  // Load Permissions from Firestore
  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'user_permissions'));
        if (snap.exists() && Array.isArray(snap.data()?.users)) {
          setUsersList(snap.data().users);
        }
      } catch (err) {}
    };
    loadPermissions();
  }, []);

  const handleSaveSecurity = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('cashflow_pin', cashflowPin);
    localStorage.setItem('approval_pin', approvalPin);
    localStorage.setItem('admin_master_pin', adminPin);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newName.trim()) return;

    const updated = [
      ...usersList.filter(u => u.email !== newEmail.trim().toLowerCase()),
      { email: newEmail.trim().toLowerCase(), name: newName.trim(), role: newRole }
    ];

    setUsersList(updated);
    try {
      await setDoc(doc(db, 'settings', 'user_permissions'), { users: updated }, { merge: true });
      setUserSavedMsg(true);
      setTimeout(() => setUserSavedMsg(false), 3000);
    } catch (err: any) {
      alert('Error: ' + err.message);
    }

    setNewEmail('');
    setNewName('');
    setNewRole('staff');
  };

  const handleDeleteUser = async (emailToDelete: string) => {
    if (window.confirm(`ຕ້ອງການລຶບສິດຂອງ ${emailToDelete}?`)) {
      const updated = usersList.filter(u => u.email !== emailToDelete);
      setUsersList(updated);
      try {
        await setDoc(doc(db, 'settings', 'user_permissions'), { users: updated }, { merge: true });
      } catch (err) {}
    }
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
              Workspace Security & Access Permissions
            </h2>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              ກຳນົດສິດພະນັກງານຄີຂໍ້ມູນ, ປ້ອງກັນຕົວເລກກຳໄລ ແລະ ຕັ້ງລະຫັດ PIN
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        
        {/* ================= LEFT: ລະບົບກຳນົດສິດຜູ້ໃຊ້ (RBAC) 7 ຖັນ ================= */}
        <div className="xl:col-span-7 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Users strokeWidth={1.4} className="w-5 h-5 text-[#001839]" />
              <h3 className="text-sm font-serif uppercase tracking-wider text-[#001839]">
                User Roles & Permissions (ກຳນົດສິດພະນັກງານ)
              </h3>
            </div>
            <span className="text-[10px] font-serif uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              Active Control
            </span>
          </div>

          {/* Form ເພີ່ມ/ແກ້ໄຂສິດພະນັກງານ */}
          <form onSubmit={handleAddUser} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <span className="text-[10px] font-serif uppercase tracking-wider text-[#001839] block font-bold">
              + ເພີ່ມ ຫຼື ປັບສິດພະນັກງານ (Assign Role)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                type="email"
                required
                placeholder="ອີເມວ (Email ເຂົ້າລະບົບ)..."
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="sm:col-span-5 h-9 px-3 rounded-xl bg-white border border-slate-200 text-xs text-[#001839] outline-none"
              />
              <input
                type="text"
                required
                placeholder="ຊື່ພະນັກງານ..."
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="sm:col-span-4 h-9 px-3 rounded-xl bg-white border border-slate-200 text-xs text-[#001839] outline-none"
              />
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value as any)}
                className="sm:col-span-3 h-9 px-2 rounded-xl bg-white border border-slate-200 text-xs font-serif text-[#001839] outline-none"
              >
                <option value="staff">Staff (ຄີຂໍ້ມູນ)</option>
                <option value="manager">Manager</option>
                <option value="admin">Administrator</option>
              </select>
            </div>

            <div className="flex justify-between items-center pt-1">
              <p className="text-[10px] text-slate-400">
                * <strong>Staff:</strong> ເຂົ້າໄດ້ສະເພາະ ໜ້າຈັດຊື້ (Suppliers) ແລະ ຄີ Cashflow (ບໍ່ເຫັນກຳໄລ ແລະ ບົດລາຍງານ).
              </p>
              <button
                type="submit"
                className="px-4 py-2 bg-[#001839] hover:bg-[#00285d] text-white rounded-xl text-xs font-serif uppercase tracking-wider transition shadow-xs cursor-pointer"
              >
                Save Role
              </button>
            </div>
            {userSavedMsg && (
              <p className="text-xs text-emerald-700 font-serif flex items-center gap-1">
                <CheckCircle2 strokeWidth={1.4} className="w-3.5 h-3.5" /> ອັບເດດສິດສຳເລັດແລ້ວ!
              </p>
            )}
          </form>

          {/* ລາຍຊື່ຜູ້ໃຊ້ ແລະ ສິດໃນລະບົບ */}
          <div className="space-y-2">
            <span className="text-[10px] font-serif uppercase tracking-wider text-slate-400 block">
              Authorized Users Directory ({usersList.length} Accounts)
            </span>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
              {usersList.map((u, i) => (
                <div key={i} className="p-3 flex items-center justify-between hover:bg-slate-50 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[#001839]/5 text-[#001839] font-serif text-xs font-bold flex items-center justify-center border border-[#001839]/10">
                      {u.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-[#001839]">{u.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{u.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-serif uppercase tracking-wider border ${
                      u.role === 'admin' 
                        ? 'bg-rose-50 text-rose-800 border-rose-200' 
                        : u.role === 'manager'
                        ? 'bg-blue-50 text-blue-800 border-blue-200'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}>
                      {u.role.toUpperCase()}
                    </span>
                    {usersList.length > 1 && (
                      <button
                        onClick={() => handleDeleteUser(u.email)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg cursor-pointer transition"
                        title="Delete Role"
                      >
                        <Trash2 strokeWidth={1.4} className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ================= RIGHT: ລະຫັດ PIN ປ້ອງກັນ 5 ຖັນ ================= */}
        <div className="xl:col-span-5 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Lock strokeWidth={1.4} className="w-5 h-5 text-[#001839]" />
            <h3 className="text-sm font-serif uppercase tracking-wider text-[#001839]">
              Passcode Security
            </h3>
          </div>

          <form onSubmit={handleSaveSecurity} className="space-y-3.5">
            <div>
              <label className="text-[10px] font-serif uppercase tracking-wider text-[#001839] block mb-1">
                1. Cashflow Access PIN
              </label>
              <input
                type="text"
                maxLength={6}
                value={cashflowPin}
                onChange={e => setCashflowPin(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-[#001839] outline-none"
              />
              <span className="text-[9px] text-slate-400">ລະຫັດເຂົ້າໜ້າ Cashflow (Default: 1234)</span>
            </div>

            <div>
              <label className="text-[10px] font-serif uppercase tracking-wider text-[#001839] block mb-1">
                2. Transaction Approval PIN
              </label>
              <input
                type="text"
                maxLength={6}
                value={approvalPin}
                onChange={e => setApprovalPin(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-[#001839] outline-none"
              />
              <span className="text-[9px] text-slate-400">ລະຫັດອະນຸມັດລາຍຈ່າຍໃຫຍ່ (Default: 1234)</span>
            </div>

            <div>
              <label className="text-[10px] font-serif uppercase tracking-wider text-[#001839] block mb-1">
                3. Master Admin Override PIN
              </label>
              <input
                type="text"
                maxLength={6}
                value={adminPin}
                onChange={e => setAdminPin(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-[#001839] outline-none"
              />
              <span className="text-[9px] text-slate-400">ລະຫັດ Master ສູງສຸດ (Default: 8888)</span>
            </div>

            <button
              type="submit"
              className="w-full h-10 bg-[#001839] hover:bg-[#00285d] text-white rounded-xl text-xs font-serif uppercase tracking-widest transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer mt-2"
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

      </div>

    </div>
  );
}
