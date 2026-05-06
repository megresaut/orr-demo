import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const data = await api.get('/api/auth/me');
      setUser(data.user); setOrg(data.organization);
    } catch { setUser(null); setOrg(null); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  async function login(email, password) {
    const data = await api.post('/api/auth/login', { email, password });
    setUser(data.user); setOrg(data.organization);
  }
  async function signup(form) {
    const data = await api.post('/api/auth/signup', form);
    setUser(data.user); setOrg(data.organization);
  }
  async function logout() {
    await api.post('/api/auth/logout');
    setUser(null); setOrg(null);
  }

  return (
    <AuthCtx.Provider value={{ user, org, loading, login, signup, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
