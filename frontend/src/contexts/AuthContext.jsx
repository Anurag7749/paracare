import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('paracare_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('paracare_token'));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) connectSocket(token);
    return () => disconnectSocket();
  }, [token]);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const res = await authAPI.login({ email, password });
      const { access_token, user: userData } = res.data.data;
      localStorage.setItem('paracare_token', access_token);
      localStorage.setItem('paracare_user', JSON.stringify(userData));
      setToken(access_token);
      setUser(userData);
      connectSocket(access_token);
      return userData;
    } finally { setLoading(false); }
  };

  const register = async ({ name, email, password, phone, whatsapp_number }) => {
    setLoading(true);
    try {
      // Note: the backend always creates a CAREGIVER account through this
      // public endpoint, regardless of any role field - ADMIN accounts
      // cannot be self-registered.
      const res = await authAPI.register({ name, email, password, phone, whatsapp_number });
      const { access_token, user: userData } = res.data.data;
      localStorage.setItem('paracare_token', access_token);
      localStorage.setItem('paracare_user', JSON.stringify(userData));
      setToken(access_token);
      setUser(userData);
      connectSocket(access_token);
      return userData;
    } finally { setLoading(false); }
  };

  const logout = () => {
    localStorage.removeItem('paracare_token');
    localStorage.removeItem('paracare_user');
    disconnectSocket();
    setToken(null);
    setUser(null);
  };

  const isAdmin = user?.role === 'ADMIN';
  const isCaregiver = user?.role === 'CAREGIVER';

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading, isAdmin, isCaregiver, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
