import { useState, useEffect, useCallback } from 'react';
import { Heart, Droplets, Thermometer, Eye, Wifi, Battery, Activity, AlertTriangle, Bell, Clock, ShieldAlert, UtensilsCrossed, Pill, CheckCircle2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import HealthCard from '../components/shared/HealthCard';
import LoadingState from '../components/shared/LoadingState';
import ErrorState from '../components/shared/ErrorState';
import { telemetryAPI, blinkAPI, alertAPI, patientAPI } from '../services/api';
import { getSocket } from '../services/socket';
import toast from 'react-hot-toast';

const CMD_GUIDE = [
  { blinks: '1 Blink', cmd: 'Normal (Status Logged)', color: 'text-slate-400' },
  { blinks: '2 Blinks', cmd: 'Need Water', color: 'text-cyan-400' },
  { blinks: '3 Blinks', cmd: 'Need Food', color: 'text-amber-400' },
  { blinks: '4 Blinks', cmd: 'Need Medicine', color: 'text-purple-400' },
  { blinks: '5+ Blinks / Hold ≥3s', cmd: 'Emergency SOS', color: 'text-red-400 font-bold' },
];

export default function DashboardPage() {
  const [patientId, setPatientId] = useState(null);
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [blinkSummary, setBlinkSummary] = useState(null);
  const [latestBlink, setLatestBlink] = useState(null);
  const [alertSummary, setAlertSummary] = useState({ total: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      const patients = await patientAPI.list({ per_page: 1 });
      const pid = patients.data?.data?.items?.[0]?.id;
      setPatientId(pid);

      if (pid) {
        const [statsRes, chartRes, blinkRes, alertRes, latestEvents] = await Promise.all([
          telemetryAPI.stats({ patient_id: pid }),
          telemetryAPI.chart({ patient_id: pid, limit: 30 }),
          blinkAPI.summary({ patient_id: pid }),
          alertAPI.list({ per_page: 1 }),
          blinkAPI.list({ patient_id: pid, per_page: 1 })
        ]);

        setStats(statsRes.data.data);
        setChartData(chartRes.data.data || []);
        setBlinkSummary(blinkRes.data.data);
        setAlertSummary({ total: alertRes.data.data?.pagination?.total || 0 });

        const items = latestEvents.data.data?.items;
        if (items?.length > 0) setLatestBlink(items[0]);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // WebSocket live updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onTelemetry = (data) => {
      setStats((prev) => prev ? {
        ...prev,
        heart_rate: { ...prev.heart_rate, latest: data.heart_rate },
        spo2: { ...prev.spo2, latest: data.spo2 },
        temperature: { ...prev.temperature, latest: data.temperature },
      } : prev);
      setChartData((prev) => [...prev.slice(-29), {
        timestamp: data.timestamp,
        heart_rate: data.heart_rate,
        spo2: data.spo2,
        temperature: data.temperature,
      }]);
    };

    const onBlink = (data) => {
      setLatestBlink(data);
      if (data.command && data.command !== 'NORMAL_BLINK') {
        toast.success(`Patient Request: ${data.command?.replace('_', ' ')} (${data.blink_count || 1} blinks)`, {
          icon: '👁️',
          duration: 5000,
        });
      }
      // Re-fetch summary stats to ensure consistency
      if (patientId) {
        blinkAPI.summary({ patient_id: patientId }).then((res) => setBlinkSummary(res.data.data)).catch(() => {});
      }
    };

    const onEmergency = (data) => {
      setLatestBlink(data);
      toast.error(`🚨 EMERGENCY SOS! Patient ${data.patient_name || 'Monitoring Room'} requires immediate assistance!`, {
        duration: 10000,
      });
      if (patientId) {
        blinkAPI.summary({ patient_id: patientId }).then((res) => setBlinkSummary(res.data.data)).catch(() => {});
        alertAPI.list({ per_page: 1 }).then((res) => setAlertSummary({ total: res.data.data?.pagination?.total || 0 })).catch(() => {});
      }
    };

    const onAlert = () => {
      setAlertSummary((p) => ({ ...p, total: p.total + 1 }));
    };

    socket.on('telemetry_update', onTelemetry);
    socket.on('blink_command', onBlink);
    socket.on('emergency_sos', onEmergency);
    socket.on('alert_triggered', onAlert);

    return () => {
      socket.off('telemetry_update', onTelemetry);
      socket.off('blink_command', onBlink);
      socket.off('emergency_sos', onEmergency);
      socket.off('alert_triggered', onAlert);
    };
  }, [patientId]);

  if (loading) return <LoadingState message="Loading live dashboard..." />;
  if (error) return <ErrorState message={error} onRetry={fetchDashboardData} />;

  const hr = stats?.heart_rate?.latest;
  const spo2 = stats?.spo2?.latest;
  const temp = stats?.temperature?.latest;

  const getCommandIcon = (cmd) => {
    if (cmd === 'EMERGENCY') return <ShieldAlert className="w-4 h-4 text-red-400" />;
    if (cmd === 'NEED_WATER') return <Droplets className="w-4 h-4 text-cyan-400" />;
    if (cmd === 'NEED_FOOD') return <UtensilsCrossed className="w-4 h-4 text-amber-400" />;
    if (cmd === 'NEED_MEDICINE') return <Pill className="w-4 h-4 text-purple-400" />;
    return <Eye className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div className="space-y-6">
      {/* Health Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <HealthCard title="Heart Rate" value={hr ?? '--'} unit="bpm" icon={Heart} status={hr > 100 ? 'warning' : 'normal'} subtitle={stats?.heart_rate?.avg ? `Avg: ${stats.heart_rate.avg}` : null} />
        <HealthCard title="SpO2" value={spo2 ?? '--'} unit="%" icon={Droplets} status={spo2 && spo2 < 95 ? 'warning' : 'normal'} subtitle={stats?.spo2?.avg ? `Avg: ${stats.spo2.avg}` : null} />
        <HealthCard title="Temperature" value={temp ?? '--'} unit="°C" icon={Thermometer} status={temp && temp > 37.5 ? 'warning' : 'normal'} subtitle={stats?.temperature?.avg ? `Avg: ${stats.temperature.avg}` : null} />
        <HealthCard title="Blink Status" value={latestBlink?.command?.replace('_', ' ') || 'Idle'} icon={Eye} status={latestBlink?.command === 'EMERGENCY' ? 'critical' : latestBlink?.command !== 'NORMAL_BLINK' && latestBlink ? 'info' : 'normal'} subtitle={latestBlink?.source === 'CAMERA' ? '📹 Live Camera' : latestBlink?.source === 'SIMULATOR' ? '⚡ Simulated' : latestBlink?.source ? '🔬 ESP32' : null} />
        <HealthCard title="Alerts" value={alertSummary.total} icon={Bell} status={alertSummary.total > 0 ? 'warning' : 'normal'} subtitle="Total alerts" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Health Chart */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" /> Health Vitals Trend
          </h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="timestamp" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => v ? new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="heart_rate" name="Heart Rate" stroke="#f43f5e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="spo2" name="SpO2" stroke="#06b6d4" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="temperature" name="Temperature" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-500 text-center py-16">No chart data yet. Telemetry will appear as incoming readings are recorded.</p>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Command Guide */}
          <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Eye className="w-4 h-4 text-cyan-400" /> Command Guide (7-Second Rule)
            </h3>
            <div className="space-y-2">
              {CMD_GUIDE.map((g) => (
                <div key={g.cmd} className="flex justify-between items-center py-1.5 px-2 rounded bg-slate-800/30">
                  <span className="text-xs text-slate-400">{g.blinks}</span>
                  <span className={`text-xs font-medium ${g.color}`}>{g.cmd}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Latest Patient Request */}
          {latestBlink ? (
            <div className={`border rounded-xl p-5 shadow-lg ${
              latestBlink.command === 'EMERGENCY'
                ? 'bg-red-500/10 border-red-500/40 shadow-red-500/10'
                : 'bg-slate-900/50 border-slate-700/50'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  {getCommandIcon(latestBlink.command)} Latest Patient Request
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">
                  {latestBlink.timestamp ? new Date(latestBlink.timestamp).toLocaleTimeString() : 'Recent'}
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Requirement:</span>
                  <span className={`font-bold text-sm ${
                    latestBlink.command === 'EMERGENCY' ? 'text-red-400' : 'text-cyan-400'
                  }`}>
                    {latestBlink.command?.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Blinks in Window:</span>
                  <span className="text-white font-semibold">{latestBlink.blink_count ?? 1}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Duration:</span>
                  <span className="text-white font-mono">{latestBlink.duration_seconds ?? 0}s</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Source:</span>
                  <span className={`font-semibold ${
                    latestBlink.source === 'CAMERA' ? 'text-cyan-400' :
                    latestBlink.source === 'SIMULATOR' ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {latestBlink.source || 'LIVE CAMERA'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Severity:</span>
                  <span className={`font-bold ${
                    latestBlink.severity === 'CRITICAL' ? 'text-red-400' :
                    latestBlink.severity === 'HIGH' ? 'text-purple-400' : 'text-amber-400'
                  }`}>
                    {latestBlink.severity || 'MEDIUM'}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-700/50">
                  <span className="text-slate-400">Status:</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> DELIVERED TO CAREGIVER
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5 text-center text-xs text-slate-500">
              No patient requests detected yet.
            </div>
          )}

          {/* Daily Summary */}
          {blinkSummary && (
            <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Communication Summary</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-slate-400">Total Commands</span><span className="text-white font-medium">{blinkSummary.total}</span></div>
                <div className="flex justify-between"><span className="text-cyan-400">Need Water</span><span className="text-white">{blinkSummary.commands?.NEED_WATER || 0}</span></div>
                <div className="flex justify-between"><span className="text-amber-400">Need Food</span><span className="text-white">{blinkSummary.commands?.NEED_FOOD || 0}</span></div>
                <div className="flex justify-between"><span className="text-purple-400">Need Medicine</span><span className="text-white">{blinkSummary.commands?.NEED_MEDICINE || 0}</span></div>
                <div className="flex justify-between"><span className="text-red-400">Emergency</span><span className="text-white">{blinkSummary.commands?.EMERGENCY || 0}</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
