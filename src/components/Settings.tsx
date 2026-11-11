import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { 
  Settings as SettingsIcon, Shield, Lock, Store, 
  Users, UserPlus, Trash2, CheckCircle2, Save, Plus, Building2, MapPin
} from 'lucide-react';

interface StaffUser {
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'staff';
}

interface BranchItem {
  id: string;
  name: string;
  code: string;
  location: string;
}

const DEFAULT_USERS: StaffUser[] = [
  { email: 'admin@ladolce.la', name: 'Tonick bouddasien', role: 'admin' },
  { email: 'staff@ladolce.la', name: 'Staff Member', role: 'staff' },
];

const DEFAULT_BRANCHES: BranchItem[] = [
  { id: 'branch_1', name: 'ສາຂາ 1 (ດອນໜູນ)', code: 'DN1', location: 'ບ້ານ ດອນໜູນ, ມ. ໄຊທານີ' },
  { id: 'branch_2', name: 'ສາຂາ 2 (ໂພນຕ້ອງ)', code: 'PT2', location: 'ບ້ານ ໂພນຕ້ອງ, ມ. ຈັນທະບູລີ' },
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

  // Branch Management states
  const [branches, setBranches] = useState<BranchItem[]>(DEFAULT_BRANCHES);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchCode, setNewBranchCode] = useState('');
  const [newBranchLocation, setNewBranchLocation] = useState('');
  const [branchSavedMsg, setBranchSavedMsg] = useState(false);

  // Load from Firestore
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const permSnap = await getDoc(doc(db, 'settings', 'user_permissions'));
        if (permSnap.exists() && Array.isArray(permSnap.data()?.users)) {
          setUsersList(permSnap.data().users);
        }

        const branchSnap = await getDoc(doc(db, 'settings', 'branch_list'));
        if (branchSnap.exists() && Array.isArray(branchSnap.data()?.branches)) {
          setBranches(branchSnap.data().branches);
        }
      } catch (err) {}
    };
    loadSettings();
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
      alert('ອັບເດດສິດສຳເລັດ!');
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
      await setDoc(doc(db, 'settings', 'user_permissions'), { users: updated }, { merge: true });
    }
  };

  // Branch Handlers
  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;

    const newId = `branch_${Date.now()}`;
    const cleanCode = newBranchCode.trim().toUpperCase() || `B${branches.length + 1}`;
    const updated = [
      ...branches,
      { id: newId, name: newBranchName.trim(), code: cleanCode, location: newBranchLocation.trim() || 'ນະຄອນຫຼວງວຽງຈັນ' }
    ];

    setBranches(updated);
    try {
      await setDoc(doc(db, 'settings', 'branch_list'), { branches: updated }, { merge: true });
      setBranchSavedMsg(true);
      setTimeout(() => setBranchSavedMsg(false), 3000);
    } catch (err: any) {
      alert('Error: ' + err.message);
    }

    setNewBranchName('');
    setNewBranchCode('');
    setNewBranchLocation('');
  };

  const handleDeleteBranch = async (branchId: string) => {
    if (branches.length <= 1) {
      alert('ຕ້ອງມີຢ່າງໜ້ອຍ 1 ສາຂາໃນລະບົບ!');
      return;
    }
    if (window.confirm('ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບສາຂານີ້? (ຂໍ້ມູນທຸລະກຳເດີມຈະຍັງຄົງຢູ່ໃນຖານຂໍ້ມູນ)')) {
      const updated = branches.filter(b => b.id !== branchId);
      setBranches(updated);
      await setDoc(doc(db, 'settings', 'branch_list'), { branches: updated }, { merge: true });
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
              Workspace Settings & Multi-Branch Directory
            </h2>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              ຈັດການສາຂາຮ້ານ (Multi-Branch), ກຳນົດສິດພະນັກງານ (RBAC) ແລະ ຕັ້ງລະຫັດ PIN
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        
        {/* ================= 1. ຈັດການສາຂາ (MULTI-BRANCH DESK) 6 ຖັນ ================= */}
        <div className="xl:col-span-6 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Store strokeWidth={1.4} className="w-5 h-5 text-[#001839]" />
              <h3 className="text-sm font-serif uppercase tracking-wider text-[#001839]">
                Branch Directory (ຈັດການສາຂາ)
              </h3>
            </div>
            <span className="text-[10px] font-serif uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              {branches.length} Active Branches
            </span>
          </div>

          {/* Form ເພີ່ມສາຂາໃໝ່ */}
          <form onSubmit={handleAddBranch} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
            <span className="text-[10px] font-serif uppercase tracking-wider text-[#001839] block font-bold">
              + ເພີ່ມສາຂາໃໝ່ (Add Branch)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                type="text"
                required
                placeholder="ຊື່ສາຂາ (ເຊັ່ນ: ສາຂາ 3 ນາໄຊ)..."
                value={newBranchName}
                onChange={e => setNewBranchName(e.target.value)}
                className="sm:col-span-6 h-9 px-3 rounded-xl bg-white border border-slate-200 text-xs text-[#001839] outline-none"
              />
              <input
                type="text"
                placeholder="ລະຫັດ (ເຊັ່ນ: NS3)"
                value={newBranchCode}
                onChange={e => setNewBranchCode(e.target.value.toUpperCase())}
                className="sm:col-span-3 h-9 px-2.5 rounded-xl bg-white border border-slate-200 text-xs font-mono font-bold text-center text-[#001839] outline-none"
              />
              <input
                type="text"
                placeholder="ສະຖານທີ່ / ເມືອງ..."
                value={newBranchLocation}
                onChange={e => setNewBranchLocation(e.target.value)}
                className="sm:col-span-3 h-9 px-2.5 rounded-xl bg-white border border-slate-200 text-xs text-[#001839] outline-none"
              />
            </div>

            <div className="flex justify-between items-center pt-1">
              <p className="text-[9.5px] text-slate-400">
                * ຂໍ້ມູນທຸລະກຳ ແລະ ຍອດບັນຊີຈະແຍກກັນອັດຕະໂນມັດຕາມສາຂາ.
              </p>
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#001839] hover:bg-[#00285d] text-white rounded-xl text-xs font-serif uppercase tracking-wider transition shadow-xs cursor-pointer flex items-center gap-1"
              >
                <Plus strokeWidth={1.4} className="w-3.5 h-3.5" /> Add Branch
              </button>
            </div>
            {branchSavedMsg && (
              <p className="text-xs text-emerald-700 font-serif flex items-center gap-1">
                <CheckCircle2 strokeWidth={1.4} className="w-3.5 h-3.5" /> ເພີ່ມສາຂາໃໝ່ສຳເລັດແລ້ວ!
              </p>
            )}
          </form>

          {/* ລາຍຊື່ສາຂາທີ່ມີໃນລະບົບ */}
          <div className="space-y-2">
            <span className="text-[10px] font-serif uppercase tracking-wider text-slate-400 block">
              Registered Branches
            </span>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
              {branches.map(b => (
                <div key={b.id} className="p-3 flex items-center justify-between hover:bg-slate-50 transition">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-[#001839]/5 text-[#001839] font-serif text-xs font-bold flex items-center justify-center border border-[#001839]/10">
                      {b.code || 'BR'}
                    </span>
                    <div>
                      <p className="text-xs font-medium text-[#001839]">{b.name}</p>
                      <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <MapPin strokeWidth={1.4} className="w-3 h-3" /> {b.location}
                      </p>
                    </div>
                  </div>

                  {branches.length > 1 && (
                    <button
                      onClick={() => handleDeleteBranch(b.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg cursor-pointer transition"
                      title="Delete Branch"
                    >
                      <Trash2 strokeWidth={1.4} className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ================= 2. ລະບົບກຳນົດສິດພະນັກງານ RBAC (6 ຖັນ) ================= */}
        <div className="xl:col-span-6 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Users strokeWidth={1.4} className="w-5 h-5 text-[#001839]" />
              <h3 className="text-sm font-serif uppercase tracking-wider text-[#001839]">
                Staff Roles & Permissions (ກຳນົດສິດພະນັກງານ)
              </h3>
            </div>
            <span className="text-[10px] font-serif uppercase tracking-wider text-blue-800 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
              RBAC Protected
            </span>
          </div>

          {/* Form ເພີ່ມ/ແກ້ໄຂສິດພະນັກງານ */}
          <form onSubmit={handleAddUser} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
            <span className="text-[10px] font-serif uppercase tracking-wider text-[#001839] block font-bold">
              + Assign Staff Role
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                type="email"
                required
                placeholder="ອີເມວເຂົ້າລະບົບ..."
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
              <p className="text-[9.5px] text-slate-400">
                * <strong>Staff:</strong> ເຂົ້າໄດ້ສະເພາະ ໜ້າຈັດຊື້ (Suppliers) ແລະ ຄີ Cashflow (ບໍ່ເຫັນກຳໄລ).
              </p>
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#001839] hover:bg-[#00285d] text-white rounded-xl text-xs font-serif uppercase tracking-wider transition shadow-xs cursor-pointer"
              >
                Save Role
              </button>
            </div>
          </form>

          {/* User List */}
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white max-h-56 overflow-y-auto">
            {usersList.map((u, i) => (
              <div key={i} className="p-3 flex items-center justify-between hover:bg-slate-50 transition">
                <div>
                  <p className="text-xs font-medium text-[#001839]">{u.name}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-serif uppercase tracking-wider border ${
                    u.role === 'admin' ? 'bg-rose-50 text-rose-800 border-rose-200' : u.role === 'manager' ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}>
                    {u.role.toUpperCase()}
                  </span>
                  {usersList.length > 1 && (
                    <button onClick={() => handleDeleteUser(u.email)} className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer">
                      <Trash2 strokeWidth={1.4} className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

        </div>

      </div>

      {/* Row 2: Security Passcodes PIN Settings */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs max-w-2xl space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Lock strokeWidth={1.4} className="w-5 h-5 text-[#001839]" />
          <h3 className="text-sm font-serif uppercase tracking-wider text-[#001839]">
            Security Passcodes & Approvals (ລະຫັດ PIN ປ້ອງກັນ)
          </h3>
        </div>

        <form onSubmit={handleSaveSecurity} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <span className="text-[8.5px] text-slate-400">Default: 1234</span>
            </div>

            <div>
              <label className="text-[10px] font-serif uppercase tracking-wider text-[#001839] block mb-1">
                2. Approval PIN
              </label>
              <input
                type="text"
                maxLength={6}
                value={approvalPin}
                onChange={e => setApprovalPin(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-[#001839] outline-none"
              />
              <span className="text-[8.5px] text-slate-400">Default: 1234</span>
            </div>

            <div>
              <label className="text-[10px] font-serif uppercase tracking-wider text-[#001839] block mb-1">
                3. Master Override PIN
              </label>
              <input
                type="text"
                maxLength={6}
                value={adminPin}
                onChange={e => setAdminPin(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-[#001839] outline-none"
              />
              <span className="text-[8.5px] text-slate-400">Default: 8888</span>
            </div>
          </div>

          <button
            type="submit"
            className="px-5 py-2 bg-[#001839] hover:bg-[#00285d] text-white rounded-xl text-xs font-serif uppercase tracking-widest transition shadow-xs cursor-pointer flex items-center gap-1.5"
          >
            <Save strokeWidth={1.4} className="w-3.5 h-3.5" /> Save Passcodes
          </button>
          {savedMsg && <p className="text-xs text-emerald-700 font-serif">✓ ບັນທຶກລະຫັດ PIN ສຳເລັດແລ້ວ!</p>}
        </form>
      </div>

    </div>
  );
}
