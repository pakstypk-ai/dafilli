import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Plus, X, Clock, Users, Shield, Play, Square,
  Trash2, UserCog, Phone, Calendar,
} from 'lucide-react';
import { supabase, type Role, type Employee, type Shift } from '@/lib/supabase';
import { formatCurrency } from '@/lib/format';

const ALL_PERMISSIONS = [
  { key: 'can_take_orders', label: 'Take Orders' },
  { key: 'can_accept_orders', label: 'Accept Orders' },
  { key: 'can_reject_orders', label: 'Reject Orders' },
  { key: 'can_punch_kot', label: 'Punch KOT' },
  { key: 'can_edit_order', label: 'Edit Orders' },
  { key: 'can_void_item', label: 'Void Items' },
  { key: 'can_apply_discount', label: 'Apply Discount' },
  { key: 'can_process_payment', label: 'Process Payment' },
  { key: 'can_manage_products', label: 'Manage Products' },
  { key: 'can_manage_tables', label: 'Manage Tables' },
  { key: 'can_view_reports', label: 'View Reports' },
  { key: 'can_view_tables', label: 'View Tables' },
];

type Tab = 'shifts' | 'employees' | 'roles';

export function AdminStaff() {
  const [tab, setTab] = useState<Tab>('shifts');
  const [roles, setRoles] = useState<Role[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<(Shift & { employee_name?: string; role_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [{ data: r }, { data: e }, { data: s }] = await Promise.all([
        supabase.from('roles').select('*').order('created_at', { ascending: true }),
        supabase.from('employees').select('*').order('name', { ascending: true }),
        supabase.from('shifts').select('*').order('created_at', { ascending: false }).limit(50),
      ]);

      const roleList = (r ?? []) as unknown as Role[];
      const empList = (e ?? []) as unknown as Employee[];
      const shiftList = ((s ?? []) as unknown as Shift[]).map((shift) => {
        const emp = empList.find((em) => em.id === shift.employee_id);
        const role = roleList.find((rl) => rl.id === shift.role_id);
        return { ...shift, employee_name: emp?.name ?? 'Unknown', role_name: role?.role_name ?? '' };
      });

      setRoles(roleList);
      setEmployees(empList);
      setShifts(shiftList);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const tabs: { id: Tab; label: string; icon: typeof Clock }[] = [
    { id: 'shifts', label: 'Shifts', icon: Clock },
    { id: 'employees', label: 'Employees', icon: Users },
    { id: 'roles', label: 'Roles', icon: Shield },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-sage-800 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-stone-900">Staff Management</h2>
        <p className="text-sm text-stone-500 mt-1">Manage employees, roles, and shift tracking</p>
      </div>

      <div className="flex gap-1.5 bg-white rounded-xl border border-stone-200 p-1.5 w-fit">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t.id ? 'bg-sage-900 text-sage-50' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'shifts' && <ShiftsTab roles={roles} employees={employees} shifts={shifts} onReload={loadData} />}
      {tab === 'employees' && <EmployeesTab roles={roles} employees={employees} onReload={loadData} />}
      {tab === 'roles' && <RolesTab roles={roles} onReload={loadData} />}
    </div>
  );
}

// ============================================================
// SHIFTS TAB
// ============================================================
function ShiftsTab({ roles, employees, shifts, onReload }: {
  roles: Role[];
  employees: Employee[];
  shifts: (Shift & { employee_name?: string; role_name?: string })[];
  onReload: () => void;
}) {
  const [showStart, setShowStart] = useState(false);
  const [selEmployee, setSelEmployee] = useState('');
  const [selRole, setSelRole] = useState('');
  const [shiftType, setShiftType] = useState<'morning' | 'evening' | 'double'>('morning');
  const [openingCash, setOpeningCash] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [closingShift, setClosingShift] = useState<Shift | null>(null);
  const [closingCash, setClosingCash] = useState('');

  const activeShifts = shifts.filter((s) => !s.end_time);

  const handleStartShift = async () => {
    if (!selEmployee) return;
    setSubmitting(true);
    try {
      await supabase.from('shifts').insert({
        employee_id: selEmployee,
        role_id: selRole || null,
        shift_type: shiftType,
        opening_cash: Number(openingCash) || 0,
        start_time: new Date().toISOString(),
      });
      setShowStart(false);
      setSelEmployee('');
      setSelRole('');
      setOpeningCash('');
      onReload();
    } catch {
      alert('Failed to start shift');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseShift = async () => {
    if (!closingShift) return;
    setSubmitting(true);
    try {
      await supabase.from('shifts').update({
        end_time: new Date().toISOString(),
        closing_cash: Number(closingCash) || 0,
      }).eq('id', closingShift.id);
      setClosingShift(null);
      setClosingCash('');
      onReload();
    } catch {
      alert('Failed to close shift');
    } finally {
      setSubmitting(false);
    }
  };

  const fmtTime = (ts: string) => new Date(ts).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-stone-900">Active & Recent Shifts</h3>
          <p className="text-xs text-stone-500 mt-0.5">{activeShifts.length} shift{activeShifts.length !== 1 ? 's' : ''} currently active</p>
        </div>
        <button
          onClick={() => setShowStart(true)}
          disabled={employees.length === 0}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sage-900 text-sage-50 font-bold text-sm hover:bg-sage-800 transition-colors disabled:opacity-50"
        >
          <Play className="w-4 h-4" />
          Start Shift
        </button>
      </div>

      {employees.length === 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-sm text-amber-800">
          Add employees first before starting shifts.
        </div>
      )}

      {/* Active shifts */}
      {activeShifts.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {activeShifts.map((shift) => (
            <div key={shift.id} className="bg-green-50 border border-green-300 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-stone-900">{shift.employee_name}</p>
                  <p className="text-xs text-stone-500 capitalize">{shift.shift_type} shift</p>
                  {shift.role_name && <p className="text-xs text-sage-700 mt-0.5">{shift.role_name}</p>}
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
              </div>
              <div className="mt-3 space-y-1 text-xs text-stone-600">
                <p>Started: {fmtTime(shift.start_time)}</p>
                <p>Opening cash: {formatCurrency(Number(shift.opening_cash))}</p>
              </div>
              <button
                onClick={() => { setClosingShift(shift); setClosingCash(''); }}
                className="mt-3 w-full py-2 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition-colors flex items-center justify-center gap-1.5"
              >
                <Square className="w-3.5 h-3.5" />
                End Shift
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Shift history */}
      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100">
          <p className="text-sm font-semibold text-stone-700">Shift History</p>
        </div>
        <div className="divide-y divide-stone-100">
          {shifts.filter((s) => s.end_time).slice(0, 20).map((shift) => (
            <div key={shift.id} className="px-4 py-3 flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-stone-500" />
                </div>
                <div>
                  <p className="font-semibold text-stone-800">{shift.employee_name}</p>
                  <p className="text-xs text-stone-500 capitalize">{shift.shift_type} · {fmtTime(shift.start_time)}</p>
                </div>
              </div>
              <div className="text-right text-xs">
                <p className="font-semibold text-stone-700">Closed: {fmtTime(shift.end_time!)}</p>
                <p className="text-stone-500">Cash: {formatCurrency(Number(shift.opening_cash))} → {formatCurrency(Number(shift.closing_cash ?? 0))}</p>
              </div>
            </div>
          ))}
          {shifts.filter((s) => s.end_time).length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-stone-400">No completed shifts yet</div>
          )}
        </div>
      </div>

      {/* Start shift modal */}
      {showStart && (
        <div className="fixed inset-0 z-[85] bg-stone-950/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowStart(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-bold text-stone-900">Start New Shift</h3>
              <button onClick={() => setShowStart(false)} className="p-1.5 rounded-full hover:bg-stone-100"><X className="w-4 h-4 text-stone-500" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-600 uppercase mb-1.5">Employee</label>
                <select value={selEmployee} onChange={(e) => setSelEmployee(e.target.value)} className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-sm outline-none focus:border-sage-400">
                  <option value="">Select employee...</option>
                  {employees.filter((e) => e.is_active).map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 uppercase mb-1.5">Role (override)</label>
                <select value={selRole} onChange={(e) => setSelRole(e.target.value)} className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-sm outline-none focus:border-sage-400">
                  <option value="">Use default role</option>
                  {roles.map((r) => (<option key={r.id} value={r.id}>{r.role_name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 uppercase mb-1.5">Shift Type</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['morning', 'evening', 'double'] as const).map((st) => (
                    <button key={st} onClick={() => setShiftType(st)} className={`py-2 rounded-lg text-xs font-semibold capitalize ${shiftType === st ? 'bg-sage-900 text-sage-50' : 'bg-stone-100 text-stone-600'}`}>{st}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 uppercase mb-1.5">Opening Cash (Rs)</label>
                <input type="number" min="0" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} placeholder="0" className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-sm outline-none focus:border-sage-400" />
              </div>
            </div>
            <button onClick={handleStartShift} disabled={submitting || !selEmployee} className="w-full mt-5 py-2.5 rounded-lg bg-sage-900 text-sage-50 font-bold text-sm hover:bg-sage-800 disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Start Shift
            </button>
          </div>
        </div>
      )}

      {/* Close shift modal */}
      {closingShift && (
        <div className="fixed inset-0 z-[85] bg-stone-950/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setClosingShift(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-stone-900">End Shift</h3>
                <p className="text-xs text-stone-500 mt-0.5">{closingShift.employee_name}</p>
              </div>
              <button onClick={() => setClosingShift(null)} className="p-1.5 rounded-full hover:bg-stone-100"><X className="w-4 h-4 text-stone-500" /></button>
            </div>
            <div className="bg-stone-50 rounded-lg p-3 mb-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-stone-500">Started</span><span className="font-semibold">{fmtTime(closingShift.start_time)}</span></div>
              <div className="flex justify-between"><span className="text-stone-500">Opening cash</span><span className="font-semibold">{formatCurrency(Number(closingShift.opening_cash))}</span></div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-600 uppercase mb-1.5">Closing Cash (Rs)</label>
              <input type="number" min="0" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} placeholder="0" className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-sm outline-none focus:border-sage-400" />
            </div>
            <button onClick={handleCloseShift} disabled={submitting} className="w-full mt-5 py-2.5 rounded-lg bg-red-500 text-white font-bold text-sm hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              End Shift
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// EMPLOYEES TAB
// ============================================================
function EmployeesTab({ roles, employees, onReload }: {
  roles: Role[];
  employees: Employee[];
  onReload: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [roleId, setRoleId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const openAdd = () => { setName(''); setPhone(''); setRoleId(''); setShowAdd(true); };
  const openEdit = (emp: Employee) => { setEditEmp(emp); setName(emp.name); setPhone(emp.phone); setRoleId(emp.default_role_id ?? ''); };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      if (editEmp) {
        await supabase.from('employees').update({
          name: name.trim(), phone: phone.trim(), default_role_id: roleId || null,
          is_active: editEmp.is_active,
        }).eq('id', editEmp.id);
      } else {
        await supabase.from('employees').insert({
          name: name.trim(), phone: phone.trim(), default_role_id: roleId || null,
        });
      }
      setShowAdd(false);
      setEditEmp(null);
      onReload();
    } catch {
      alert('Failed to save employee');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (emp: Employee) => {
    await supabase.from('employees').update({ is_active: !emp.is_active }).eq('id', emp.id);
    onReload();
  };

  const handleDelete = async (emp: Employee) => {
    if (!confirm(`Delete employee "${emp.name}"?`)) return;
    await supabase.from('employees').delete().eq('id', emp.id);
    onReload();
  };

  const roleName = (rid: string | null) => roles.find((r) => r.id === rid)?.role_name ?? 'No role';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-stone-900">Employees ({employees.length})</h3>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sage-900 text-sage-50 font-bold text-sm hover:bg-sage-800 transition-colors">
          <Plus className="w-4 h-4" />
          Add Employee
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {employees.map((emp) => (
          <div key={emp.id} className={`bg-white rounded-xl border p-4 ${emp.is_active ? 'border-stone-200' : 'border-stone-200 opacity-60'}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-sage-100 flex items-center justify-center">
                  <UserCog className="w-5 h-5 text-sage-700" />
                </div>
                <div>
                  <p className="font-bold text-stone-900">{emp.name}</p>
                  <p className="text-xs text-stone-500">{roleName(emp.default_role_id)}</p>
                </div>
              </div>
              <span className={`w-2.5 h-2.5 rounded-full ${emp.is_active ? 'bg-green-500' : 'bg-stone-300'}`} />
            </div>
            {emp.phone && (
              <p className="text-xs text-stone-500 mt-2 flex items-center gap-1.5">
                <Phone className="w-3 h-3" /> {emp.phone}
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <button onClick={() => openEdit(emp)} className="flex-1 py-1.5 rounded-lg border border-stone-200 text-xs font-semibold text-stone-600 hover:bg-stone-50">Edit</button>
              <button onClick={() => toggleActive(emp)} className="flex-1 py-1.5 rounded-lg border border-stone-200 text-xs font-semibold text-stone-600 hover:bg-stone-50">
                {emp.is_active ? 'Deactivate' : 'Activate'}
              </button>
              <button onClick={() => handleDelete(emp)} className="p-1.5 rounded-lg text-stone-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
        {employees.length === 0 && (
          <div className="col-span-full text-center py-12 text-stone-400 text-sm">No employees added yet</div>
        )}
      </div>

      {(showAdd || editEmp) && (
        <div className="fixed inset-0 z-[85] bg-stone-950/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setShowAdd(false); setEditEmp(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-bold text-stone-900">{editEmp ? 'Edit Employee' : 'Add Employee'}</h3>
              <button onClick={() => { setShowAdd(false); setEditEmp(null); }} className="p-1.5 rounded-full hover:bg-stone-100"><X className="w-4 h-4 text-stone-500" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-600 uppercase mb-1.5">Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-sm outline-none focus:border-sage-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 uppercase mb-1.5">Phone</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-sm outline-none focus:border-sage-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 uppercase mb-1.5">Default Role</label>
                <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-sm outline-none focus:border-sage-400">
                  <option value="">No role</option>
                  {roles.map((r) => (<option key={r.id} value={r.id}>{r.role_name}</option>))}
                </select>
              </div>
            </div>
            <button onClick={handleSave} disabled={submitting || !name.trim()} className="w-full mt-5 py-2.5 rounded-lg bg-sage-900 text-sage-50 font-bold text-sm hover:bg-sage-800 disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {editEmp ? 'Save Changes' : 'Add Employee'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ROLES TAB
// ============================================================
function RolesTab({ roles, onReload }: { roles: Role[]; onReload: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const openAdd = () => { setRoleName(''); setPermissions([]); setShowAdd(true); };
  const openEdit = (role: Role) => { setEditRole(role); setRoleName(role.role_name); setPermissions(role.permissions_json ?? []); };

  const togglePerm = (key: string) => {
    setPermissions((prev) => prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]);
  };

  const handleSave = async () => {
    if (!roleName.trim()) return;
    setSubmitting(true);
    try {
      if (editRole && !editRole.is_system) {
        await supabase.from('roles').update({ role_name: roleName.trim(), permissions_json: permissions }).eq('id', editRole.id);
      } else if (!editRole) {
        await supabase.from('roles').insert({ role_name: roleName.trim(), permissions_json: permissions, is_system: false });
      }
      setShowAdd(false);
      setEditRole(null);
      onReload();
    } catch {
      alert('Failed to save role');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (role: Role) => {
    if (role.is_system) { alert('System roles cannot be deleted'); return; }
    if (!confirm(`Delete role "${role.role_name}"?`)) return;
    await supabase.from('roles').delete().eq('id', role.id);
    onReload();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-stone-900">Roles & Permissions</h3>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sage-900 text-sage-50 font-bold text-sm hover:bg-sage-800 transition-colors">
          <Plus className="w-4 h-4" />
          Add Role
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {roles.map((role) => (
          <div key={role.id} className="bg-white rounded-xl border border-stone-200 p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-sage-700" />
                <div>
                  <p className="font-bold text-stone-900">{role.role_name}</p>
                  {role.is_system && <span className="text-[10px] bg-sage-100 text-sage-700 px-1.5 py-0.5 rounded-full font-semibold">System</span>}
                </div>
              </div>
              <div className="flex gap-1">
                {!role.is_system && (
                  <>
                    <button onClick={() => openEdit(role)} className="p-1.5 rounded-lg text-stone-400 hover:text-sage-600 hover:bg-stone-50">
                      <UserCog className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(role)} className="p-1.5 rounded-lg text-stone-300 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {role.permissions_json?.includes('all') ? (
                <span className="text-xs bg-sage-100 text-sage-700 px-2 py-0.5 rounded-full font-semibold">All Permissions</span>
              ) : (
                (role.permissions_json ?? []).map((perm) => {
                  const label = ALL_PERMISSIONS.find((p) => p.key === perm)?.label ?? perm;
                  return <span key={perm} className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">{label}</span>;
                })
              )}
            </div>
          </div>
        ))}
      </div>

      {(showAdd || (editRole && !editRole.is_system)) && (
        <div className="fixed inset-0 z-[85] bg-stone-950/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setShowAdd(false); setEditRole(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-bold text-stone-900">{editRole ? 'Edit Role' : 'Create Role'}</h3>
              <button onClick={() => { setShowAdd(false); setEditRole(null); }} className="p-1.5 rounded-full hover:bg-stone-100"><X className="w-4 h-4 text-stone-500" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-600 uppercase mb-1.5">Role Name</label>
                <input type="text" value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="e.g. Barista" className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-sm outline-none focus:border-sage-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 uppercase mb-2">Permissions</label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_PERMISSIONS.map((perm) => (
                    <button
                      key={perm.key}
                      onClick={() => togglePerm(perm.key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-left transition-all ${
                        permissions.includes(perm.key) ? 'bg-sage-50 border border-sage-300 text-sage-800' : 'bg-stone-50 border border-stone-200 text-stone-500'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                        permissions.includes(perm.key) ? 'border-sage-600 bg-sage-600' : 'border-stone-300'
                      }`}>
                        {permissions.includes(perm.key) && <span className="text-white text-[8px]">✓</span>}
                      </div>
                      {perm.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={handleSave} disabled={submitting || !roleName.trim()} className="w-full mt-5 py-2.5 rounded-lg bg-sage-900 text-sage-50 font-bold text-sm hover:bg-sage-800 disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {editRole ? 'Save Changes' : 'Create Role'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
