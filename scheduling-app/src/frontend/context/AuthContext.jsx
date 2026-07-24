import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, getToken, setToken, UNAUTHORIZED_EVENT } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // True only while we're restoring an existing session on a page load, so
  // ProtectedRoute doesn't bounce to /login before /auth/me comes back.
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  // Restore the session from a stored token on mount.
  useEffect(() => {
    if (!getToken()) return;
    authApi.me()
      .then(({ user }) => setUser(user))
      .catch(() => { setToken(null); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  // Any API call that gets a 401 (expired/invalid token) drops the session.
  useEffect(() => {
    function onUnauthorized() { setUser(null); }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  // Throws with the server's message on bad credentials — callers surface it.
  const login = useCallback(async (email, password) => {
    const { token, user } = await authApi.login(email, password);
    setToken(token);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
