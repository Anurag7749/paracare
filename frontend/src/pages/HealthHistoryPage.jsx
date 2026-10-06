import { useState, useEffect } from 'react';
import { Heart, Droplets, Thermometer, Download, Filter, Eye, Camera, Radio, Cpu, Bell, Activity, Clock, ShieldAlert } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import HealthCard from '../components/shared/HealthCard';
import DataTable from '../components/shared/DataTable';
import LoadingState from '../components/shared/LoadingState';
import ErrorState from '../components/shared/ErrorState';
import { telemetryAPI, patientAPI, blinkAPI } from '../services/api';
import { getSocket } from '../services/socket';
import toast from 'react-hot-toast';

export default function HealthHistoryPage() {
  const [activeTab, setActiveTab] = useState('communication'); // 'communication' | 'vitals'
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [metricFilter, setMetricFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('');

  // Vitals State
  const [vitalsData, setVitalsData] = useState([]);
  const [vitalsPagination, setVitalsPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState([]);

  // Communication Requests State
  const [communicationData, setCommunicationData] = useState([]);
  const [communicationPagination, setCommunicationPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [communicationSummary, setCommunicationSummary] = useState(null);

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  // Load patient list on mount
  useEffect(() => {
    patientAPI.list({ per_page: 100 }).then((res) => {
      const items = res.data.data?.items || [];
      setPatients(items);
      if (items.length > 0) setSelectedPatient(items[0].id);
    }).catch((err) => {
      setError('Failed to load patient list');
      setLoading(false);
    });
  }, []);

  const fetchData = async (vPage = 1, cPage = 1) => {
    if (!selectedPatient) return;
    setLoading(true);
    setError(null);
    try {
      const commonParams = {
        patient_id: selectedPatient,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      };

      const [histRes, statsRes, chartRes, blinkRes, blinkSumRes] = await Promise.all([
        telemetryAPI.history({ ...commonParams, page: vPage, per_page: 15 }),
        telemetryAPI.stats(commonParams),
        telemetryAPI.chart({ ...commonParams, limit: 60 }),
        blinkAPI.list({ ...commonParams, source: sourceFilter || undefined, page: cPage, per_page: 15 }),
        blinkAPI.summary(commonParams),
      ]);

      setVitalsData(histRes.data.data?.items || []);
      setVitalsPagination(histRes.data.data?.pagination || { page: 1, pages: 1, total: 0 });
      setStats(statsRes.data.data || null);
      setChartData(chartRes.data.data || []);

      setCommunicationData(blinkRes.data.data?.items || []);
      setCommunicationPagination(blinkRes.data.data?.pagination || { page: 1, pages: 1, total: 0 });
      setCommunicationSummary(blinkSumRes.data.data || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch health history data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedPatient) {
      fetchData(1, 1);
    }
  }, [selectedPatient, sourceFilter]);

  // Socket.IO live updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onBlink = () => {
      if (selectedPatient) fetchData(vitalsPagination.page, 1);
    };
    const onAlert = () => {
      if (selectedPatient) fetchData(vitalsPagination.page, 1);
    };

    socket.on('blink_command', onBlink);
    socket.on('alert_triggered', onAlert);
    socket.on('emergency_sos', onAlert);
    socket.on('alert_acknowledged', onAlert);

    return () => {
      socket.off('blink_command', onBlink);
      socket.off('alert_triggered', onAlert);
      socket.off('emergency_sos', onAlert);
      socket.off('alert_acknowledged', onAlert);
    };
  }, [selectedPatient, vitalsPagination.page]);

  const handleApplyFilter = (e) => {
    e.preventDefault();
    fetchData(1, 1);
  };

  const handleExportCSV = async () => {
    if (!selectedPatient) return;
    setExporting(true);
    try {
      const res = await telemetryAPI.export({
        patient_id: selectedPatient,
        start_date: startDate || undefined,
        end_date: endDate || undefined
      });
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `health_history_${selectedPatient.slice(0, 8)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('CSV Export downloaded successfully');
    } catch (err) {
      toast.error('Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  // Communication Table Columns
  const communicationColumns = [
    {
      header: 'Date / Time',
      accessor: 'timestamp',
      render: (row) => row.timestamp ? new Date(row.timestamp).toLocaleString() : 'N/A'
    },
    {
      header: 'Request / Command',
      accessor: 'command',
      render: (row) => {
        const cmd = row.command;
        let color = 'text-slate-300 bg-slate-800 border-slate-700';
        if (cmd === 'NEED_WATER') color = 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
        else if (cmd === 'NEED_FOOD') color = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
        else if (cmd === 'NEED_MEDICINE') color = 'text-purple-400 bg-purple-500/10 border-purple-500/30';
        else if (cmd === 'EMERGENCY') color = 'text-red-400 bg-red-500/20 border-red-500/40 font-bold';

        return (
          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${color}`}>
            {cmd?.replace('_', ' ')}
          </span>
        );
      }
    },
    {
      header: 'Blinks',
      accessor: 'blink_count',
      render: (row) => (
        <span className="font-bold text-cyan-400 text-sm">
          {row.blink_count} <span className="text-[10px] text-slate-500 font-normal">blinks ({row.duration_seconds}s)</span>
        </span>
      )
    },
    {
      header: 'Severity',
      accessor: 'severity',
      render: (row) => (
        <span className={`text-xs font-bold ${
          row.severity === 'CRITICAL' ? 'text-red-400' :
          row.severity === 'HIGH' ? 'text-purple-400' :
          row.severity === 'MEDIUM' ? 'text-amber-400' : 'text-slate-400'
        }`}>
          {row.severity}
        </span>
      )
    },
    {
      header: 'Source',
      accessor: 'source',
      render: (row) => {
        if (row.source === 'CAMERA') {
          return (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400">
              <Camera className="w-3.5 h-3.5" /> LIVE CAMERA
            </span>
          );
        }
        if (row.source === 'SIMULATOR') {
          return (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
              <Cpu className="w-3.5 h-3.5" /> SIMULATOR
            </span>
          );
        }
        return (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <Radio className="w-3.5 h-3.5" /> ESP32 HARDWARE
          </span>
        );
      }
    },
    {
      header: 'Status',
      accessor: 'alert_status',
      render: (row) => {
        const st = row.alert_status || (row.command === 'NORMAL_BLINK' ? 'LOGGED' : 'SENT');
        let badgeColor = 'bg-slate-800 text-slate-400';
        if (st === 'PENDING' || st === 'SENT') badgeColor = 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse';
        if (st === 'ACKNOWLEDGED') badgeColor = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        if (st === 'RESOLVED') badgeColor = 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';

        return (
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${badgeColor}`}>
            {st}
          </span>
        );
      }
    }
  ];

  // Vitals Table Columns
  const vitalsColumns = [
    {
      header: 'Timestamp',
      accessor: 'timestamp',
      render: (row) => row.timestamp ? new Date(row.timestamp).toLocaleString() : 'N/A'
    },
    {
      header: 'Heart Rate',
      accessor: 'heart_rate',
      render: (row) => <span className="font-semibold text-rose-400">{row.heart_rate} bpm</span>
    },
    {
      header: 'SpO2',
      accessor: 'spo2',
      render: (row) => <span className="font-semibold text-cyan-400">{row.spo2}%</span>
    },
    {
      header: 'Temperature',
      accessor: 'temperature',
      render: (row) => <span className="font-semibold text-amber-400">{row.temperature}°C</span>
    },
    {
      header: 'Battery',
      accessor: 'battery_percentage',
      render: (row) => <span className="text-slate-300">{row.battery_percentage}%</span>
    },
    {
      header: 'Wi-Fi Status',
      accessor: 'wifi_status',
      render: (row) => <span className="text-slate-400 text-xs">{row.wifi_status || 'Connected'}</span>
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/50 p-4 border border-slate-700/50 rounded-xl">
        <form onSubmit={handleApplyFilter} className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Patient</label>
            <select
              value={selectedPatient}
              onChange={(e) => setSelectedPatient(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.patient_code})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          {activeTab === 'communication' && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Source</label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="">All Sources</option>
                <option value="CAMERA">Live Camera</option>
                <option value="ESP32">ESP32 Hardware</option>
                <option value="SIMULATOR">Simulator</option>
              </select>
            </div>
          )}

          {activeTab === 'vitals' && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Vital Filter</label>
              <select
                value={metricFilter}
                onChange={(e) => setMetricFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="all">All Vitals</option>
                <option value="heart_rate">Heart Rate Only</option>
                <option value="spo2">SpO2 Only</option>
                <option value="temperature">Temperature Only</option>
              </select>
            </div>
          )}

          <div className="flex items-end pt-5">
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-xs font-semibold text-white transition-colors"
            >
              <Filter className="w-3.5 h-3.5" /> Apply
            </button>
          </div>
        </form>

        <button
          onClick={handleExportCSV}
          disabled={exporting || !selectedPatient}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium text-slate-300 transition-colors disabled:opacity-50"
        >
          <Download className="w-4 h-4 text-cyan-400" />
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('communication')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'communication'
              ? 'border-cyan-500 text-cyan-400 bg-slate-900/40'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Eye className="w-4 h-4" /> Patient Communication & Requests
          {communicationPagination.total > 0 && (
            <span className="px-1.5 py-0.2 bg-cyan-500/20 text-cyan-400 rounded-full text-[10px]">
              {communicationPagination.total}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('vitals')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'vitals'
              ? 'border-cyan-500 text-cyan-400 bg-slate-900/40'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Activity className="w-4 h-4" /> Physiological Vitals History
          {vitalsPagination.total > 0 && (
            <span className="px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded-full text-[10px]">
              {vitalsPagination.total}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <LoadingState message="Loading historical data from PostgreSQL..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchData(1, 1)} />
      ) : (
        <>
          {activeTab === 'communication' ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <HealthCard
                  title="Total Requests"
                  value={communicationSummary?.total ?? 0}
                  icon={Eye}
                  status="info"
                  subtitle="Stored in database"
                />
                <HealthCard
                  title="Water (2 Blinks)"
                  value={communicationSummary?.commands?.NEED_WATER ?? 0}
                  status="info"
                  subtitle="Medium priority"
                />
                <HealthCard
                  title="Food (3 Blinks)"
                  value={communicationSummary?.commands?.NEED_FOOD ?? 0}
                  status="warning"
                  subtitle="Medium priority"
                />
                <HealthCard
                  title="Medicine (4 Blinks)"
                  value={communicationSummary?.commands?.NEED_MEDICINE ?? 0}
                  status="warning"
                  subtitle="High priority"
                />
                <HealthCard
                  title="Emergency SOS"
                  value={communicationSummary?.commands?.EMERGENCY ?? 0}
                  status="critical"
                  subtitle="5+ blinks / hold ≥3s"
                />
              </div>

              {/* Communication Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    Patient Communication & Blink Request History
                  </h3>
                  <span className="text-xs text-slate-400">
                    Showing {communicationData.length} of {communicationPagination.total} records
                  </span>
                </div>

                <DataTable
                  columns={communicationColumns}
                  data={communicationData}
                  pagination={communicationPagination}
                  onPageChange={(p) => fetchData(vitalsPagination.page, p)}
                  emptyMessage="No communication requests found for the selected patient."
                />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <HealthCard
                  title="Heart Rate Stats"
                  value={stats?.heart_rate?.latest ?? '--'}
                  unit="bpm"
                  icon={Heart}
                  status="normal"
                  subtitle={`Min: ${stats?.heart_rate?.min ?? '--'} | Max: ${stats?.heart_rate?.max ?? '--'} | Avg: ${stats?.heart_rate?.avg ?? '--'}`}
                />
                <HealthCard
                  title="SpO2 Stats"
                  value={stats?.spo2?.latest ?? '--'}
                  unit="%"
                  icon={Droplets}
                  status="normal"
                  subtitle={`Min: ${stats?.spo2?.min ?? '--'} | Max: ${stats?.spo2?.max ?? '--'} | Avg: ${stats?.spo2?.avg ?? '--'}`}
                />
                <HealthCard
                  title="Temperature Stats"
                  value={stats?.temperature?.latest ?? '--'}
                  unit="°C"
                  icon={Thermometer}
                  status="normal"
                  subtitle={`Min: ${stats?.temperature?.min ?? '--'} | Max: ${stats?.temperature?.max ?? '--'} | Avg: ${stats?.temperature?.avg ?? '--'}`}
                />
              </div>

              {/* Time Series Chart */}
              <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Historical Telemetry Trends</h3>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis
                        dataKey="timestamp"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickFormatter={(v) => v ? new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }} />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      {(metricFilter === 'all' || metricFilter === 'heart_rate') && (
                        <Line type="monotone" dataKey="heart_rate" name="Heart Rate" stroke="#f43f5e" strokeWidth={2} dot={false} />
                      )}
                      {(metricFilter === 'all' || metricFilter === 'spo2') && (
                        <Line type="monotone" dataKey="spo2" name="SpO2" stroke="#06b6d4" strokeWidth={2} dot={false} />
                      )}
                      {(metricFilter === 'all' || metricFilter === 'temperature') && (
                        <Line type="monotone" dataKey="temperature" name="Temperature" stroke="#f59e0b" strokeWidth={2} dot={false} />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-slate-500 text-center py-16">No telemetry readings recorded for this filter selection.</p>
                )}
              </div>

              {/* Paginated History Table */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-white">Health Reading Records</h3>
                <DataTable
                  columns={vitalsColumns}
                  data={vitalsData}
                  pagination={vitalsPagination}
                  onPageChange={(p) => fetchData(p, communicationPagination.page)}
                  emptyMessage="No health readings found for the selected patient and timeframe."
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
