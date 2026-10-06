import { useState, useEffect, useRef } from 'react';
import {
  Camera, CameraOff, Eye, AlertTriangle, Droplets, UtensilsCrossed, Pill,
  CheckCircle2, RefreshCw, Volume2, VolumeX, ShieldAlert, Sparkles, User,
  Activity, Info, Bug, Gauge, Check, Radio, Clock, RotateCcw, CheckCircle
} from 'lucide-react';
import { useCameraMonitoring } from '../contexts/CameraMonitoringContext';
import { alertAPI } from '../services/api';
import toast from 'react-hot-toast';

const COMMAND_SPECS = {
  1: { command: 'NORMAL_BLINK', label: '1 Blink — Normal (Status Logged)', desc: 'No Request / Normal Eye Movement', color: 'border-slate-500 text-slate-400 bg-slate-800/40', icon: Eye },
  2: { command: 'NEED_WATER', label: '2 Blinks — NEED WATER', desc: 'Caregiver Request (Medium Priority)', color: 'border-cyan-500 text-cyan-400 bg-cyan-500/10', icon: Droplets },
  3: { command: 'NEED_FOOD', label: '3 Blinks — NEED FOOD', desc: 'Caregiver Request (Medium Priority)', color: 'border-amber-500 text-amber-400 bg-amber-500/10', icon: UtensilsCrossed },
  4: { command: 'NEED_MEDICINE', label: '4 Blinks — NEED MEDICINE', desc: 'Caregiver Request (High Priority)', color: 'border-purple-500 text-purple-400 bg-purple-500/10', icon: Pill },
  5: { command: 'EMERGENCY', label: '5+ Blinks — EMERGENCY SOS', desc: 'Critical Immediate Alert (Instant Dispatch)', color: 'border-red-500 text-red-400 bg-red-500/20 animate-pulse', icon: ShieldAlert },
};

