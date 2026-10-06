import { io } from 'socket.io-client';

let socket = null;

export function connectSocket(token) {
  if (socket?.connected) return socket;
  const wsUrl = import.meta.env.VITE_WS_BASE_URL || '/';
  socket = io(wsUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => console.log('[WS] Connected:', socket.id));
  socket.on('disconnect', (reason) => console.log('[WS] Disconnected:', reason));
  socket.on('connect_error', (err) => console.error('[WS] Connection error:', err.message));
  socket.on('error', (data) => console.error('[WS] Error:', data));

  return socket;
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}

export function getSocket() { return socket; }

export function joinPatientRoom(patientId) {
  if (socket?.connected) socket.emit('join_patient_room', { patient_id: patientId });
}

export function leavePatientRoom(patientId) {
  if (socket?.connected) socket.emit('leave_patient_room', { patient_id: patientId });
}

export default { connectSocket, disconnectSocket, getSocket, joinPatientRoom, leavePatientRoom };
