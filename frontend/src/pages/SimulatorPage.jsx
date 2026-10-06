import { useState, useEffect, useCallback } from 'react';
import { Eye, Droplets, UtensilsCrossed, Pill, AlertTriangle, Loader2, Cpu, Timer, CheckCircle2 } from 'lucide-react';
import { simulatorAPI } from '../services/api';
import toast from 'react-hot-toast';

const COMMANDS = [
  { key: '1', blinks: 1, label: '1 BLINK — NORMAL', command: 'NORMAL_BLINK', duration: 0.3, color: 'from-slate-600 to-slate-700', icon: Eye, desc: 'Normal Blink (Ignore / Logged)' },
  { key: '2', blinks: 2, label: '2 BLINKS — WATER', command: 'NEED_WATER', duration: 1.5, color: 'from-cyan-600 to-cyan-700', icon: Droplets, desc: 'Need Water (Caregiver Request)' },
  { key: '3', blinks: 3, label: '3 BLINKS — FOOD', command: 'NEED_FOOD', duration: 2.2, color: 'from-amber-600 to-amber-700', icon: UtensilsCrossed, desc: 'Need Food (Caregiver Request)' },
  { key: '4', blinks: 4, label: '4 BLINKS — MEDICINE', command: 'NEED_MEDICINE', duration: 3.0, color: 'from-purple-600 to-purple-700', icon: Pill, desc: 'Need Medicine (High Priority)' },
  { key: '5', blinks: 5, label: '5 BLINKS — EMERGENCY', command: 'EMERGENCY', duration: 3.5, color: 'from-red-600 to-red-700', icon: AlertTriangle, desc: 'Emergency SOS (5 Blinks Trigger)' },
  { key: '6', blinks: 6, label: '6 BLINKS — EMERGENCY', command: 'EMERGENCY', duration: 4.0, color: 'from-rose-600 to-rose-700', icon: AlertTriangle, desc: 'Emergency SOS (6 Blinks)' },
  { key: '0', blinks: 10, label: '10 BLINKS — EMERGENCY', command: 'EMERGENCY', duration: 5.5, color: 'from-red-700 to-red-900', icon: AlertTriangle, desc: 'Emergency SOS (10 Rapid Blinks)' },
  { key: 'e', blinks: 1, label: 'HOLD ≥3s — EMERGENCY', command: 'EMERGENCY', duration: 3.5, color: 'from-red-800 to-rose-900', icon: AlertTriangle, desc: 'Emergency SOS (Continuous Closure)' },
];

export default function SimulatorPage() {
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [countdown, setCountdown] = useState(null);

  const sendBlink = useCallback(async (cmd) => {
    if (processing) return;
    setProcessing(true);
    setCountdown(cmd.duration);
    setResult(null);

    const timer = setInterval(() => setCountdown((p) => p !== null && p > 0.1 ? +(p - 0.1).toFixed(1) : null), 100);

    try {
      const res = await simulatorAPI.blink({
        command: cmd.command,
        blink_count: cmd.blinks,
        blink_duration: cmd.duration,
      });
      clearInterval(timer);
      setCountdown(null);
      setResult(res.data.data);
      setHistory((prev) => [{ ...res.data.data, label: cmd.label, time: new Date().toLocaleTimeString(), command: cmd.command }, ...prev.slice(0, 19)]);
      if (cmd.command === 'EMERGENCY') toast.error('🚨 Emergency SOS sent!');
      else if (cmd.command !== 'NORMAL_BLINK') toast.success(`${cmd.desc} sent`);
    } catch (err) {
      clearInterval(timer);
      setCountdown(null);
      toast.error(err.response?.data?.message || 'Simulation failed');
    } finally {
      setProcessing(false);
    }
  }, [processing]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const cmd = COMMANDS.find((c) => c.key === e.key.toLowerCase());
      if (cmd) sendBlink(cmd);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sendBlink]);

  return (
    <div className="space-y-6">
      {/* Demo Banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
        <Cpu className="w-5 h-5 text-amber-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-400">DEMO / SIMULATION MODE</p>
          <p className="text-xs text-slate-400 mt-0.5">Simulated data — NOT real medical measurements. Source: SIMULATOR</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Blink Buttons */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-sm font-semibold text-white">Simulator Controls</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COMMANDS.map((cmd) => (
              <button
                key={cmd.key}
                onClick={() => sendBlink(cmd)}
                disabled={processing}
                className={`relative bg-gradient-to-r ${cmd.color} hover:brightness-110 disabled:opacity-50 rounded-xl p-5 text-left transition-all active:scale-[0.98] border border-white/10`}
              >
                <div className="flex items-center gap-3">
                  <cmd.icon className="w-8 h-8 text-white/80" />
                  <div>
                    <p className="text-sm font-bold text-white">{cmd.label}</p>
                    <p className="text-xs text-white/60 mt-0.5">{cmd.desc} • Key: {cmd.key.toUpperCase()}</p>
                  </div>
                </div>
                <span className="absolute top-3 right-3 text-xs bg-black/20 px-2 py-0.5 rounded text-white/60">{cmd.blinks} blink{cmd.blinks > 1 ? 's' : ''} • {cmd.duration}s</span>
              </button>
            ))}
          </div>

          {/* Timer / Status */}
          {countdown !== null && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 text-center">
              <Timer className="w-8 h-8 text-cyan-400 mx-auto mb-2 animate-pulse" />
              <p className="text-3xl font-bold text-white">{countdown}s</p>
              <p className="text-xs text-slate-400 mt-1">Processing blink sequence...</p>
            </div>
          )}

          {processing && countdown === null && (
            <div className="flex items-center justify-center gap-2 py-4 text-cyan-400">
              <Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Sending to backend...</span>
            </div>
          )}

          {/* API Response */}
          {result && (
            <div className="bg-slate-900/50 border border-emerald-500/30 rounded-xl p-5">
              <h4 className="text-sm font-semibold text-emerald-400 flex items-center gap-2 mb-3"><CheckCircle2 className="w-4 h-4" /> API Response</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-slate-500">Command:</span> <span className="text-white font-medium">{result.command_processed}</span></div>
                <div><span className="text-slate-500">Device:</span> <span className="text-white">{result.device_id}</span></div>
                <div><span className="text-slate-500">Reading ID:</span> <span className="text-slate-400">{result.health_reading_id?.slice(0, 8)}...</span></div>
                <div><span className="text-slate-500">Alert ID:</span> <span className="text-slate-400">{result.alert_id?.slice(0, 8) || 'None'}...</span></div>
                <div><span className="text-slate-500">Source:</span> <span className="text-amber-400">SIMULATOR</span></div>
                <div><span className="text-slate-500">Demo:</span> <span className="text-amber-400">{result.demo_mode ? 'Yes' : 'No'}</span></div>
              </div>
            </div>
          )}
        </div>

        {/* History */}
        <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5 max-h-[600px] overflow-y-auto">
          <h3 className="text-sm font-semibold text-white mb-3">Simulation History</h3>
          {history.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-12">No simulations yet.<br/>Press 1-4 or E to begin.</p>
          ) : (
            <div className="space-y-2">
              {history.map((h, i) => (
                <div key={i} className="bg-slate-800/30 rounded-lg p-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-white">{h.command?.replace('_', ' ')}</span>
                    <span className="text-slate-500">{h.time}</span>
                  </div>
                  <p className="text-slate-400 mt-1">Alert: {h.alert_id ? '✅' : '—'} | Source: <span className="text-amber-400">SIMULATOR</span></p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
