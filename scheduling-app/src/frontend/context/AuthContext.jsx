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
  // The returned user carries mustChangePassword; callers route accordingly.
  const login = useCallback(async (username, password) => {
    const { token, user } = await authApi.login(username, password);
    setToken(token);
    setUser(user);
    return user;
  }, []);

  // Set a new password (forced first-login change or voluntary). Updates the
  // in-memory user so mustChangePassword clears and the app unblocks. The
  // server also returns a replacement token: changing the password retires all
  // previously-issued tokens, so we must swap ours in or the very next request
  // would 401.
  const changePassword = useCallback(async (newPassword, currentPassword) => {
    const { token, user } = await authApi.changePassword(newPassword, currentPassword);
    if (token) setToken(token);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, changePassword, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
