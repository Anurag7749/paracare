import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { blinkAPI, patientAPI, alertAPI, healthAPI } from '../services/api';
import { getSocket } from '../services/socket';
import toast from 'react-hot-toast';

const CameraMonitoringContext = createContext(null);

// ── Audio Feedback Helpers ───────────────────────────────────────────────────
function playBeep(freq = 600, duration = 0.08, type = 'sine') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

function playEmergencySiren() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, now + i * 0.22);
      osc.frequency.exponentialRampToValueAtTime(1400, now + i * 0.22 + 0.11);
      osc.frequency.exponentialRampToValueAtTime(800, now + i * 0.22 + 0.22);
      gain.gain.setValueAtTime(0.25, now + i * 0.22);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.22 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.22);
      osc.stop(now + i * 0.22 + 0.22);
    }
  } catch (e) {}
}

// ── MediaPipe 468 Landmark Indices for Eye Aspect Ratio (EAR) ────────────────
const LEFT_EYE_CORNER_INNER = 362;
const LEFT_EYE_CORNER_OUTER = 263;
const LEFT_EYE_PAIRS = [
  [385, 373],
  [386, 374],
  [387, 380],
];
const LEFT_EYE_OUTLINE = [362, 385, 386, 387, 263, 380, 374, 373];

const RIGHT_EYE_CORNER_OUTER = 33;
const RIGHT_EYE_CORNER_INNER = 133;
const RIGHT_EYE_PAIRS = [
  [160, 144],
  [159, 145],
  [158, 153],
];
const RIGHT_EYE_OUTLINE = [33, 160, 159, 158, 133, 153, 145, 144];

function calcEuclideanDist(p1, p2, width = 640, height = 480) {
  if (!p1 || !p2) return 0;
  const dx = (p1.x - p2.x) * width;
  const dy = (p1.y - p2.y) * height;
  return Math.hypot(dx, dy);
}

function calculateEyeEAR(landmarks, corner1Idx, corner2Idx, verticalPairs, width = 640, height = 480) {
  const pCorner1 = landmarks[corner1Idx];
  const pCorner2 = landmarks[corner2Idx];
  if (!pCorner1 || !pCorner2) return 0;

  const horizontal = calcEuclideanDist(pCorner1, pCorner2, width, height);
  if (horizontal <= 0.001) return 0;

  let totalVertical = 0;
  for (let i = 0; i < verticalPairs.length; i++) {
    const topPt = landmarks[verticalPairs[i][0]];
    const botPt = landmarks[verticalPairs[i][1]];
    if (topPt && botPt) {
      totalVertical += calcEuclideanDist(topPt, botPt, width, height);
    }
  }

  const avgVertical = totalVertical / verticalPairs.length;
  return avgVertical / horizontal;
}

