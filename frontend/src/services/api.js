import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('paracare_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('paracare_token');
      localStorage.removeItem('paracare_user');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ──
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
  refresh: () => api.post('/auth/refresh'),
};

// ── Patients ──
export const patientAPI = {
  list: (params) => api.get('/v1/patients', { params }),
  get: (id) => api.get(`/v1/patients/${id}`),
  create: (data) => api.post('/v1/patients', data),
  update: (id, data) => api.put(`/v1/patients/${id}`, data),
};

// ── Caregivers ──
export const caregiverAPI = {
  list: (params) => api.get('/v1/caregivers', { params }),
  assign: (id, data) => api.post(`/v1/caregivers/${id}/assign`, data),
};

// ── Telemetry ──
export const telemetryAPI = {
  history: (params) => api.get('/v1/telemetry/history', { params }),
  stats: (params) => api.get('/v1/telemetry/stats', { params }),
  chart: (params) => api.get('/v1/telemetry/chart', { params }),
  export: (params) => api.get('/v1/telemetry/export', { params, responseType: 'blob' }),
};

// ── Blink Events ──
export const blinkAPI = {
  list: (params) => api.get('/v1/blink-events', { params }),
  summary: (params) => api.get('/v1/blink-events/summary', { params }),
  create: (data) => api.post('/v1/blink-events', data),
  detect: (data) => api.post('/v1/blink-events/detect', data),
};

// ── Alerts ──
export const alertAPI = {
  list: (params) => api.get('/v1/alerts', { params }),
  get: (id) => api.get(`/v1/alerts/${id}`),
  acknowledge: (id, data) => api.post(`/v1/alerts/${id}/acknowledge`, data),
  resolve: (id, data) => api.post(`/v1/alerts/${id}/resolve`, data),
};

// ── Simulator ──
export const simulatorAPI = {
  blink: (data) => api.post('/simulator/blink', data),
};

// ── Reports ──
export const reportAPI = {
  patient: (id, params) => api.get(`/v1/reports/patient/${id}`, { params }),
  csv: (id, params) => api.get(`/v1/reports/patient/${id}/csv`, { params, responseType: 'blob' }),
};

// ── Devices ──
export const deviceAPI = {
  data: (payload) => api.post('/device/data', payload),
  heartbeat: (payload) => api.post('/device/heartbeat', payload),
};

// ── Health Check ──
export const healthAPI = {
  check: () => api.get('/health'),
};

export default api;
