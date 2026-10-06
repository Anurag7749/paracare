import { useState } from 'react';
import { Settings, Shield, Bell, Database, Wifi, Cpu, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { user } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [whatsappMock, setWhatsappMock] = useState(true);
  const [smsMock, setSmsMock] = useState(true);
  const [emailMock, setEmailMock] = useState(true);

  const handleSave = (e) => {
    e.preventDefault();
    toast.success('System settings saved');
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="bg-slate-900/50 p-6 border border-slate-700/50 rounded-2xl space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <Settings className="w-6 h-6 text-cyan-400" />
          <div>
            <h2 className="text-lg font-bold text-white">System Settings & Configuration</h2>
            <p className="text-xs text-slate-400">ParaCare IoT Health & Eye-Blink Monitoring Platform</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6 text-xs">
          {/* User Profile */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-cyan-400" /> Account Profile
            </h3>
            <div className="grid grid-cols-2 gap-4 bg-slate-800/40 p-4 rounded-xl border border-slate-700/40">
              <div>
                <span className="text-slate-500 block">Logged User</span>
                <span className="text-white font-medium">{user?.name || 'User'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Email Address</span>
                <span className="text-slate-300">{user?.email || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Role</span>
                <span className="text-cyan-400 font-bold">{user?.role || 'CAREGIVER'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Status</span>
                <span className="text-emerald-400 font-medium">ACTIVE</span>
              </div>
            </div>
          </div>

          {/* Notification Provider Configuration */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-cyan-400" /> Notification Provider Setup
            </h3>
            <div className="space-y-3 bg-slate-800/40 p-4 rounded-xl border border-slate-700/40">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">WhatsApp Provider</p>
                  <p className="text-slate-500 text-[11px]">Twilio / Meta WhatsApp API (Development Mock Mode)</p>
                </div>
                <input
                  type="checkbox"
                  checked={whatsappMock}
                  onChange={(e) => setWhatsappMock(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                />
              </div>

              <div className="flex items-center justify-between border-t border-slate-700/40 pt-3">
                <div>
                  <p className="font-medium text-white">SMS Provider</p>
                  <p className="text-slate-500 text-[11px]">Twilio SMS Gateway (Development Mock Mode)</p>
                </div>
                <input
                  type="checkbox"
                  checked={smsMock}
                  onChange={(e) => setSmsMock(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                />
              </div>

              <div className="flex items-center justify-between border-t border-slate-700/40 pt-3">
                <div>
                  <p className="font-medium text-white">Email Provider</p>
                  <p className="text-slate-500 text-[11px]">SendGrid / SMTP Dispatcher (Development Mock Mode)</p>
                </div>
                <input
                  type="checkbox"
                  checked={emailMock}
                  onChange={(e) => setEmailMock(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                />
              </div>
            </div>
          </div>

          {/* Database & ESP32 Configuration */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" /> Database & Hardware Specs
            </h3>
            <div className="grid grid-cols-2 gap-4 bg-slate-800/40 p-4 rounded-xl border border-slate-700/40">
              <div>
                <span className="text-slate-500 block">Database Layer</span>
                <span className="text-white font-medium">PostgreSQL (SQLAlchemy ORM)</span>
              </div>
              <div>
                <span className="text-slate-500 block">Hardware Edge Device</span>
                <span className="text-white font-medium">ESP32 Dual-Core (C++ PlatformIO)</span>
              </div>
              <div>
                <span className="text-slate-500 block">Real-time Protocol</span>
                <span className="text-white font-medium">WebSocket (Flask-SocketIO)</span>
              </div>
              <div>
                <span className="text-slate-500 block">Blink FSM Observation Window</span>
                <span className="text-cyan-400 font-medium">2.0 Seconds</span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white rounded-xl transition-colors shadow-lg shadow-cyan-500/20"
          >
            Save Configuration
          </button>
        </form>
      </div>
    </div>
  );
}
