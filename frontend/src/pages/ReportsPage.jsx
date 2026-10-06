import { useState, useEffect, useRef } from 'react';
import { FileText, Download, Printer, Filter, Heart, Droplets, Thermometer, Eye, Bell, Cpu, Radio, ShieldCheck, Camera } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import LoadingState from '../components/shared/LoadingState';
import ErrorState from '../components/shared/ErrorState';
import { reportAPI, patientAPI } from '../services/api';
import toast from 'react-hot-toast';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const COMMAND_COLORS = {
  NORMAL_BLINK: '#64748b',
  NEED_WATER: '#06b6d4',
  NEED_FOOD: '#f59e0b',
  NEED_MEDICINE: '#a855f7',
  EMERGENCY: '#ef4444'
};

export default function ReportsPage() {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [error, setError] = useState(null);
  const reportRef = useRef(null);

  useEffect(() => {
    patientAPI.list({ per_page: 100 }).then((res) => {
      const items = res.data.data?.items || [];
      setPatients(items);
      if (items.length > 0) setSelectedPatient(items[0].id);
    }).catch(() => setLoading(false));
  }, []);

  const fetchReport = async () => {
    if (!selectedPatient) return;
    setLoading(true);
    setError(null);
    try {
      const res = await reportAPI.patient(selectedPatient, {
        start_date: startDate || undefined,
        end_date: endDate || undefined
      });
      setReport(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedPatient) fetchReport();
  }, [selectedPatient]);

  const handleExportCSV = async () => {
    if (!selectedPatient) return;
    try {
      const res = await reportAPI.csv(selectedPatient, {
        start_date: startDate || undefined,
        end_date: endDate || undefined
      });
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `paracare_report_${selectedPatient.slice(0, 8)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('CSV Report exported');
    } catch (err) {
      toast.error('Failed to export CSV report');
    }
  };

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    setExportingPDF(true);
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor: '#0f172a' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`paracare_report_${selectedPatient.slice(0, 8)}.pdf`);
      toast.success('PDF Report downloaded successfully');
    } catch (err) {
      toast.error('PDF export failed');
    } finally {
      setExportingPDF(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/50 p-4 border border-slate-700/50 rounded-xl">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Select Patient</label>
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

          <div className="flex items-end pt-5">
            <button
              onClick={fetchReport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-xs font-semibold text-white transition-colors"
            >
              <Filter className="w-3.5 h-3.5" /> Generate
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-300 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" /> CSV
          </button>
          <button
            onClick={handleExportPDF}
            disabled={exportingPDF || !report}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" /> {exportingPDF ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingState message="Generating patient report from PostgreSQL data..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchReport} />
      ) : report ? (
        <div ref={reportRef} className="space-y-6 bg-slate-900/40 p-6 border border-slate-800 rounded-2xl">
          {/* Report Header */}
          <div className="flex items-start justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" /> ParaCare Health & Communication Summary
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Monitoring Period: {report.monitoring_period.start} to {report.monitoring_period.end}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-slate-500">Report Generated At</p>
              <p className="text-xs font-medium text-slate-300">{new Date(report.generated_at).toLocaleString()}</p>
            </div>
          </div>

          {/* Patient Profile Card */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-800/30 p-4 border border-slate-700/40 rounded-xl text-xs">
            <div>
              <span className="text-slate-500 block">Patient Name</span>
              <span className="text-white font-bold text-sm">{report.patient.name}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Patient Code</span>
              <span className="text-cyan-400 font-medium">{report.patient.patient_code}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Age & Gender</span>
              <span className="text-slate-300">{report.patient.age} y/o ({report.patient.gender || 'N/A'})</span>
            </div>
            <div>
              <span className="text-slate-500 block">Room & Condition</span>
              <span className="text-slate-300">Room {report.patient.room_number || 'N/A'} • {report.patient.condition || 'General Monitoring'}</span>
            </div>
          </div>

          {/* Vitals Averages */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Vital Statistics Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-slate-400 font-medium">Heart Rate</span>
                  <Heart className="w-4 h-4 text-rose-400" />
                </div>
                <p className="text-2xl font-bold text-rose-400">{report.vital_statistics.average_heart_rate ?? '--'} <span className="text-xs text-slate-400">bpm (Avg)</span></p>
                <p className="text-[11px] text-slate-500 mt-1">Range: {report.vital_statistics.min_heart_rate ?? '--'} - {report.vital_statistics.max_heart_rate ?? '--'} bpm</p>
              </div>

              <div className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-slate-400 font-medium">SpO2 Oxygen</span>
                  <Droplets className="w-4 h-4 text-cyan-400" />
                </div>
                <p className="text-2xl font-bold text-cyan-400">{report.vital_statistics.average_spo2 ?? '--'} <span className="text-xs text-slate-400">% (Avg)</span></p>
                <p className="text-[11px] text-slate-500 mt-1">Range: {report.vital_statistics.min_spo2 ?? '--'} - {report.vital_statistics.max_spo2 ?? '--'} %</p>
              </div>

              <div className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-slate-400 font-medium">Body Temperature</span>
                  <Thermometer className="w-4 h-4 text-amber-400" />
                </div>
                <p className="text-2xl font-bold text-amber-400">{report.vital_statistics.average_temperature ?? '--'} <span className="text-xs text-slate-400">°C (Avg)</span></p>
                <p className="text-[11px] text-slate-500 mt-1">Range: {report.vital_statistics.min_temperature ?? '--'} - {report.vital_statistics.max_temperature ?? '--'} °C</p>
              </div>
            </div>
          </div>

          {/* Blink Command Communication Report */}
          <div className="bg-slate-800/40 border border-slate-700/50 p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700/50 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Eye className="w-5 h-5 text-cyan-400" /> PATIENT COMMUNICATION REPORT
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Calculated from authoritative database blink records</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-semibold">Total Actionable Requests</span>
                <span className="text-2xl font-black text-cyan-400">
                  {report.blink_commands.total_requests ?? (report.blink_commands.need_water + report.blink_commands.need_food + report.blink_commands.need_medicine + report.blink_commands.emergency)}
                </span>
              </div>
            </div>

            {/* Breakdown Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-900/60 p-3.5 rounded-xl border border-cyan-500/20 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">Water Requests</span>
                  <Droplets className="w-4 h-4 text-cyan-400" />
                </div>
                <p className="text-2xl font-black text-cyan-400 mt-1">{report.blink_commands.need_water}</p>
                <span className="text-[10px] text-slate-500">2 Blinks Pattern</span>
              </div>

              <div className="bg-slate-900/60 p-3.5 rounded-xl border border-amber-500/20 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">Food Requests</span>
                  <span className="text-base">🍽</span>
                </div>
                <p className="text-2xl font-black text-amber-400 mt-1">{report.blink_commands.need_food}</p>
                <span className="text-[10px] text-slate-500">3 Blinks Pattern</span>
              </div>

              <div className="bg-slate-900/60 p-3.5 rounded-xl border border-purple-500/20 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">Medicine Requests</span>
                  <span className="text-base">💊</span>
                </div>
                <p className="text-2xl font-black text-purple-400 mt-1">{report.blink_commands.need_medicine}</p>
                <span className="text-[10px] text-slate-500">4 Blinks (High Priority)</span>
              </div>

              <div className="bg-slate-900/60 p-3.5 rounded-xl border border-red-500/20 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">Emergency Alerts</span>
                  <ShieldCheck className="w-4 h-4 text-red-400" />
                </div>
                <p className="text-2xl font-black text-red-400 mt-1">{report.blink_commands.emergency}</p>
                <span className="text-[10px] text-slate-500">5+ Blinks / Hold ≥3s</span>
              </div>
            </div>

            {/* Sources & Alerts Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="flex items-center justify-between p-3 bg-slate-900/40 rounded-xl border border-slate-700/40 text-xs">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-cyan-400" />
                  <span className="text-slate-300">Live Camera AI Events</span>
                </div>
                <span className="font-bold text-cyan-400">{report.data_sources?.CAMERA ?? 0}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-900/40 rounded-xl border border-slate-700/40 text-xs">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-400" />
                  <span className="text-slate-300">ESP32 Hardware Events</span>
                </div>
                <span className="font-bold text-emerald-400">{report.data_sources?.ESP32 ?? 0}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-900/40 rounded-xl border border-slate-700/40 text-xs">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-amber-400" />
                  <span className="text-slate-300">Simulator Events</span>
                </div>
                <span className="font-bold text-amber-400">{report.data_sources?.SIMULATOR ?? 0}</span>
              </div>
            </div>

            {/* Recent Requests Table inside Report */}
            {report.recent_requests && report.recent_requests.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-slate-700/50">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Recent Patient Requests</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900/60 text-slate-400 text-[10px] uppercase border-b border-slate-700/50">
                      <tr>
                        <th className="py-2 px-3">Date / Time</th>
                        <th className="py-2 px-3">Request</th>
                        <th className="py-2 px-3">Blinks</th>
                        <th className="py-2 px-3">Source</th>
                        <th className="py-2 px-3">Severity</th>
                        <th className="py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {report.recent_requests.slice(0, 10).map((req, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-slate-300">
                            {req.timestamp ? new Date(req.timestamp).toLocaleTimeString() : 'N/A'}
                          </td>
                          <td className="py-2 px-3 font-semibold text-white">
                            {req.command?.replace('_', ' ')}
                          </td>
                          <td className="py-2 px-3 text-cyan-400 font-medium">
                            {req.blink_count} blinks ({req.duration_seconds}s)
                          </td>
                          <td className="py-2 px-3">
                            <span className={`text-[10px] font-bold ${
                              req.source === 'CAMERA' ? 'text-cyan-400' :
                              req.source === 'SIMULATOR' ? 'text-amber-400' : 'text-emerald-400'
                            }`}>
                              {req.source}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <span className={`text-[10px] font-bold ${
                              req.severity === 'CRITICAL' ? 'text-red-400' :
                              req.severity === 'HIGH' ? 'text-purple-400' : 'text-amber-400'
                            }`}>
                              {req.severity}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                              req.alert_status === 'ACKNOWLEDGED' ? 'bg-emerald-500/20 text-emerald-300' :
                              req.alert_status === 'RESOLVED' ? 'bg-cyan-500/20 text-cyan-300' :
                              'bg-amber-500/20 text-amber-300'
                            }`}>
                              {req.alert_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Charts */}
          {report.health_trend && report.health_trend.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl space-y-3">
              <h3 className="text-sm font-semibold text-white">Health Trend Chart</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={report.health_trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="timestamp" tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={(v) => v ? new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''} />
                  <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '11px' }} />
                  <Line type="monotone" dataKey="heart_rate" name="HR" stroke="#f43f5e" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="spo2" name="SpO2" stroke="#06b6d4" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="temperature" name="Temp" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Footer note */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-cyan-400" /> ParaCare IoT Smart Eye-Blink System</span>
            <span>Does not replace clinical diagnoses</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