export function CameraMonitoringProvider({ children }) {
  // Patients State
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');

  // Camera & AI States
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('OFFLINE'); // 'OFFLINE' | 'STARTING' | 'LIVE' | 'PAUSED' | 'ERROR'
  const [aiStatus, setAiStatus] = useState('IDLE'); // 'IDLE' | 'LOADING' | 'READY' | 'ERROR'
  const [cameraError, setCameraError] = useState(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [multipleFacesDetected, setMultipleFacesDetected] = useState(false);
  const [faceCondition, setFaceCondition] = useState('SEARCHING');
  const [audioEnabled, setAudioEnabled] = useState(true);

  // Real-time Runtime Diagnostics
  const [frameCount, setFrameCount] = useState(0);
  const [currentEAR, setCurrentEAR] = useState(0.32);
  const [leftEARVal, setLeftEARVal] = useState(0.32);
  const [rightEARVal, setRightEARVal] = useState(0.32);
  const [eyeState, setEyeState] = useState('OPEN'); // 'OPEN' | 'CLOSED'
  const [blinkState, setBlinkState] = useState('READY'); // 'READY' | 'CLOSING' | 'CONFIRMED'
  const [openBaselineEAR, setOpenBaselineEAR] = useState(0.32);
  const [earThresholdClosed, setEarThresholdClosed] = useState(0.22);
  const [earThresholdOpen, setEarThresholdOpen] = useState(0.27);
  const [sensitivityMode, setSensitivityMode] = useState('AUTO');

  // 7-Second Window FSM State
  const [fsmState, setFsmState] = useState('IDLE'); // 'IDLE' | 'OBSERVING' | 'EMERGENCY_DETECTED' | 'DISPATCHING' | 'DISPATCHED' | 'FAILED'
  const [windowTimeRemaining, setWindowTimeRemaining] = useState(7.0);
  const [blinkCount, setBlinkCount] = useState(0);
  const [totalValidBlinks, setTotalValidBlinks] = useState(0);
  const [lastBlinkTimestamp, setLastBlinkTimestamp] = useState('None');
  const [currentPatientRequest, setCurrentPatientRequest] = useState(null);
  const [lastPatientRequest, setLastPatientRequest] = useState(null);
  const [recentRequests, setRecentRequests] = useState([]);
  const [activityFeed, setActivityFeed] = useState([]);
  const [apiRetryStatus, setApiRetryStatus] = useState(null);

  // Live Connections Health Status
  const [connStatus, setConnStatus] = useState({
    camera: false,
    backend: true,
    socket: false,
    database: true,
  });

  // Master DOM elements and stream refs (persisting across page changes)
  const masterVideoRef = useRef(null);
  const masterCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const faceMeshRef = useRef(null);
  const cameraUtilsRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const initTimeoutRef = useRef(null);
  const isInitializingRef = useRef(false);

  // Master Engine Ref (Single authoritative mutable state container)
  const engineRef = useRef({
    fsmState: 'IDLE',
    eyeIsClosed: false,
    closeStartTime: 0,
    lastBlinkConfirmedTime: 0,
    blinkCount: 0,
    totalValidBlinks: 0,
    windowStartTime: 0,
    windowDuration: 7.0,
    cycleLocked: false,
    frameCount: 0,

    openBaseline: 0.32,
    earThresholdClosed: 0.22,
    earThresholdOpen: 0.27,
    sensitivityMultiplier: 0.68,

    audioEnabled: true,
    selectedPatientId: '',
    minClosureMs: 40,   // Minimum eye-closure duration for valid blink
    maxBlinkMs: 950,    // Maximum eye-closure duration for tap blink
    holdSosMs: 3000,    // Continuous eye-closure >= 3.0s triggers Emergency SOS
    debounceMs: 100,    // Minimum interval between consecutive blinks

    onResults: null,
    handleBlinkDetected: null,
    dispatchBlinkCommand: null,
    resetToIdle: null,
  });

  // Helper to add activity feed item
  const addActivity = useCallback((text, type = 'info') => {
    const time = new Date().toLocaleTimeString();
    setActivityFeed((prev) => [{ id: Date.now() + Math.random(), time, text, type }, ...prev.slice(0, 19)]);
  }, []);

  // Fetch recent requests from backend database
  const loadRecentRequests = useCallback(async (pid) => {
    try {
      const res = await blinkAPI.list({
        patient_id: pid || undefined,
        per_page: 10
      });
      const items = res.data.data?.items || [];
      setRecentRequests(items);
      if (items.length > 0) {
        setLastPatientRequest((prev) => {
          if (!prev || prev.id !== items[0].id) {
            return {
              id: items[0].id,
              command: items[0].command,
              blink_count: items[0].blink_count,
              duration_seconds: items[0].duration_seconds,
              severity: items[0].severity,
              source: items[0].source || 'CAMERA',
              timestamp: items[0].timestamp ? new Date(items[0].timestamp).toLocaleTimeString() : 'Recent',
              status: items[0].alert_status || 'DELIVERED',
              alert_id: items[0].alert_id
            };
          }
          return prev;
        });
      }
    } catch (e) {
      console.error('[CAMERA MONITOR] Failed to load recent requests:', e);
    }
  }, []);

  // Sync state into engineRef
  useEffect(() => {
    engineRef.current.audioEnabled = audioEnabled;
    engineRef.current.selectedPatientId = selectedPatientId;
  }, [audioEnabled, selectedPatientId]);

  // Check health and socket connection periodically
  useEffect(() => {
    const checkConnections = () => {
      healthAPI.check()
        .then(() => setConnStatus((p) => ({ ...p, backend: true, database: true })))
        .catch(() => setConnStatus((p) => ({ ...p, backend: false })));

      const sock = getSocket();
      setConnStatus((p) => ({ ...p, socket: !!(sock && sock.connected) }));
    };

    checkConnections();
    const interval = setInterval(checkConnections, 4000);
    return () => clearInterval(interval);
  }, []);

  // Load patients on mount
  useEffect(() => {
    patientAPI.list({ per_page: 50 })
      .then((res) => {
        const items = res.data.data?.items || [];
        setPatients(items);
        if (items.length > 0 && !selectedPatientId) {
          const firstId = items[0].id;
          setSelectedPatientId(firstId);
          engineRef.current.selectedPatientId = firstId;
          loadRecentRequests(firstId);
        }
      })
      .catch((err) => {
        console.error('[CAMERA MONITOR] Failed to load patients:', err);
      });
  }, [loadRecentRequests, selectedPatientId]);

  // Socket.IO real-time delivery confirmations
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onBlink = (data) => {
      loadRecentRequests(selectedPatientId);
      if (data?.command && data.command !== 'NORMAL_BLINK') {
        const formattedReq = {
          id: data.alert_id || Date.now(),
          timestamp: new Date().toLocaleTimeString(),
          command: data.command,
          blink_count: data.blink_count || 1,
          duration_seconds: data.duration_seconds || 0,
          severity: data.severity,
          alert_id: data.alert_id,
          source: data.source || 'LIVE CAMERA',
          status: 'DELIVERED',
          statusText: 'REQUEST SENT & DELIVERED TO CAREGIVER',
        };
        setLastPatientRequest(formattedReq);
      }
    };

    const onAlertAck = (data) => {
      loadRecentRequests(selectedPatientId);
      addActivity(`Caregiver acknowledged request (Alert #${data.id?.slice(0, 8)})`, 'success');
      setRecentRequests((prev) =>
        prev.map((item) => (item.alert_id === data.id || item.id === data.blink_event_id ? { ...item, alert_status: 'ACKNOWLEDGED' } : item))
      );
      setLastPatientRequest((p) => (p && (p.alert_id === data.id || p.id === data.blink_event_id) ? { ...p, status: 'ACKNOWLEDGED' } : p));
      setCurrentPatientRequest((p) => (p && (p.alert_id === data.id || p.id === data.blink_event_id) ? { ...p, status: 'ACKNOWLEDGED', statusText: 'ACKNOWLEDGED BY CAREGIVER' } : p));
    };

    socket.on('blink_command', onBlink);
    socket.on('alert_triggered', onBlink);
    socket.on('emergency_sos', onBlink);
    socket.on('alert_acknowledged', onAlertAck);

    return () => {
      socket.off('blink_command', onBlink);
      socket.off('alert_triggered', onBlink);
      socket.off('emergency_sos', onBlink);
      socket.off('alert_acknowledged', onAlertAck);
    };
  }, [selectedPatientId, loadRecentRequests, addActivity]);

  // Sensitivity adjustments
  const handleSensitivityChange = (mode) => {
    setSensitivityMode(mode);
    let mult = 0.68;
    if (mode === 'HIGH') mult = 0.74; // Easier to trigger
    if (mode === 'LOW') mult = 0.58;  // Requires deeper eye closure
    if (mode === 'BALANCED' || mode === 'AUTO') mult = 0.68;

    engineRef.current.sensitivityMultiplier = mult;
    const base = engineRef.current.openBaseline;
    const newClosed = +(base * mult).toFixed(3);
    const newOpen = +(base * (mult + 0.14)).toFixed(3);
    setEarThresholdClosed(newClosed);
    setEarThresholdOpen(newOpen);
    engineRef.current.earThresholdClosed = newClosed;
    engineRef.current.earThresholdOpen = newOpen;
    toast.success(`Sensitivity set to ${mode} (Threshold: <${newClosed})`);
  };

  // ── Reset Engine to IDLE ──────────────────────────────────────────────────
  const resetToIdle = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    engineRef.current.fsmState = 'IDLE';
    engineRef.current.blinkCount = 0;
    engineRef.current.windowStartTime = 0;
    engineRef.current.cycleLocked = false;
    engineRef.current.eyeIsClosed = false;
    engineRef.current.closeStartTime = 0;

    setFsmState('IDLE');
    setBlinkCount(0);
    setWindowTimeRemaining(7.0);
    setApiRetryStatus(null);
    setBlinkState('READY');
  }, []);

  // ── Dispatch Blink Command to Backend ──────────────────────────────────────
  const dispatchBlinkCommand = useCallback(async (count, duration, isContinuousEmergency = false, retryAttempt = 0) => {
    if (count === 0 && !isContinuousEmergency) return;

    engineRef.current.fsmState = 'DISPATCHING';
    setFsmState('DISPATCHING');
    setApiRetryStatus(null);

    const isEmergency = count >= 5 || isContinuousEmergency;
    const timeStr = new Date().toLocaleTimeString();

    if (isEmergency) {
      addActivity(`🚨 Emergency detected (${isContinuousEmergency ? 'Continuous 3s Hold' : `${count} Blinks`})`, 'critical');
    } else {
      const label = count === 2 ? '💧 Water' : count === 3 ? '🍽 Food' : count === 4 ? '💊 Medicine' : 'Normal';
      addActivity(`${label} request detected (${count} blinks)`, 'info');
    }

    addActivity('Transmitting request to backend server...', 'info');

    try {
      if (engineRef.current.audioEnabled) {
        if (isEmergency) playEmergencySiren();
        else playBeep(880, 0.25, 'triangle');
      }

      // Unique Event ID for idempotency deduplication (Requirement 24)
      const eventId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined;

      const payload = {
        event_id: eventId,
        source: 'CAMERA',
        blink_count: isContinuousEmergency ? 1 : count,
        duration_seconds: +(duration).toFixed(1),
        patient_id: engineRef.current.selectedPatientId || undefined,
      };

      console.log('[CAMERA BLINK AI] Transmitting payload to /api/v1/blink-events:', payload);
      const res = await blinkAPI.create(payload);
      const resData = res.data.data;
      console.log('[CAMERA BLINK AI] Backend response received:', resData);

      addActivity('Request stored in PostgreSQL & broadcasted to caregiver dashboard', 'success');

      const resolvedRequest = {
        id: resData.id || Date.now(),
        timestamp: timeStr,
        command: resData.command_processed,
        blink_count: resData.blink_count,
        duration_seconds: resData.duration_seconds,
        severity: resData.severity,
        alert_id: resData.alert_id,
        source: 'LIVE CAMERA',
        status: 'DELIVERED',
        statusText: 'REQUEST SENT & DELIVERED TO CAREGIVER',
      };

      setCurrentPatientRequest(resolvedRequest);
      setLastPatientRequest(resolvedRequest);

      setRecentRequests((prev) => [
        {
          id: resData.id,
          timestamp: new Date().toISOString(),
          command: resData.command_processed,
          blink_count: resData.blink_count,
          duration_seconds: resData.duration_seconds,
          severity: resData.severity,
          source: 'CAMERA',
          alert_status: 'PENDING',
          alert_id: resData.alert_id
        },
        ...prev.slice(0, 9)
      ]);

      engineRef.current.fsmState = 'DISPATCHED';
      setFsmState('DISPATCHED');

      if (resData.command_processed === 'EMERGENCY') {
        toast.error(`🚨 EMERGENCY SOS DISPATCHED (${resData.blink_count} Blinks | Alert #${resData.alert_id?.slice(0, 8) || 'STORED'})!`, {
          duration: 7000,
          id: 'emergency-toast'
        });
      } else if (resData.command_processed === 'NORMAL_BLINK') {
        toast('Single blink logged (Normal)', { icon: '👁️' });
      } else {
        toast.success(`Dispatched: ${resData.command_processed?.replace('_', ' ')} (${resData.blink_count} Blinks)`);
      }

      // Automatically reset to IDLE after 2.0s cooldown and continue monitoring
      setTimeout(() => {
        if (engineRef.current.resetToIdle) {
          engineRef.current.resetToIdle();
        }
      }, 2000);

    } catch (err) {
      console.error('[CAMERA BLINK AI] Failed to dispatch blink command:', err);
      addActivity('❌ Server transmission failed! Unable to contact backend.', 'error');

      if (retryAttempt < 3 && isEmergency) {
        setApiRetryStatus(`Connection issue. Retrying emergency dispatch (Attempt ${retryAttempt + 1}/3)...`);
        addActivity(`Retrying emergency dispatch (Attempt ${retryAttempt + 1}/3)...`, 'warning');
        setTimeout(() => {
          dispatchBlinkCommand(count, duration, isContinuousEmergency, retryAttempt + 1);
        }, 1500);
        return;
      }

      toast.error(err.response?.data?.message || 'Emergency dispatch failed! Server unreachable.');
      setApiRetryStatus('REQUEST FAILED: Unable to reach backend server. Please check connection.');
      engineRef.current.fsmState = 'FAILED';
      engineRef.current.cycleLocked = false;
      setFsmState('FAILED');

      // Recover back to IDLE after a short pause so monitoring doesn't freeze
      setTimeout(() => {
        if (engineRef.current.resetToIdle) {
          engineRef.current.resetToIdle();
        }
      }, 3000);
    }
  }, [addActivity]);

  // ── Register Detected Blink in FSM ─────────────────────────────────────────
  const handleBlinkDetected = useCallback(() => {
    const now = Date.now();
    const eng = engineRef.current;

    // Ignore if cycle is currently locked or in dispatch
    if (eng.cycleLocked || eng.fsmState === 'DISPATCHING' || eng.fsmState === 'DISPATCHED') {
      return;
    }

    if (eng.audioEnabled) playBeep(520, 0.06, 'sine');

    const timeStr = new Date().toLocaleTimeString();
    setLastBlinkTimestamp(timeStr);
    setTotalValidBlinks((prev) => prev + 1);
    eng.totalValidBlinks += 1;

    // ── Case 1: First Valid Blink Initiates the 7-Second Communication Window ──
    if (eng.fsmState === 'IDLE' || eng.fsmState === 'FAILED') {
      eng.fsmState = 'OBSERVING';
      eng.windowStartTime = now;
      eng.blinkCount = 1;
      eng.cycleLocked = false;

      setFsmState('OBSERVING');
      setBlinkCount(1);
      setWindowTimeRemaining(7.0);
      console.log(`[BLINK DETECTOR] Window STARTED! Blink #1 recorded at ${timeStr}`);

      // Start precise countdown timer
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => {
        const currentEng = engineRef.current;
        if (currentEng.fsmState !== 'OBSERVING' || currentEng.cycleLocked) {
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          return;
        }

        const elapsed = (Date.now() - currentEng.windowStartTime) / 1000;
        const remaining = Math.max(0, 7.0 - elapsed);
        setWindowTimeRemaining(+remaining.toFixed(1));

        // 7-Second Window Expired: Finalize command for standard requests
        if (remaining <= 0) {
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          currentEng.cycleLocked = true;
          const finalCount = currentEng.blinkCount;
          const finalDuration = 7.0;

          console.log(`[BLINK DETECTOR] 7-Second Window EXPIRED with ${finalCount} blinks.`);

          if (finalCount === 1) {
            // Rule: 1 single blink is Normal / Status Logged -> Reset to IDLE without request
            console.log('[BLINK DETECTOR] 1 blink expired -> Discarding incomplete pattern & returning to READY');
            currentEng.resetToIdle();
          } else if (finalCount >= 2 && currentEng.dispatchBlinkCommand) {
            // 2 (Water), 3 (Food), 4 (Medicine)
            currentEng.dispatchBlinkCommand(finalCount, finalDuration, false);
          } else {
            currentEng.resetToIdle();
          }
        }
      }, 100);

      return;
    }

    // ── Case 2: Window is Already OBSERVING, Accumulate Count ──────────────────
    if (eng.fsmState === 'OBSERVING') {
      const newCount = eng.blinkCount + 1;
      eng.blinkCount = newCount;
      setBlinkCount(newCount);
      console.log(`[BLINK DETECTOR] Window ACTIVE: Blink #${newCount} registered`);

      // Rule: Reaching 5+ blinks IMMEDIATELY triggers EMERGENCY SOS without waiting for 7s timer!
      if (newCount >= 5 && !eng.cycleLocked) {
        eng.cycleLocked = true;
        eng.fsmState = 'EMERGENCY_DETECTED';
        setFsmState('EMERGENCY_DETECTED');

        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }

        const elapsed = Math.min(7.0, (now - eng.windowStartTime) / 1000);
        console.log(`[BLINK DETECTOR] 5+ Blinks threshold met! Triggering immediate EMERGENCY SOS (${elapsed}s)`);

        if (eng.dispatchBlinkCommand) {
          eng.dispatchBlinkCommand(newCount, elapsed, false);
        }
      }
    }
  }, []);

  // ── Process Facial Landmarks Frame (MediaPipe Callback) ───────────────────
  const onResults = useCallback((results) => {
    const canvas = masterCanvasRef.current;
    const video = masterVideoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw video feed onto canvas
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    const eng = engineRef.current;
    eng.frameCount += 1;
    setFrameCount(eng.frameCount);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      setFaceDetected(true);
      const isMultiFace = results.multiFaceLandmarks.length > 1;
      setMultipleFacesDetected(isMultiFace);
      setFaceCondition(isMultiFace ? 'MULTIPLE_FACES' : 'OPTIMAL');

      const landmarks = results.multiFaceLandmarks[0];

      // Calculate Left & Right EAR using multi-point vertical pairs
      const leftEAR = calculateEyeEAR(landmarks, LEFT_EYE_CORNER_INNER, LEFT_EYE_CORNER_OUTER, LEFT_EYE_PAIRS, canvas.width, canvas.height);
      const rightEAR = calculateEyeEAR(landmarks, RIGHT_EYE_CORNER_OUTER, RIGHT_EYE_CORNER_INNER, RIGHT_EYE_PAIRS, canvas.width, canvas.height);
      const avgEAR = (leftEAR + rightEAR) / 2.0;

      setCurrentEAR(+avgEAR.toFixed(3));
      setLeftEARVal(+leftEAR.toFixed(3));
      setRightEARVal(+rightEAR.toFixed(3));

      // ── Robust Adaptive Baseline Tracking ────────────────────────────────
      if (!eng.eyeIsClosed && avgEAR > 0.20 && avgEAR < 0.60 && avgEAR >= eng.openBaseline * 0.85) {
        const updatedBaseline = eng.openBaseline * 0.97 + avgEAR * 0.03;
        eng.openBaseline = updatedBaseline;
        setOpenBaselineEAR(+updatedBaseline.toFixed(3));

        const mult = eng.sensitivityMultiplier || 0.68;
        const dynamicClosed = +(updatedBaseline * mult).toFixed(3);
        const dynamicOpen = +(updatedBaseline * (mult + 0.14)).toFixed(3);

        eng.earThresholdClosed = dynamicClosed;
        eng.earThresholdOpen = dynamicOpen;
        setEarThresholdClosed(dynamicClosed);
        setEarThresholdOpen(dynamicOpen);
      }

      // Draw Cyan Eye Outlines on Canvas
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2.5;
      ctx.fillStyle = 'rgba(6, 182, 212, 0.45)';

      // Draw Left Eye Outline
      ctx.beginPath();
      LEFT_EYE_OUTLINE.forEach((idx, i) => {
        const p = landmarks[idx];
        const x = p.x * canvas.width;
        const y = p.y * canvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.fill();

      // Draw Right Eye Outline
      ctx.beginPath();
      RIGHT_EYE_OUTLINE.forEach((idx, i) => {
        const p = landmarks[idx];
        const x = p.x * canvas.width;
        const y = p.y * canvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.fill();

      const now = Date.now();
      const closedThresh = eng.earThresholdClosed;
      const openThresh = eng.earThresholdOpen;

      // ── Authoritative Blink State Machine: OPEN → CLOSED → OPEN ───────────
      if (avgEAR < closedThresh) {
        // Eyes entered CLOSED state
        if (!eng.eyeIsClosed) {
          eng.eyeIsClosed = true;
          eng.closeStartTime = now;
          setEyeState('CLOSED');
          setBlinkState('CLOSING');
        } else {
          // Check for Continuous Hold >= 3.0s (EMERGENCY HOLD)
          const closedDurationMs = now - eng.closeStartTime;
          if (closedDurationMs >= eng.holdSosMs && !eng.cycleLocked) {
            eng.cycleLocked = true;
            eng.fsmState = 'EMERGENCY_DETECTED';
            setFsmState('EMERGENCY_DETECTED');

            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
            }

            console.log(`[CAMERA BLINK AI] Continuous eye closure >= 3.0s detected (${(closedDurationMs / 1000).toFixed(1)}s)!`);
            if (eng.dispatchBlinkCommand) {
              eng.dispatchBlinkCommand(1, closedDurationMs / 1000, true);
            }
          }
        }
      } else if (avgEAR > openThresh) {
        // Eyes returned to OPEN state
        if (eng.eyeIsClosed) {
          const closureTimeMs = now - eng.closeStartTime;
          const timeSinceLastBlink = now - eng.lastBlinkConfirmedTime;
          eng.eyeIsClosed = false;
          setEyeState('OPEN');

          // Valid Intentional Blink: 40ms <= closure <= 950ms, with 100ms debounce
          if (closureTimeMs >= eng.minClosureMs && closureTimeMs <= eng.maxBlinkMs) {
            if (timeSinceLastBlink >= eng.debounceMs) {
              eng.lastBlinkConfirmedTime = now;
              setBlinkState('CONFIRMED');
              console.log(`[BLINK DETECTOR] VALID BLINK COMPLETED in ${closureTimeMs}ms!`);
              if (eng.handleBlinkDetected) {
                eng.handleBlinkDetected();
              }
            }
          } else {
            setBlinkState('READY');
          }
        }
      }

      // Draw HUD Banner on Master Canvas
      const isClosed = avgEAR < closedThresh;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.strokeStyle = isClosed ? 'rgba(239, 68, 68, 0.7)' : 'rgba(16, 185, 129, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(12, 12, 320, 56, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isClosed ? '#ef4444' : '#10b981';
      ctx.font = 'bold 14px Inter, system-ui, sans-serif';
      ctx.fillText(isClosed ? '👁️ EYES CLOSED (CLOSING)' : '👁️ EYES OPEN (ACTIVE)', 24, 34);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.fillText(`EAR: ${avgEAR.toFixed(3)} | Base: ${eng.openBaseline.toFixed(2)} | Cutoff: <${closedThresh.toFixed(2)}`, 24, 52);

      if (isMultiFace) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
        ctx.beginPath();
        ctx.roundRect(12, 74, 320, 28, 6);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 11px Inter, system-ui, sans-serif';
        ctx.fillText('⚠️ Multiple faces detected (Tracking patient #1)', 20, 92);
      }

    } else {
      setFaceDetected(false);
      setMultipleFacesDetected(false);
      setFaceCondition('NO_FACE');
      setEyeState('OPEN');
      setBlinkState('READY');

      ctx.fillStyle = 'rgba(239, 68, 68, 0.88)';
      ctx.beginPath();
      ctx.roundRect(12, 12, 300, 44, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Inter, system-ui, sans-serif';
      ctx.fillText('⚠️ PATIENT FACE NOT DETECTED', 24, 32);
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillText('Blink Monitoring Paused • Position face in camera view', 24, 48);
    }

    ctx.restore();
  }, []);

  // Sync callbacks into engineRef
  useEffect(() => {
    engineRef.current.onResults = onResults;
    engineRef.current.handleBlinkDetected = handleBlinkDetected;
    engineRef.current.dispatchBlinkCommand = dispatchBlinkCommand;
    engineRef.current.resetToIdle = resetToIdle;
  }, [onResults, handleBlinkDetected, dispatchBlinkCommand, resetToIdle]);

  // ── Optimized & Resilient Camera + MediaPipe Initialization ───────────────
  const startCamera = useCallback(async () => {
    if (isInitializingRef.current || cameraActive) return;
    isInitializingRef.current = true;

    setCameraError(null);
    setCameraStatus('STARTING');
    setAiStatus('LOADING');
    addActivity('Requesting camera device access...', 'info');

    try {
      // 1. Open Camera Stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;
      if (masterVideoRef.current) {
        masterVideoRef.current.srcObject = stream;
        await masterVideoRef.current.play();
      }

      setCameraActive(true);
      setCameraStatus('LIVE');
      setConnStatus((p) => ({ ...p, camera: true }));
      addActivity('Camera feed active. Initializing MediaPipe FaceMesh AI...', 'info');

      // 2. Load MediaPipe Scripts once if not already in DOM
      const loadScript = (src) =>
        new Promise((resolve, reject) => {
          if (document.querySelector(`script[src="${src}"]`)) return resolve();
          const s = document.createElement('script');
          s.src = src;
          s.crossOrigin = 'anonymous';
          s.onload = resolve;
          s.onerror = () => reject(new Error(`Failed to load ${src}`));
          document.head.appendChild(s);
        });

      if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
      const loadPromise = Promise.all([
        loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js'),
        loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js'),
      ]);

      const timeoutPromise = new Promise((_, reject) => {
        initTimeoutRef.current = setTimeout(() => {
          reject(new Error('MediaPipe initialization timed out (10s). CDN resource slow.'));
        }, 10000);
      });

      await Promise.race([loadPromise, timeoutPromise]);
      if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);

      if (window.FaceMesh) {
        if (faceMeshRef.current?.close) {
          try { faceMeshRef.current.close(); } catch (e) {}
        }

        const faceMesh = new window.FaceMesh({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        faceMesh.setOptions({
          maxNumFaces: 2,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        faceMesh.onResults((results) => {
          if (engineRef.current.onResults) {
            engineRef.current.onResults(results);
          }
        });
        faceMeshRef.current = faceMesh;

        if (window.Camera) {
          if (cameraUtilsRef.current?.stop) {
            try { cameraUtilsRef.current.stop(); } catch (e) {}
          }

          const cameraUtil = new window.Camera(masterVideoRef.current, {
            onFrame: async () => {
              if (faceMeshRef.current && masterVideoRef.current && masterVideoRef.current.readyState >= 2) {
                try {
                  await faceMeshRef.current.send({ image: masterVideoRef.current });
                } catch (sendErr) {
                  // Ignore minor frame transition errors
                }
              }
            },
            width: 640,
            height: 480,
          });

          cameraUtil.start();
          cameraUtilsRef.current = cameraUtil;

          setAiStatus('READY');
          addActivity('MediaPipe Neural FaceMesh AI ready and tracking.', 'success');
        }
      }
    } catch (err) {
      console.error('[CAMERA MONITOR] Initialization error:', err);
      let errorMsg = 'Failed to initialize Camera AI.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'CAMERA PERMISSION REQUIRED: Please allow camera access in your browser settings.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMsg = 'CAMERA UNAVAILABLE: Another application may already be using this camera.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'NO CAMERA FOUND: Please connect a webcam device.';
      } else if (err.message && err.message.includes('timed out')) {
        errorMsg = 'CAMERA AI INITIALIZATION FAILED: Network resource slow. Click Retry Camera.';
      }

      setCameraError(errorMsg);
      setCameraStatus('ERROR');
      setAiStatus('ERROR');
      addActivity(`Initialization failed: ${errorMsg}`, 'error');
    } finally {
      isInitializingRef.current = false;
    }
  }, [cameraActive, addActivity]);

  // ── Stop Camera & Resource Cleanup (Explicit action only) ──────────────────
  const stopCamera = useCallback(() => {
    isInitializingRef.current = false;
    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
      initTimeoutRef.current = null;
    }

    if (cameraUtilsRef.current?.stop) {
      try { cameraUtilsRef.current.stop(); } catch (e) {}
      cameraUtilsRef.current = null;
    }

    if (faceMeshRef.current?.close) {
      try { faceMeshRef.current.close(); } catch (e) {}
      faceMeshRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (masterVideoRef.current) {
      masterVideoRef.current.srcObject = null;
    }

    setCameraActive(false);
    setCameraStatus('OFFLINE');
    setAiStatus('IDLE');
    setFaceDetected(false);
    setMultipleFacesDetected(false);
    setConnStatus((p) => ({ ...p, camera: false }));
    resetToIdle();
    addActivity('Camera Blink AI Monitor paused.', 'info');
  }, [resetToIdle, addActivity]);

  // ── Retry Camera AI ────────────────────────────────────────────────────────
  const retryCamera = useCallback(() => {
    stopCamera();
    setTimeout(() => {
      startCamera();
    }, 400);
  }, [stopCamera, startCamera]);

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) || null;

  return (
    <CameraMonitoringContext.Provider
      value={{
        patients,
        selectedPatientId,
        setSelectedPatientId,
        selectedPatient,
        cameraActive,
        cameraStatus,
        aiStatus,
        cameraError,
        faceDetected,
        multipleFacesDetected,
        faceCondition,
        audioEnabled,
        setAudioEnabled,
        frameCount,
        currentEAR,
        leftEARVal,
        rightEARVal,
        eyeState,
        blinkState,
        openBaselineEAR,
        earThresholdClosed,
        earThresholdOpen,
        sensitivityMode,
        handleSensitivityChange,
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
        masterVideoRef,
        masterCanvasRef,
        streamRef,
      }}
    >
      {/* Hidden Persistent DOM element for continuous camera & MediaPipe processing */}
      <div style={{ position: 'fixed', top: -9999, left: -9999, width: 640, height: 480, pointerEvents: 'none', opacity: 0 }}>
        <video
          ref={masterVideoRef}
          playsInline
          muted
          width="640"
          height="480"
          style={{ width: 640, height: 480 }}
        />
        <canvas
          ref={masterCanvasRef}
          width="640"
          height="480"
          style={{ width: 640, height: 480 }}
        />
      </div>

      {children}
    </CameraMonitoringContext.Provider>
  );
}

export const useCameraMonitoring = () => useContext(CameraMonitoringContext);