export default function CameraDetectionPage() {
  const {
    patients,
    selectedPatientId,
    setSelectedPatientId,
    cameraActive,
    cameraStatus,
    aiStatus,
    cameraError,
    faceDetected,
    multipleFacesDetected,
    audioEnabled,
    setAudioEnabled,
    frameCount,
    currentEAR,
    openBaselineEAR,
    earThresholdClosed,
    earThresholdOpen,
    sensitivityMode,
    handleSensitivityChange,
    eyeState,
    blinkState,
    fsmState,
    windowTimeRemaining,
    blinkCount,
    totalValidBlinks,
    lastBlinkTimestamp,
    currentPatientRequest,
    lastPatientRequest,
    recentRequests,
    activityFeed,
    apiRetryStatus,
    connStatus,
    startCamera,
    stopCamera,
    retryCamera,
    resetToIdle,
    dispatchBlinkCommand,
    loadRecentRequests,
    masterCanvasRef,
    masterVideoRef,
  } = useCameraMonitoring();

  const [showDeveloperMode, setShowDeveloperMode] = useState(false);
  const visibleCanvasRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Sync master canvas rendering to visible canvas on the page
  useEffect(() => {
    let active = true;

    const renderLoop = () => {
      if (!active) return;

      const visibleCanvas = visibleCanvasRef.current;
      const masterCanvas = masterCanvasRef.current;

      if (visibleCanvas && masterCanvas && cameraActive) {
        const ctx = visibleCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(masterCanvas, 0, 0, visibleCanvas.width, visibleCanvas.height);
        }
      }

      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      active = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [cameraActive, masterCanvasRef]);

  // Handle Caregiver Acknowledgment of an alert
  const handleAcknowledgeAlert = async (alertId) => {
    if (!alertId) return;
    try {
      await alertAPI.acknowledge(alertId, { notes: 'Acknowledged via Camera Monitor UI' });
      toast.success('Patient request acknowledged');
      loadRecentRequests(selectedPatientId);
    } catch (err) {
      toast.error('Failed to acknowledge request');
    }
  };

  // ── Current Patient Request State Presenter ───────────────────────────────
  const getLiveIntentCard = () => {
    if (fsmState === 'EMERGENCY_DETECTED' || blinkCount >= 5) {
      return {
        badge: '🚨 CRITICAL IMMEDIATE ALERT',
        title: '🚨 EMERGENCY SOS DETECTED',
        desc: '5+ valid blinks or hold detected! Emergency request automatically dispatched to backend and caregiver.',
        color: 'border-red-500 bg-red-500/20 text-red-300 ring-2 ring-red-500/50 animate-pulse',
        icon: ShieldAlert,
        status: 'DISPATCHING EMERGENCY'
      };
    }
    if (fsmState === 'DISPATCHING') {
      return {
        badge: 'TRANSMITTING REQUEST',
        title: 'TRANSMITTING PATIENT REQUEST...',
        desc: 'Contacting Flask backend & storing in PostgreSQL database...',
        color: 'border-purple-500 bg-purple-500/20 text-purple-300 animate-pulse',
        icon: Activity,
        status: 'SENDING TO SERVER'
      };
    }
    if (fsmState === 'DISPATCHED') {
      return {
        badge: 'REQUEST SENT & CONFIRMED',
        title: `✅ ${lastPatientRequest?.command?.replace('_', ' ') || 'PATIENT REQUEST'} DELIVERED`,
        desc: 'Stored in PostgreSQL database and delivered to caregiver dashboard in real-time.',
        color: 'border-emerald-500 bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/50',
        icon: CheckCircle2,
        status: 'REQUEST SENT'
      };
    }
    if (fsmState === 'FAILED') {
      return {
        badge: 'TRANSMISSION FAILED',
        title: '❌ REQUEST FAILED',
        desc: 'Unable to reach backend server. Retrying automatically...',
        color: 'border-red-500/80 bg-red-950/40 text-red-400',
        icon: AlertTriangle,
        status: 'REQUEST FAILED'
      };
    }
    if (fsmState === 'OBSERVING') {
      switch (blinkCount) {
        case 1:
          return {
            badge: 'PATIENT COMMUNICATING',
            title: '👁️ 1 BLINK DETECTED',
            desc: `First blink initiated the 7-second communication window (${windowTimeRemaining}s remaining). Blink again for Water (2), Food (3), Medicine (4), SOS (5+)...`,
            color: 'border-cyan-500/60 bg-cyan-950/30 text-cyan-300 ring-1 ring-cyan-500/40',
            icon: Eye,
            status: `WINDOW ACTIVE (${windowTimeRemaining}s)`
          };
        case 2:
          return {
            badge: 'PATIENT COMMUNICATING',
            title: '💧 NEED WATER DETECTED',
            desc: `2 blinks detected! Finalizing request in ${windowTimeRemaining}s (or blink more for Food / Medicine / SOS)...`,
            color: 'border-cyan-500 bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/50',
            icon: Droplets,
            status: `RESOLVING IN ${windowTimeRemaining}s`
          };
        case 3:
          return {
            badge: 'PATIENT COMMUNICATING',
            title: '🍽 NEED FOOD DETECTED',
            desc: `3 blinks detected! Finalizing request in ${windowTimeRemaining}s (or blink more for Medicine / SOS)...`,
            color: 'border-amber-500 bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/50',
            icon: UtensilsCrossed,
            status: `RESOLVING IN ${windowTimeRemaining}s`
          };
        case 4:
          return {
            badge: 'PATIENT COMMUNICATING',
            title: '💊 NEED MEDICINE DETECTED',
            desc: `4 blinks detected (High Priority)! Finalizing request in ${windowTimeRemaining}s (or blink 5th for Immediate SOS)...`,
            color: 'border-purple-500 bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/50',
            icon: Pill,
            status: `RESOLVING IN ${windowTimeRemaining}s`
          };
        default:
          return {
            badge: `${blinkCount} BLINKS DETECTED`,
            title: 'ACCUMULATING BLINKS',
            desc: `${windowTimeRemaining}s remaining in active communication window`,
            color: 'border-cyan-500 bg-slate-800 text-cyan-400',
            icon: Activity,
            status: 'OBSERVING'
          };
      }
    }
    return {
      badge: 'MONITORING IDLE',
      title: 'Waiting for patient...',
      desc: 'System is continuously monitoring. 1st blink will automatically initiate the 7-second communication window.',
      color: 'border-slate-800 bg-slate-900/60 text-slate-400',
      icon: Radio,
      status: 'WAITING FOR PATIENT'
    };
  };

  const liveIntent = getLiveIntentCard();
  const isBlinkMonitoringActive = cameraActive && aiStatus === 'READY' && faceDetected;

  return (
    <div className="space-y-6">
      {/* Top Header & Patient Selection */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/70 border border-slate-700/50 rounded-2xl p-5 backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Radio className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">
                Live Camera Blink AI Monitor
              </h2>
              <span className="text-[10px] uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                GLOBAL BACKGROUND MONITORING
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Continuous Hands-Free Patient Vision Sensing • Adaptive 468-Landmark EAR • 7-Second Rule
            </p>
          </div>
        </div>

        {/* Patient Dropdown & Sound Toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2">
            <User className="w-4 h-4 text-slate-400" />
            <select
              value={selectedPatientId}
              onChange={(e) => {
                setSelectedPatientId(e.target.value);
                loadRecentRequests(e.target.value);
              }}
              className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-800 text-white">
                  {p.name} ({p.patient_code})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={`p-2.5 rounded-xl border transition-colors ${
              audioEnabled ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}
            title={audioEnabled ? 'Sound On' : 'Sound Off'}
          >
            {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Real Status Indicators Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Camera Feed */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs shadow-md">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-300 font-medium">Camera Feed</span>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            cameraStatus === 'LIVE' ? 'bg-emerald-500/20 text-emerald-400' :
            cameraStatus === 'STARTING' ? 'bg-amber-500/20 text-amber-400 animate-pulse' :
            cameraStatus === 'ERROR' ? 'bg-red-500/20 text-red-400' :
            'bg-slate-800 text-slate-500'
          }`}>
            {cameraStatus === 'LIVE' ? '● LIVE' : cameraStatus}
          </span>
        </div>

        {/* MediaPipe AI */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs shadow-md">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span className="text-slate-300 font-medium">MediaPipe AI</span>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            aiStatus === 'READY' ? 'bg-emerald-500/20 text-emerald-400' :
            aiStatus === 'LOADING' ? 'bg-blue-500/20 text-blue-400 animate-pulse' :
            aiStatus === 'ERROR' ? 'bg-red-500/20 text-red-400' :
            'bg-slate-800 text-slate-500'
          }`}>
            {aiStatus === 'READY' ? '● READY' : aiStatus}
          </span>
        </div>

        {/* Face Detection */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs shadow-md">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-400" />
            <span className="text-slate-300 font-medium">Face Detection</span>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            faceDetected ? 'bg-emerald-500/20 text-emerald-400' :
            cameraActive ? 'bg-amber-500/20 text-amber-400 animate-pulse' :
            'bg-slate-800 text-slate-500'
          }`}>
            {faceDetected ? '● ACTIVE' : cameraActive ? 'SEARCHING' : 'NO FACE'}
          </span>
        </div>

        {/* Blink Monitor */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs shadow-md">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-300 font-medium">Blink Monitor</span>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            isBlinkMonitoringActive ? 'bg-emerald-500/20 text-emerald-400 font-black' :
            'bg-slate-800 text-slate-500'
          }`}>
            {isBlinkMonitoringActive ? '● ACTIVE' : 'INACTIVE'}
          </span>
        </div>
      </div>

      {/* Main Section: Camera Viewport vs 7-Second Window & Current Request */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Camera Viewport (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="relative bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl aspect-[4/3] flex items-center justify-center">
            <canvas
              ref={visibleCanvasRef}
              width="640"
              height="480"
              className="w-full h-full object-cover"
            />

            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/95 z-10">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4 text-slate-400 shadow-inner">
                  <CameraOff className="w-8 h-8" />
                </div>
                <h3 className="text-base font-semibold text-white">Patient Blink Monitor is Inactive</h3>
                <p className="text-xs text-slate-400 max-w-sm mt-1 mb-5">
                  Start camera to begin fully automatic real-time eye blink recognition. Monitoring will remain active even when you navigate to other pages.
                </p>
                <button
                  onClick={startCamera}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-cyan-500/25 transition-all active:scale-95 cursor-pointer"
                >
                  <Camera className="w-4 h-4" /> Enable Camera Blink AI
                </button>
              </div>
            )}

            {cameraActive && (
              <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end pointer-events-none">
                <span className="flex items-center gap-1.5 bg-black/70 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  LIVE CAMERA
                </span>
                <span className="bg-black/70 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-medium text-slate-300 font-mono">
                  Frames: {frameCount}
                </span>
              </div>
            )}

            {cameraError && (
              <div className="absolute bottom-4 left-4 right-4 bg-red-950/90 border border-red-500/60 text-white text-xs p-3.5 rounded-xl backdrop-blur-sm flex items-center justify-between gap-3 shadow-xl">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <span className="text-slate-200">{cameraError}</span>
                </div>
                <button
                  onClick={retryCamera}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold whitespace-nowrap transition-colors"
                >
                  Retry Camera
                </button>
              </div>
            )}
          </div>

          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2">
              {cameraActive ? (
                <button
                  onClick={stopCamera}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  <CameraOff className="w-3.5 h-3.5" /> Pause Camera
                </button>
              ) : (
                <button
                  onClick={startCamera}
                  className="flex items-center gap-1.5 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-xs font-bold transition-colors shadow-md cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" /> Start Camera
                </button>
              )}

              <button
                onClick={retryCamera}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                title="Restart camera stream and reinitialize AI model"
              >
                <RotateCcw className="w-3.5 h-3.5 text-cyan-400" /> Retry AI
              </button>

              <button
                onClick={resetToIdle}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                title="Reset 7-second observation cycle immediately"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reset Window
              </button>
            </div>

            {/* Sensitivity Selector */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 text-[11px] font-semibold flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" /> Sensitivity:
              </span>
              <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                {['AUTO', 'HIGH', 'BALANCED', 'LOW'].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => handleSensitivityChange(mode)}
                    className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                      sensitivityMode === mode
                        ? 'bg-cyan-500 text-slate-950 shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: CURRENT PATIENT REQUEST & 7-SECOND COMMUNICATION WINDOW (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* 1. CURRENT PATIENT REQUEST */}
          <div className={`p-5 rounded-2xl border transition-all shadow-xl ${liveIntent.color}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded bg-white/10">
                {liveIntent.badge}
              </span>
              <span className="text-[10px] font-mono font-bold">
                {liveIntent.status}
              </span>
            </div>
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <liveIntent.icon className="w-5 h-5 flex-shrink-0" />
              {liveIntent.title}
            </h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              {liveIntent.desc}
            </p>
            {apiRetryStatus && (
              <p className="text-xs font-bold text-amber-300 mt-2 bg-amber-500/20 p-2 rounded-lg border border-amber-500/40">
                {apiRetryStatus}
              </p>
            )}
          </div>

          {/* 2. 7-SECOND COMMUNICATION WINDOW ENGINE */}
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                7-Second Communication Window
              </h3>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                fsmState === 'OBSERVING'
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse'
                  : fsmState === 'EMERGENCY_DETECTED'
                  ? 'bg-red-500/30 text-red-300 border-red-500 animate-pulse font-extrabold'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                {fsmState === 'OBSERVING'
                  ? `ACCUMULATING (${windowTimeRemaining}s)`
                  : fsmState === 'EMERGENCY_DETECTED'
                  ? '🚨 EMERGENCY SOS'
                  : fsmState === 'DISPATCHING'
                  ? 'DISPATCHING...'
                  : 'READY'}
              </span>
            </div>

            {/* Countdown Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Time Remaining in Window:</span>
                <span className="font-mono font-bold text-white">
                  {fsmState === 'OBSERVING' ? `${windowTimeRemaining}s` : '7.0s'}
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
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

            {/* Blinks in Window & Eye State */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className={`rounded-xl p-3.5 border text-center transition-all ${
                blinkCount >= 5
                  ? 'bg-red-500/20 border-red-500/60 shadow-lg shadow-red-500/20'
                  : 'bg-slate-800/60 border-slate-700/60'
              }`}>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Blinks in Window</p>
                <p className={`text-4xl font-black mt-1 ${blinkCount >= 5 ? 'text-red-400 animate-pulse' : 'text-cyan-400'}`}>
                  {blinkCount}
                </p>
              </div>
              <div className="bg-slate-800/60 rounded-xl p-3.5 border border-slate-700/60 text-center">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Eye State / Blink</p>
                <p
                  className={`text-base font-extrabold mt-1.5 ${
                    eyeState === 'CLOSED' ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  {eyeState}
                </p>
                <span className="text-[10px] text-slate-400 font-mono">
                  State: {blinkState}
                </span>
              </div>
            </div>

            {/* Command Resolution Map */}
            <div className="space-y-1.5 pt-2">
              <p className="text-xs font-semibold text-slate-300">Command Resolution Map:</p>
              {[1, 2, 3, 4, 5].map((count) => {
                const spec = COMMAND_SPECS[count];
                const isCurrentTarget = (count === 5 && blinkCount >= 5) || (blinkCount === count);
                return (
                  <div
                    key={count}
                    className={`flex items-center justify-between p-2 rounded-xl border text-xs transition-all ${
                      isCurrentTarget
                        ? spec.color + ' ring-1 ring-white/20 shadow-md font-bold'
                        : 'border-slate-800/80 bg-slate-900/30 text-slate-500 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <spec.icon className="w-4 h-4 flex-shrink-0" />
                      <div>
                        <p className="font-bold text-white text-[11px]">{spec.label}</p>
                        <p className="text-[10px] text-slate-400">{spec.desc}</p>
                      </div>
                    </div>
                    {isCurrentTarget && (
                      <span className="text-[9px] font-bold uppercase bg-white/10 px-2 py-0.5 rounded">
                        {count === 5 ? '🚨 ACTIVE SOS' : 'TARGET'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* LATEST PATIENT REQUEST & RECENT REQUESTS & LIVE ACTIVITY FEED */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 1. LATEST PATIENT REQUEST (4 Cols) */}
        <div className="lg:col-span-4 bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              LATEST PATIENT REQUEST
            </h3>
            {lastPatientRequest && (
              <span className="text-[10px] text-slate-400 font-mono">
                {lastPatientRequest.timestamp}
              </span>
            )}
          </div>

          {lastPatientRequest ? (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Requirement:</span>
                <span className={`font-extrabold text-sm ${
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
                <span className="text-slate-400">Detected:</span>
                <span className="text-slate-300 font-medium">{lastPatientRequest.timestamp}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Severity:</span>
                <span className={`font-bold ${
                  lastPatientRequest.severity === 'CRITICAL' ? 'text-red-400' :
                  lastPatientRequest.severity === 'HIGH' ? 'text-purple-400' : 'text-amber-400'
                }`}>
                  {lastPatientRequest.severity}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Source:</span>
                <span className="text-cyan-400 font-semibold">{lastPatientRequest.source || 'LIVE CAMERA'}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-700/50">
                <span className="text-slate-400">Status:</span>
                <span className={`font-semibold text-[11px] flex items-center gap-1 ${
                  lastPatientRequest.status === 'ACKNOWLEDGED' ? 'text-emerald-300' : 'text-cyan-400'
                }`}>
                  <Check className="w-3.5 h-3.5" /> {lastPatientRequest.status || 'DELIVERED'}
                </span>
              </div>
              {lastPatientRequest.alert_id && (
                <p className="text-[10px] text-slate-500 font-mono">
                  Alert ID: #{lastPatientRequest.alert_id.slice(0, 8)}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center py-10">
              No patient request detected yet.
            </p>
          )}
        </div>

        {/* 2. RECENT PATIENT REQUESTS (4 Cols) */}
        <div className="lg:col-span-4 bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Eye className="w-4 h-4 text-cyan-400" />
              RECENT PATIENT REQUESTS
            </h3>
            <span className="text-[10px] text-slate-400">From Database</span>
          </div>

          {recentRequests.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-10">
              No recent requests recorded in the database.
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {recentRequests.slice(0, 6).map((req, i) => (
                <div
                  key={req.id || i}
                  className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                    req.command === 'EMERGENCY'
                      ? 'bg-red-500/10 border-red-500/30 text-red-300'
                      : 'bg-slate-800/40 border-slate-700/50 text-slate-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold">
                        {req.command === 'NEED_WATER' ? '💧 Water' :
                         req.command === 'NEED_FOOD' ? '🍽 Food' :
                         req.command === 'NEED_MEDICINE' ? '💊 Medicine' :
                         req.command === 'EMERGENCY' ? '🚨 Emergency' : req.command?.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        ({req.blink_count} blinks)
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      {req.timestamp ? new Date(req.timestamp).toLocaleTimeString() : 'N/A'} • {req.source || 'CAMERA'}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      req.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400' :
                      req.severity === 'HIGH' ? 'bg-purple-500/20 text-purple-400' :
                      'bg-amber-500/20 text-amber-400'
                    }`}>
                      {req.severity}
                    </span>
                    <span className="text-[10px] text-emerald-400 block font-semibold mt-0.5">
                      {req.alert_status || 'DELIVERED'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. LIVE PATIENT ACTIVITY (4 Cols) */}
        <div className="lg:col-span-4 bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              LIVE PATIENT ACTIVITY
            </h3>
            <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              STREAM
            </span>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1 font-mono text-[11px]">
            {activityFeed.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-10 font-sans">
                Activity events will stream live here as patient gestures are recognized.
              </p>
            ) : (
              activityFeed.map((act) => (
                <div
                  key={act.id}
                  className={`p-2 rounded-lg border flex items-start gap-2 ${
                    act.type === 'critical' ? 'bg-red-500/10 border-red-500/40 text-red-300' :
                    act.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
                    act.type === 'error' ? 'bg-red-950/40 border-red-800 text-red-400' :
                    'bg-slate-800/40 border-slate-700/40 text-slate-300'
                  }`}
                >
                  <span className="text-slate-500 text-[10px] flex-shrink-0 mt-0.5">{act.time}</span>
                  <span className="leading-snug">{act.text}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Real-Time Live Vision & EAR Diagnostics */}
      <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h4 className="text-xs font-bold text-cyan-400 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Live Vision & State Machine Diagnostics
          </h4>
          <span className="text-[10px] text-slate-400 font-mono">
            Cycle Status: <strong className={fsmState === 'OBSERVING' ? 'text-amber-400' : fsmState === 'EMERGENCY_DETECTED' ? 'text-red-400' : 'text-emerald-400'}>{fsmState}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 font-mono text-[11px]">
          <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/50">
            <span className="text-slate-500 block text-[10px]">CURRENT EAR</span>
            <span className="text-cyan-400 font-bold text-xs">{currentEAR}</span>
          </div>
          <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/50">
            <span className="text-slate-500 block text-[10px]">OPEN BASELINE</span>
            <span className="text-emerald-400 font-bold text-xs">{openBaselineEAR}</span>
          </div>
          <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/50">
            <span className="text-slate-500 block text-[10px]">CUTOFF (CLOSED/OPEN)</span>
            <span className="text-slate-300 text-xs">&lt;{earThresholdClosed} / &gt;{earThresholdOpen}</span>
          </div>
          <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/50">
            <span className="text-slate-500 block text-[10px]">EYE / BLINK STATE</span>
            <span className={eyeState === 'CLOSED' ? 'text-red-400 font-bold text-xs' : 'text-emerald-400 font-bold text-xs'}>
              {eyeState} ({blinkState})
            </span>
          </div>
          <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/50">
            <span className="text-slate-500 block text-[10px]">TOTAL VALID BLINKS</span>
            <span className="text-cyan-400 font-bold text-xs">{totalValidBlinks}</span>
          </div>
          <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/50">
            <span className="text-slate-500 block text-[10px]">LAST BLINK AT</span>
            <span className="text-slate-300 text-xs">{lastBlinkTimestamp}</span>
          </div>
          <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/50">
            <span className="text-slate-500 block text-[10px]">PROCESSED FRAMES</span>
            <span className="text-amber-400 font-bold text-xs">
              {frameCount}
            </span>
          </div>
        </div>
      </div>

      {/* Developer Testing Mode (Completely separate from normal patient workflow) */}
      <div className="border border-slate-800 bg-slate-950/40 rounded-2xl p-4 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-400">
            <Bug className="w-4 h-4 text-indigo-400" />
            <span className="font-semibold text-slate-300">Developer Testing Mode & Diagnostics</span>
            <span className="text-[10px] text-slate-500 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
              Diagnostic Testing Tool
            </span>
          </div>
          <button
            onClick={() => setShowDeveloperMode(!showDeveloperMode)}
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
          >
            {showDeveloperMode ? 'Hide Developer Tools' : 'Open Developer Tools'}
          </button>
        </div>

        {showDeveloperMode && (
          <div className="mt-4 pt-4 border-t border-slate-800 space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-amber-300 text-xs">
              <strong>Note:</strong> Patient monitoring operates 100% automatically via webcam detection. The tools below exist strictly for development diagnostics to test server response without physical blinks.
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-slate-400">
                Diagnostic Pipeline Trigger (Authoritative Backend Endpoint):
              </p>
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => dispatchBlinkCommand(2, 7.0, false)}
                  className="p-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                >
                  Test 2 (Water)
                </button>
                <button
                  onClick={() => dispatchBlinkCommand(3, 7.0, false)}
                  className="p-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                >
                  Test 3 (Food)
                </button>
                <button
                  onClick={() => dispatchBlinkCommand(4, 7.0, false)}
                  className="p-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                >
                  Test 4 (Medicine)
                </button>
                <button
                  onClick={() => dispatchBlinkCommand(5, 4.0, false)}
                  className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer"
                >
                  Test 5+ (Emergency)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
