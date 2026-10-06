import { useState, useEffect } from 'react';
import { Bell, AlertTriangle, CheckCircle2, ShieldAlert, Eye, Filter, Clock } from 'lucide-react';
import DataTable from '../components/shared/DataTable';
import LoadingState from '../components/shared/LoadingState';
import ErrorState from '../components/shared/ErrorState';
import { alertAPI, patientAPI } from '../services/api';
import { getSocket } from '../services/socket';
import toast from 'react-hot-toast';

export default function AlertsPage() {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  const [alerts, setAlerts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedAlert, setSelectedAlert] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [ackNotes, setAckNotes] = useState('');
  const [ackLoading, setAckLoading] = useState(false);

  useEffect(() => {
    patientAPI.list({ per_page: 100 }).then((res) => {
      setPatients(res.data.data?.items || []);
    }).catch(() => {});
  }, []);

  const fetchAlerts = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        patient_id: selectedPatient || undefined,
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
        page,
        per_page: 20
      };
      const res = await alertAPI.list(params);
      setAlerts(res.data.data?.items || []);
      setPagination(res.data.data?.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts(1);
  }, [selectedPatient, statusFilter, severityFilter]);

  // WebSocket real-time updates for new alerts
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onAlertTriggered = (data) => {
      fetchAlerts(1);
      toast((t) => (
        <div className="flex items-start gap-2">
          <Bell className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-xs text-white">New Alert Triggered</p>
            <p className="text-xs text-slate-300">{data.message}</p>
          </div>
        </div>
      ), { duration: 6000 });
    };

    const onEmergencySos = (data) => {
      fetchAlerts(1);
      toast.error(`🚨 EMERGENCY SOS! Patient: ${data.patient_name || 'Patient'}`, { duration: 10000 });
    };

    const onAlertAck = () => {
      fetchAlerts(pagination.page);
    };

    socket.on('alert_triggered', onAlertTriggered);
    socket.on('emergency_sos', onEmergencySos);
    socket.on('alert_acknowledged', onAlertAck);

    return () => {
      socket.off('alert_triggered', onAlertTriggered);
      socket.off('emergency_sos', onEmergencySos);
      socket.off('alert_acknowledged', onAlertAck);
    };
  }, [pagination.page]);

  const handleOpenDetail = async (alertId) => {
    try {
      const res = await alertAPI.get(alertId);
      setSelectedAlert(res.data.data);
      setDetailModalOpen(true);
    } catch (err) {
      toast.error('Failed to load alert details');
    }
  };

  const handleAcknowledge = async (alertId) => {
    setAckLoading(true);
    try {
      await alertAPI.acknowledge(alertId, { notes: ackNotes || 'Acknowledged by caregiver' });
      toast.success('Alert acknowledged successfully');
      setDetailModalOpen(false);
      setAckNotes('');
      fetchAlerts(pagination.page);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to acknowledge alert');
    } finally {
      setAckLoading(false);
    }
  };

  const columns = [
    {
      header: 'Timestamp',
      accessor: 'created_at',
      render: (row) => row.created_at ? new Date(row.created_at).toLocaleString() : 'N/A'
    },
    {
      header: 'Patient',
      accessor: 'patient_name',
      render: (row) => (
        <div>
          <p className="font-medium text-white">{row.patient_name || 'N/A'}</p>
          <p className="text-[10px] text-slate-500">Room {row.room_number || 'N/A'}</p>
        </div>
      )
    },
    {
      header: 'Alert Type',
      accessor: 'alert_type',
      render: (row) => <span className="font-semibold text-xs text-slate-200">{row.alert_type}</span>
    },
    {
      header: 'Severity',
      accessor: 'severity',
      render: (row) => (
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${row.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : row.severity === 'HIGH' ? 'bg-purple-500/20 text-purple-400' : 'bg-amber-500/20 text-amber-400'}`}>
          {row.severity}
        </span>
      )
    },
    {
      header: 'Message',
      accessor: 'message',
      render: (row) => <span className="text-xs text-slate-300 max-w-xs truncate block">{row.message}</span>
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (row) => (
        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${row.status === 'PENDING' ? 'bg-amber-500/20 text-amber-400 animate-pulse' : 'bg-emerald-500/20 text-emerald-400'}`}>
          {row.status}
        </span>
      )
    },
    {
      header: 'Action',
      accessor: 'id',
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenDetail(row.id)}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded transition-colors"
          >
            View
          </button>
          {row.status === 'PENDING' && (
            <button
              onClick={() => handleAcknowledge(row.id)}
              className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-xs font-medium text-white rounded transition-colors"
            >
              Acknowledge
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Filter Header */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-900/50 p-4 border border-slate-700/50 rounded-xl">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Patient</label>
          <select
            value={selectedPatient}
            onChange={(e) => setSelectedPatient(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="">All Patients</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Severity</label>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingState message="Loading alert notifications..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchAlerts(1)} />
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white">Alert Queue</h3>
          <DataTable
            columns={columns}
            data={alerts}
            pagination={pagination}
            onPageChange={(p) => fetchAlerts(p)}
            emptyMessage="No alerts found matching the selected filters."
          />
        </div>
      )}

      {/* Alert Detail & Acknowledgment Modal */}
      {detailModalOpen && selectedAlert && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${selectedAlert.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                  {selectedAlert.severity} SEVERITY
                </span>
                <h3 className="text-base font-bold text-white mt-1">{selectedAlert.alert_type}</h3>
              </div>
              <button onClick={() => setDetailModalOpen(false)} className="text-slate-500 hover:text-white text-lg">×</button>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-slate-300 font-medium bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                {selectedAlert.message}
              </p>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <div><span className="text-slate-500">Patient:</span> <span className="text-white font-medium">{selectedAlert.patient_name || 'N/A'}</span></div>
                <div><span className="text-slate-500">Room:</span> <span className="text-white">{selectedAlert.room_number || 'N/A'}</span></div>
                <div><span className="text-slate-500">Status:</span> <span className="text-cyan-400">{selectedAlert.status}</span></div>
                <div><span className="text-slate-500">Created:</span> <span className="text-slate-300">{new Date(selectedAlert.created_at).toLocaleTimeString()}</span></div>
              </div>

              {selectedAlert.blink_event && (
                <div className="bg-slate-800/30 p-3 rounded-lg space-y-1 mt-2">
                  <p className="text-slate-400 font-semibold">Originating Blink Command</p>
                  <p className="text-white">Command: <span className="text-cyan-400">{selectedAlert.blink_event.command}</span></p>
                  <p className="text-slate-400">Blinks: {selectedAlert.blink_event.blink_count} | Duration: {selectedAlert.blink_event.duration_seconds}s | Source: {selectedAlert.blink_event.source}</p>
                </div>
              )}

              {selectedAlert.notification_logs?.length > 0 && (
                <div className="pt-2">
                  <p className="text-slate-400 font-semibold mb-1">Dispatched Notifications</p>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {selectedAlert.notification_logs.map((log) => (
                      <div key={log.id} className="flex justify-between items-center bg-slate-800/20 px-2 py-1 rounded text-[11px]">
                        <span className="text-slate-300">{log.channel}: {log.recipient}</span>
                        <span className="text-emerald-400 font-medium">{log.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {selectedAlert.status === 'PENDING' && (
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <label className="block text-xs text-slate-400">Caregiver Acknowledgment Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Attending to patient in Room 101"
                  value={ackNotes}
                  onChange={(e) => setAckNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={() => handleAcknowledge(selectedAlert.id)}
                  disabled={ackLoading}
                  className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {ackLoading ? 'Acknowledging...' : 'Confirm Acknowledgment'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
