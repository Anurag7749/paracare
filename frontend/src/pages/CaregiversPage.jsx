import { useState, useEffect } from 'react';
import { Users, UserPlus, Phone, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import DataTable from '../components/shared/DataTable';
import LoadingState from '../components/shared/LoadingState';
import ErrorState from '../components/shared/ErrorState';
import { caregiverAPI, patientAPI } from '../services/api';
import toast from 'react-hot-toast';

export default function CaregiversPage() {
  const [caregivers, setCaregivers] = useState([]);
  const [patients, setPatients] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedCaregiver, setSelectedCaregiver] = useState(null);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);

  const fetchCaregivers = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const [cgRes, pRes] = await Promise.all([
        caregiverAPI.list({ page, per_page: 20 }),
        patientAPI.list({ per_page: 100 })
      ]);
      setCaregivers(cgRes.data.data?.items || []);
      setPagination(cgRes.data.data?.pagination || { page: 1, pages: 1, total: 0 });
      setPatients(pRes.data.data?.items || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load caregivers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCaregivers(1);
  }, []);

  const handleOpenAssignModal = (caregiver) => {
    setSelectedCaregiver(caregiver);
    setSelectedPatientId('');
    setAssignModalOpen(true);
  };

  const handleAssignPatient = async (e) => {
    e.preventDefault();
    if (!selectedCaregiver || !selectedPatientId) return;
    setAssignLoading(true);
    try {
      await caregiverAPI.assign(selectedCaregiver.id, { patient_id: selectedPatientId });
      toast.success('Patient assigned to caregiver successfully');
      setAssignModalOpen(false);
      fetchCaregivers(pagination.page);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign patient');
    } finally {
      setAssignLoading(false);
    }
  };

  const columns = [
    {
      header: 'Caregiver Name',
      accessor: 'user_name',
      render: (row) => (
        <div>
          <p className="font-semibold text-white">{row.user_name || 'Caregiver'}</p>
          <p className="text-[10px] text-slate-400">{row.user_email}</p>
        </div>
      )
    },
    {
      header: 'Phone Number',
      accessor: 'phone',
      render: (row) => <span className="text-slate-300 text-xs">{row.phone || 'N/A'}</span>
    },
    {
      header: 'WhatsApp',
      accessor: 'whatsapp_number',
      render: (row) => <span className="text-slate-300 text-xs">{row.whatsapp_number || 'N/A'}</span>
    },
    {
      header: 'Assigned Patients',
      accessor: 'patient_count',
      render: (row) => (
        <div>
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-cyan-500/20 text-cyan-400">
            {row.patient_count} Patients
          </span>
          {row.assigned_patients?.length > 0 && (
            <div className="text-[10px] text-slate-400 mt-1 space-x-1">
              {row.assigned_patients.map((p) => (
                <span key={p.id} className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                  {p.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )
    },
    {
      header: 'Action',
      accessor: 'id',
      render: (row) => (
        <button
          onClick={() => handleOpenAssignModal(row)}
          className="flex items-center gap-1 px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-medium transition-colors"
        >
          <UserPlus className="w-3.5 h-3.5" /> Assign Patient
        </button>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-slate-900/50 p-4 border border-slate-700/50 rounded-xl">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-cyan-400" /> Caregiver Staff Management
        </h3>
      </div>

      {loading ? (
        <LoadingState message="Loading caregiver staff registry..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchCaregivers(1)} />
      ) : (
        <DataTable
          columns={columns}
          data={caregivers}
          pagination={pagination}
          onPageChange={(p) => fetchCaregivers(p)}
          emptyMessage="No registered caregivers found in the database."
        />
      )}

      {/* Assign Patient Modal */}
      {assignModalOpen && selectedCaregiver && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Assign Patient to {selectedCaregiver.user_name}</h3>
              <button onClick={() => setAssignModalOpen(false)} className="text-slate-500 hover:text-white text-lg">×</button>
            </div>

            <form onSubmit={handleAssignPatient} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Select Patient</label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">-- Choose Patient --</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.patient_code}) — Room {p.room_number || 'N/A'}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={assignLoading}
                className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {assignLoading ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
