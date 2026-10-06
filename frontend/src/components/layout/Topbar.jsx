import { useState, useEffect, useRef } from 'react';
import { Bell, Search, AlertTriangle, ShieldAlert, CheckCircle, Droplets, UtensilsCrossed, Pill, Eye, ExternalLink, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { alertAPI } from '../../services/api';
import { getSocket } from '../../services/socket';
import toast from 'react-hot-toast';

export default function Topbar({ title }) {
  const { user } = useAuth();
  const [unreadAlerts, setUnreadAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const fetchUnreadAlerts = async () => {
    try {
      const res = await alertAPI.list({ status: 'PENDING', per_page: 8 });
      const items = res.data.data?.items || [];
      const total = res.data.data?.pagination?.total || items.length;
      setUnreadAlerts(items);
      setUnreadCount(total);
    } catch (e) {
      console.error('Failed to load notifications in topbar:', e);
    }
  };

  useEffect(() => {
    fetchUnreadAlerts();
  }, []);

  // Socket.IO real-time notification listener
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onAlert = () => fetchUnreadAlerts();
    const onEmergency = () => fetchUnreadAlerts();
    const onAck = () => fetchUnreadAlerts();
    const onResolved = () => fetchUnreadAlerts();

    socket.on('alert_triggered', onAlert);
    socket.on('emergency_sos', onEmergency);
    socket.on('alert_acknowledged', onAck);
    socket.on('alert_resolved', onResolved);

    return () => {
      socket.off('alert_triggered', onAlert);
      socket.off('emergency_sos', onEmergency);
      socket.off('alert_acknowledged', onAck);
      socket.off('alert_resolved', onResolved);
    };
  }, []);

  // Close dropdown when clicked outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAcknowledge = async (id, e) => {
    e.stopPropagation();
    try {
      await alertAPI.acknowledge(id, { notes: 'Acknowledged via Top Notification Bell' });
      toast.success('Patient request acknowledged');
      fetchUnreadAlerts();
    } catch (err) {
      toast.error('Failed to acknowledge notification');
    }
  };

  const getAlertIcon = (type, severity, msg = '') => {
    if (severity === 'CRITICAL' || type === 'EMERGENCY_SOS') return <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0" />;
    if (msg.toLowerCase().includes('water')) return <Droplets className="w-4 h-4 text-cyan-400 flex-shrink-0" />;
    if (msg.toLowerCase().includes('food')) return <UtensilsCrossed className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    if (msg.toLowerCase().includes('medicine')) return <Pill className="w-4 h-4 text-purple-400 flex-shrink-0" />;
    return <Bell className="w-4 h-4 text-cyan-400 flex-shrink-0" />;
  };

  return (
    <header className="h-16 bg-slate-900/80 backdrop-blur-xl border-b border-slate-700/50 flex items-center justify-between px-6 sticky top-0 z-30">
      <h2 className="text-lg font-semibold text-white">{title || 'Dashboard'}</h2>

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search..."
            className="w-56 pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        {/* Notifications Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="relative p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800/60"
            title="Patient Requests & Alerts"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white animate-pulse">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="p-3.5 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-white">Patient Notifications</span>
                  {unreadCount > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                      {unreadCount} Pending
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setDropdownOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
                {unreadAlerts.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    <CheckCircle className="w-8 h-8 text-emerald-400/80 mx-auto mb-2" />
                    <p className="font-medium text-slate-300">All patient requests acknowledged!</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">No pending alerts at this moment.</p>
                  </div>
                ) : (
                  unreadAlerts.map((alt) => (
                    <div
                      key={alt.id}
                      className={`p-3 text-xs transition-colors hover:bg-slate-800/50 ${
                        alt.severity === 'CRITICAL' ? 'bg-red-500/10' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          {getAlertIcon(alt.alert_type, alt.severity, alt.message)}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-white">
                                {alt.patient_name || 'Patient'}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                (Rm {alt.room_number || 'N/A'})
                              </span>
                              <span
                                className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded ${
                                  alt.severity === 'CRITICAL'
                                    ? 'bg-red-500/30 text-red-300 font-extrabold'
                                    : alt.severity === 'HIGH'
                                    ? 'bg-purple-500/20 text-purple-300'
                                    : 'bg-amber-500/20 text-amber-300'
                                }`}
                              >
                                {alt.severity}
                              </span>
                            </div>
                            <p className="text-slate-300 text-[11px] mt-0.5 leading-snug">
                              {alt.message}
                            </p>
                            <span className="text-[10px] text-slate-500 mt-1 block">
                              {alt.created_at ? new Date(alt.created_at).toLocaleTimeString() : 'Just now'}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={(e) => handleAcknowledge(alt.id, e)}
                          className="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[10px] font-semibold whitespace-nowrap transition-colors flex-shrink-0"
                        >
                          Ack
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-2.5 bg-slate-800/80 border-t border-slate-700/60 text-center">
                <Link
                  to="/alerts"
                  onClick={() => setDropdownOpen(false)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  View All Alerts Queue <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User */}
        <div className="flex items-center gap-3 pl-4 border-l border-slate-700/50">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-medium text-white">{user?.name || 'User'}</p>
            <p className="text-[11px] text-slate-400">{user?.role || 'CAREGIVER'}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
