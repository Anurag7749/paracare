import { useState, useEffect, useRef } from 'react';
import {
  Eye, Radio, Clock, ShieldAlert, Droplets, UtensilsCrossed, Pill,
  CheckCircle, CheckCircle2, AlertTriangle, Activity, Camera, Cpu,
  Check, Wifi, User
} from 'lucide-react';
import LoadingState from '../components/shared/LoadingState';
import { patientAPI, blinkAPI, alertAPI } from '../services/api';
import { getSocket, joinPatientRoom, leavePatientRoom } from '../services/socket';
import { useCameraMonitoring } from '../contexts/CameraMonitoringContext';
import toast from 'react-hot-toast';

export default function LiveMonitorPage() {
  const {
    cameraActive,
    cameraStatus,
    aiStatus,
    faceDetected,
    eyeState,
    blinkState,
    fsmState,
    windowTimeRemaining,
    blinkCount,
    lastBlinkTimestamp,
    lastPatientRequest,
    currentPatientRequest,
    selectedPatientId,
    setSelectedPatientId,
    patients,
    selectedPatient,
    connStatus
  } = useCameraMonitoring();

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const prevPatientRef = useRef(null);

  // Manage room subscription for selected patient
  useEffect(() => {
    if (!selectedPatientId) return;
    if (prevPatientRef.current && prevPatientRef.current !== selectedPatientId) {
      leavePatientRoom(prevPatientRef.current);
    }
    joinPatientRoom(selectedPatientId);
    prevPatientRef.current = selectedPatientId;

    return () => {
      if (selectedPatientId) leavePatientRoom(selectedPatientId);
    };
  }, [selectedPatientId]);

  // Socket.IO event listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onBlink = (data) => {
      const time = new Date().toLocaleTimeString();
      if (data.command === 'NORMAL_BLINK') {
        addEvent('blink_command', `1 Normal Blink recorded (${data.patient_name || 'Patient'})`);
      } else {
        const cmdName = data.command?.replace('_', ' ');
        addEvent('blink_command', `Patient Request: ${cmdName} (${data.blink_count} blinks, ${data.duration_seconds}s)`);
      }
    };

    const onEmergency = (data) => {
      addEvent('emergency', `🚨 EMERGENCY SOS! Patient: ${data.patient_name || 'Patient'}`);
      toast.error(`🚨 EMERGENCY SOS! Patient ${data.patient_name || 'Monitoring'} requires immediate attention!`, {
        duration: 10000,
        id: 'live-emergency-toast'
      });
    };

    const onAlert = (data) => {
      addEvent('alert', `Alert: ${data.message}`);
    };

    const onAlertAck = (data) => {
      addEvent('success', `Caregiver acknowledged alert #${data.id?.slice(0, 8)}`);
    };

    socket.on('blink_command', onBlink);
    socket.on('emergency_sos', onEmergency);
    socket.on('alert_triggered', onAlert);
    socket.on('alert_acknowledged', onAlertAck);

    return () => {
      socket.off('blink_command', onBlink);
      socket.off('emergency_sos', onEmergency);
      socket.off('alert_triggered', onAlert);
      socket.off('alert_acknowledged', onAlertAck);
    };
  }, []);

  const addEvent = (type, message) => {
    setEvents((prev) => [
      { id: Date.now() + Math.random(), type, message, time: new Date().toLocaleTimeString() },
      ...prev.slice(0, 49)
    ]);
  };

  const eventColors = {
    blink_command: 'text-cyan-400',
    emergency: 'text-red-400 font-bold',
    alert: 'text-amber-400',
    success: 'text-emerald-400'
  };

  const getCommandBadge = (cmd) => {
    switch (cmd) {
      case 'NEED_WATER':
        return { label: 'NEED WATER', color: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/40', icon: Droplets };
      case 'NEED_FOOD':
        return { label: 'NEED FOOD', color: 'text-amber-400 bg-amber-500/20 border-amber-500/40', icon: UtensilsCrossed };
      case 'NEED_MEDICINE':
        return { label: 'NEED MEDICINE', color: 'text-purple-400 bg-purple-500/20 border-purple-500/40', icon: Pill };
      case 'EMERGENCY':
        return { label: 'EMERGENCY SOS', color: 'text-red-400 bg-red-500/30 border-red-500/60 animate-pulse font-black', icon: ShieldAlert };
      default:
        return { label: cmd || 'NORMAL', color: 'text-slate-300 bg-slate-800 border-slate-700', icon: Eye };
    }
  };

  const activePatientName = selectedPatient?.name || (patients.length > 0 ? patients[0].name : 'Patient');
  const activePatientCode = selectedPatient?.patient_code || (patients.length > 0 ? patients[0].patient_code : 'P-001');
  const activePatientRoom = selectedPatient?.room_number || '101';

  return (
    <div className="space-y-6">
      {/* Patient Selector & Live Status Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/70 border border-slate-700/50 rounded-2xl p-5 backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Activity className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">
                Live Patient Communication Monitor
              </h2>
              <span className={`text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                cameraActive
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cameraActive ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
                {cameraActive ? 'MONITORING ACTIVE' : 'CAMERA STANDBY'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time Vision Eye-Blink Communication • 7-Second Decision Engine • Instant SOS Dispatch
            </p>
          </div>
        </div>

        {/* Patient Selection Dropdown */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2">
            <User className="w-4 h-4 text-slate-400" />
            <select
              value={selectedPatientId || ''}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-800 text-white">
                  {p.name} ({p.patient_code}) — Rm {p.room_number || 'N/A'}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Real-time Status Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Monitoring Status */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 shadow-md space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Patient Monitoring</span>
            <Radio className={`w-4 h-4 ${cameraActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
          </div>
          <p className={`text-base font-extrabold ${cameraActive ? 'text-emerald-400' : 'text-slate-400'}`}>
            {cameraActive ? (faceDetected ? '● PATIENT ACTIVE' : '⚠️ SEARCHING FACE') : 'OFFLINE'}
          </p>
          <span className="text-[11px] text-slate-500 block">
            Camera Source: <strong className="text-cyan-400">LIVE CAMERA</strong>
          </span>
        </div>

        {/* 2. Communication State */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 shadow-md space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Current Cycle State</span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <p className={`text-base font-extrabold ${
            fsmState === 'OBSERVING' ? 'text-amber-400 animate-pulse' :
            fsmState === 'EMERGENCY_DETECTED' ? 'text-red-400 animate-pulse' :
            fsmState === 'DISPATCHED' ? 'text-emerald-400' : 'text-slate-300'
          }`}>
            {fsmState === 'OBSERVING' ? `OBSERVING (${windowTimeRemaining}s)` :
             fsmState === 'EMERGENCY_DETECTED' ? '🚨 EMERGENCY SOS' :
             fsmState === 'DISPATCHING' ? 'DISPATCHING...' :
             fsmState === 'DISPATCHED' ? '✅ SENT TO CAREGIVER' : 'WAITING FOR PATIENT'}
          </p>
          <span className="text-[11px] text-slate-500 block">
            Eye Status: <strong className={eyeState === 'CLOSED' ? 'text-red-400' : 'text-emerald-400'}>{eyeState}</strong> ({blinkState})
          </span>
        </div>

        {/* 3. Blink Count in Window */}
        <div className={`rounded-xl p-4 shadow-md space-y-1 border transition-all ${
          blinkCount >= 5 ? 'bg-red-500/20 border-red-500/60' : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Latest Blink Count</span>
            <Eye className="w-4 h-4 text-cyan-400" />
          </div>
          <p className={`text-2xl font-black ${blinkCount >= 5 ? 'text-red-400 animate-pulse' : 'text-cyan-400'}`}>
            {blinkCount} {blinkCount === 1 ? 'Blink' : 'Blinks'}
          </p>
          <span className="text-[11px] text-slate-500 block">
            Last Blink: {lastBlinkTimestamp}
          </span>
        </div>

        {/* 4. Connectivity Health */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 shadow-md space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[10px]">System Pipeline</span>
            <Wifi className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-sm font-bold text-white flex items-center gap-1.5 mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Backend: {connStatus.backend ? 'CONNECTED' : 'OFFLINE'}
          </p>
          <span className="text-[11px] text-slate-500 block">
            Socket.IO: <strong className={connStatus.socket ? 'text-emerald-400' : 'text-amber-400'}>{connStatus.socket ? 'CONNECTED' : 'CONNECTING'}</strong>
          </span>
        </div>
      </div>

      {/* Main Monitoring Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Communication & 7-Second Window State (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Active Intent / 7-Second Communication Card */}
          <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  CURRENT PATIENT COMMUNICATION
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Patient: <strong className="text-white">{activePatientName}</strong> ({activePatientCode}) • Room {activePatientRoom}
                </p>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase border ${
                fsmState === 'OBSERVING'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                  : fsmState === 'EMERGENCY_DETECTED' || blinkCount >= 5
                  ? 'bg-red-500/30 text-red-300 border-red-500 animate-pulse'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                {fsmState === 'OBSERVING' ? `WINDOW ACTIVE (${windowTimeRemaining}s)` :
                 blinkCount >= 5 ? '🚨 EMERGENCY' : 'IDLE'}
              </span>
            </div>

            {/* Live Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-medium">Communication Window (7 Seconds):</span>
                <span className="font-mono font-bold text-white">
                  {fsmState === 'OBSERVING' ? `${windowTimeRemaining}s Remaining` : '7.0s Window Ready'}
                </span>
              </div>
              <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
                <div
                  className={`h-full rounded-full transition-all duration-100 ${
                    blinkCount >= 5 ? 'bg-red-500' : 'bg-gradient-to-r from-cyan-400 to-amber-500'
                  }`}
                  style={{
                    width: fsmState === 'OBSERVING'
                      ? `${(windowTimeRemaining / 7.0) * 100}%`
                      : blinkCount >= 5 ? '100%' : '0%',
                  }}
                />
              </div>
            </div>

            {/* Current Real-Time Interpreted Command */}
            <div className={`p-4 rounded-xl border flex items-center justify-between ${
              blinkCount >= 5 || fsmState === 'EMERGENCY_DETECTED'
                ? 'bg-red-500/20 border-red-500 text-red-200'
                : blinkCount === 2
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                : blinkCount === 3
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                : blinkCount === 4
                ? 'bg-purple-500/15 border-purple-500/40 text-purple-200'
                : blinkCount === 1
                ? 'bg-slate-800/60 border-slate-700 text-slate-300'
                : 'bg-slate-800/40 border-slate-800 text-slate-400'
            }`}>
              <div className="flex items-center gap-3">
                {blinkCount >= 5 ? <ShieldAlert className="w-8 h-8 text-red-400 animate-pulse" /> :
                 blinkCount === 2 ? <Droplets className="w-8 h-8 text-cyan-400" /> :
                 blinkCount === 3 ? <UtensilsCrossed className="w-8 h-8 text-amber-400" /> :
                 blinkCount === 4 ? <Pill className="w-8 h-8 text-purple-400" /> :
                 <Eye className="w-8 h-8 text-slate-400" />}
                <div>
                  <p className="text-xs uppercase font-bold tracking-wider opacity-80">Interpreted Intent</p>
                  <p className="text-lg font-black mt-0.5">
                    {blinkCount >= 5 ? 'EMERGENCY SOS (Immediate Dispatch)' :
                     blinkCount === 4 ? 'NEED MEDICINE' :
                     blinkCount === 3 ? 'NEED FOOD' :
                     blinkCount === 2 ? 'NEED WATER' :
                     blinkCount === 1 ? '1 Blink (Normal / In Window)' :
                     'Waiting for patient blink...'}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider block font-semibold">Blinks Detected</span>
                <span className="text-2xl font-black font-mono">{blinkCount}</span>
              </div>
            </div>
          </div>

          {/* LATEST CONFIRMED REQUEST CARD */}
          <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                LATEST SENT PATIENT REQUEST
              </h3>
              {lastPatientRequest && (
                <span className="text-xs font-mono text-slate-400">
                  {lastPatientRequest.timestamp}
                </span>
              )}
            </div>

            {lastPatientRequest ? (
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-3.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs">Requirement:</span>
                  <span className={`font-black text-base ${
                    lastPatientRequest.command === 'EMERGENCY' ? 'text-red-400' : 'text-cyan-400'
                  }`}>
                    {lastPatientRequest.command?.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Blink Pattern:</span>
                  <span className="font-bold text-white">
                    {lastPatientRequest.blink_count} Valid Blinks ({lastPatientRequest.duration_seconds}s)
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Detected Time:</span>
                  <span className="text-slate-300 font-medium">{lastPatientRequest.timestamp}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Severity:</span>
                  <span className={`font-bold ${
                    lastPatientRequest.severity === 'CRITICAL' ? 'text-red-400' :
                    lastPatientRequest.severity === 'HIGH' ? 'text-purple-400' : 'text-amber-400'
                  }`}>
                    {lastPatientRequest.severity || 'MEDIUM'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Source:</span>
                  <span className="text-cyan-400 font-semibold">{lastPatientRequest.source || 'LIVE CAMERA'}</span>
                </div>
                <div className="flex justify-between items-center pt-2.5 border-t border-slate-700/50">
                  <span className="text-slate-400">Delivery Status:</span>
                  <span className={`font-bold text-xs flex items-center gap-1.5 ${
                    lastPatientRequest.status === 'ACKNOWLEDGED' ? 'text-emerald-300' : 'text-cyan-400'
                  }`}>
                    <Check className="w-4 h-4" /> {lastPatientRequest.status || 'SENT TO CAREGIVER'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500 text-xs">
                <Eye className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                <p>No patient requests sent yet in this session.</p>
                <p className="text-[11px] text-slate-600 mt-0.5">Enable Camera Blink AI to begin continuous monitoring.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Event Feed & Future IoT Hardware Card (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Real-time Socket.IO Event Feed */}
          <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                REAL-TIME EVENT STREAM
              </h3>
              <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                SOCKET.IO LIVE
              </span>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {events.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-10">
                  Waiting for live communication events...
                </p>
              ) : (
                events.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-2.5 rounded-xl border border-slate-800/80 bg-slate-800/40 text-xs flex items-start gap-2"
                  >
                    <span className="text-slate-500 text-[10px] font-mono flex-shrink-0 mt-0.5">{evt.time}</span>
                    <span className={`leading-tight ${eventColors[evt.type] || 'text-slate-300'}`}>
                      {evt.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Future IoT Hardware Sensor Integration Card */}
          <div className="bg-slate-900/50 border border-indigo-950/80 rounded-2xl p-5 space-y-2.5 shadow-xl text-xs">
            <div className="flex items-center gap-2 text-indigo-400 font-bold border-b border-slate-800 pb-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <span>FUTURE IOT SMART SPECTACLES INTEGRATION</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              The camera currently provides sensing for patient eye gestures. When the physical smart glasses (ESP32) are connected, hardware sensor data (IR eye tracking, vitals) will seamlessly feed into this exact pipeline.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[10px]">
              <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                <span className="text-slate-500 block">CURRENT SENSOR</span>
                <span className="text-cyan-400 font-semibold">Webcam (Browser API)</span>
              </div>
              <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                <span className="text-slate-500 block">HARDWARE READY</span>
                <span className="text-indigo-400 font-semibold">ESP32 Smart Glasses</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
