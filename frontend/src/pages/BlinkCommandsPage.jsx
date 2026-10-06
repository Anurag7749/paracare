import { useState, useEffect } from 'react';
import { Eye, Filter, Cpu, Radio, AlertTriangle, Camera } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import HealthCard from '../components/shared/HealthCard';
import DataTable from '../components/shared/DataTable';
import LoadingState from '../components/shared/LoadingState';
import ErrorState from '../components/shared/ErrorState';
import { blinkAPI, patientAPI } from '../services/api';

const COMMAND_COLORS = {
  NORMAL_BLINK: '#64748b',
  NEED_WATER: '#06b6d4',
  NEED_FOOD: '#f59e0b',
  NEED_MEDICINE: '#a855f7',
  EMERGENCY: '#ef4444'
};

export default function BlinkCommandsPage() {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [commandFilter, setCommandFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [events, setEvents] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    patientAPI.list({ per_page: 100 }).then((res) => {
      setPatients(res.data.data?.items || []);
    }).catch(() => {});
  }, []);

  const fetchBlinkData = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        patient_id: selectedPatient || undefined,
        command: commandFilter || undefined,
        source: sourceFilter || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        page,
        per_page: 20
      };

      const [listRes, summaryRes] = await Promise.all([
        blinkAPI.list(params),
        blinkAPI.summary({
          patient_id: selectedPatient || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined
        })
      ]);

      setEvents(listRes.data.data?.items || []);
      setPagination(listRes.data.data?.pagination || { page: 1, pages: 1, total: 0 });
      setSummary(summaryRes.data.data || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load blink commands history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlinkData(1);
  }, [selectedPatient]);

  const handleFilter = (e) => {
    e.preventDefault();
    fetchBlinkData(1);
  };

  const columns = [
    {
      header: 'Timestamp',
      accessor: 'timestamp',
      render: (row) => row.timestamp ? new Date(row.timestamp).toLocaleString() : 'N/A'
    },
    {
      header: 'Patient',
      accessor: 'patient_name',
      render: (row) => (
        <div>
          <p className="font-medium text-white">{row.patient_name || 'N/A'}</p>
          <p className="text-[10px] text-slate-500">{row.patient_code}</p>
        </div>
      )
    },
    {
      header: 'Device',
      accessor: 'device_name',
      render: (row) => <span className="text-slate-300 text-xs">{row.device_name || 'Smart Glasses'}</span>
    },
    {
      header: 'Blinks',
      accessor: 'blink_count',
      render: (row) => <span className="font-semibold text-cyan-400">{row.blink_count}</span>
    },
    {
      header: 'Duration',
      accessor: 'duration_seconds',
      render: (row) => <span className="text-slate-300">{row.duration_seconds}s</span>
    },
    {
      header: 'Command',
      accessor: 'command',
      render: (row) => {
        const color = COMMAND_COLORS[row.command] || '#94a3b8';
        return (
          <span
            className="px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}
          >
            {row.command?.replace('_', ' ')}
          </span>
        );
      }
    },
    {
      header: 'Severity',
      accessor: 'severity',
      render: (row) => (
        <span className={`text-xs font-medium ${row.severity === 'CRITICAL' ? 'text-red-400' : row.severity === 'HIGH' ? 'text-purple-400' : row.severity === 'MEDIUM' ? 'text-amber-400' : 'text-slate-400'}`}>
          {row.severity}
        </span>
      )
    },
    {
      header: 'Alert Status',
      accessor: 'alert_status',
      render: (row) => row.alert_status ? (
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${row.alert_status === 'ACKNOWLEDGED' ? 'bg-emerald-500/20 text-emerald-400' : row.alert_status === 'RESOLVED' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-amber-500/20 text-amber-400'}`}>
          {row.alert_status}
        </span>
      ) : <span className="text-slate-600 text-xs">—</span>
    },
    {
      header: 'Source',
      accessor: 'source',
      render: (row) => {
        if (row.source === 'CAMERA') {
          return (
            <span className="flex items-center gap-1 text-xs font-medium text-cyan-400">
              <Camera className="w-3.5 h-3.5" /> CAMERA
            </span>
          );
        }
        if (row.source === 'SIMULATOR') {
          return (
            <span className="flex items-center gap-1 text-xs font-medium text-amber-400">
              <Cpu className="w-3.5 h-3.5" /> SIMULATOR
            </span>
          );
        }
        return (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
            <Radio className="w-3.5 h-3.5" /> ESP32
          </span>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <form onSubmit={handleFilter} className="flex flex-wrap items-center gap-3 bg-slate-900/50 p-4 border border-slate-700/50 rounded-xl">
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
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Command</label>
          <select
            value={commandFilter}
            onChange={(e) => setCommandFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="">All Commands</option>
            <option value="NORMAL_BLINK">Normal Blink</option>
            <option value="NEED_WATER">Need Water</option>
            <option value="NEED_FOOD">Need Food</option>
            <option value="NEED_MEDICINE">Need Medicine</option>
            <option value="EMERGENCY">Emergency SOS</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Source</label>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="">All Sources</option>
            <option value="CAMERA">Camera AI (In-Browser)</option>
            <option value="ESP32">ESP32 Hardware</option>
            <option value="SIMULATOR">Software Simulator</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-end pt-5">
          <button
            type="submit"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-xs font-semibold text-white transition-colors"
          >
            <Filter className="w-3.5 h-3.5" /> Filter
          </button>
        </div>
      </form>

      {loading ? (
        <LoadingState message="Loading blink commands history..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchBlinkData(1)} />
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <HealthCard title="Total Commands" value={summary?.total ?? 0} icon={Eye} status="info" />
            <HealthCard title="Need Water" value={summary?.commands?.NEED_WATER ?? 0} status="info" subtitle="2 blinks" />
            <HealthCard title="Need Food" value={summary?.commands?.NEED_FOOD ?? 0} status="warning" subtitle="3 blinks" />
            <HealthCard title="Need Medicine" value={summary?.commands?.NEED_MEDICINE ?? 0} status="warning" subtitle="4 blinks" />
            <HealthCard title="Emergency SOS" value={summary?.commands?.EMERGENCY ?? 0} status="critical" subtitle="5+ blinks / hold ≥3s" />
          </div>

          {/* Distribution Chart & Source Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-900/50 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Command Distribution</h3>
              {summary?.distribution && summary.distribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={summary.distribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="command" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => v?.replace('_', ' ')} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {summary.distribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COMMAND_COLORS[entry.command] || '#06b6d4'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-slate-500 text-center py-12">No command records available.</p>
              )}
            </div>

            <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white">Event Source Breakdown</h3>
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between p-3 bg-slate-800/40 rounded-lg border border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4 text-cyan-400" />
                    <div>
                      <p className="text-xs font-medium text-white">Camera AI</p>
                      <p className="text-[10px] text-slate-400">MediaPipe Vision</p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-cyan-400">{summary?.sources?.CAMERA ?? 0}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-800/40 rounded-lg border border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-emerald-400" />
                    <div>
                      <p className="text-xs font-medium text-white">ESP32 Glasses</p>
                      <p className="text-[10px] text-slate-400">Hardware IR Sensor</p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-emerald-400">{summary?.sources?.ESP32 ?? 0}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-800/40 rounded-lg border border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-amber-400" />
                    <div>
                      <p className="text-xs font-medium text-white">Software Simulator</p>
                      <p className="text-[10px] text-slate-400">Demo & Testing</p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-amber-400">{summary?.sources?.SIMULATOR ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white">Blink Command Log</h3>
            <DataTable
              columns={columns}
              data={events}
              pagination={pagination}
              onPageChange={(p) => fetchBlinkData(p)}
              emptyMessage="No blink command events match your search criteria."
            />
          </div>
        </>
      )}
    </div>
  );
}
