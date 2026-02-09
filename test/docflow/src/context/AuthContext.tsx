import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, authStorage, type AuthUser } from '../services/api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, fullName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => authStorage.getUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = authStorage.getToken();
    if (!token) {
      authStorage.clearUser();
      setUser(null);
      setLoading(false);
      return;
    }

    if (user) {
      setLoading(false);
      return;
    }

    authApi.me()
      .then((me) => {
        authStorage.setUser(me);
        setUser(me);
      })
      .catch(() => {
        authStorage.clearAll();
      })
      .finally(() => setLoading(false));
  }, [user]);

  const login = async (username: string, password: string) => {
    const result = await authApi.login(username, password);
    authStorage.setToken(result.access_token);
    authStorage.setUser(result.user);
    setUser(result.user);
  };

  const register = async (username: string, password: string, fullName?: string) => {
    const result = await authApi.register(username, password, fullName);
    authStorage.setToken(result.access_token);
    authStorage.setUser(result.user);
    setUser(result.user);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors
    } finally {
      authStorage.clearAll();
      setUser(null);
    }
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
