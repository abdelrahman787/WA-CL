import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { RoleProvider, useRole, type UserRole } from './hooks/useRole';
import { ErrorBoundary } from './components/ErrorBoundary';
import './App.css';

const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const InternalLogin = lazy(() => import('./pages/InternalLogin').then(m => ({ default: m.InternalLogin })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Sessions = lazy(() => import('./pages/Sessions').then(m => ({ default: m.Sessions })));
const Webhooks = lazy(() => import('./pages/Webhooks').then(m => ({ default: m.Webhooks })));
const Logs = lazy(() => import('./pages/Logs').then(m => ({ default: m.Logs })));
const ApiKeys = lazy(() => import('./pages/ApiKeys').then(m => ({ default: m.ApiKeys })));
const MessageTester = lazy(() => import('./pages/MessageTester').then(m => ({ default: m.MessageTester })));
const Infrastructure = lazy(() => import('./pages/Infrastructure').then(m => ({ default: m.Infrastructure })));
const Plugins = lazy(() => import('./pages/Plugins'));
const ImportWizard = lazy(() => import('./pages/Import/ImportWizard'));
const ImportHistory = lazy(() => import('./pages/Import/ImportHistory'));
const ChatViewer = lazy(() => import('./pages/Import/ChatViewer'));
const ChatPage = lazy(() => import('./pages/Chat/ChatPage'));
const Users = lazy(() => import('./pages/Users'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
});

interface InternalUser { id: string; username: string; displayName: string; role: string }

const loadingFallback = (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
    <Loader2 className="animate-spin" size={32} />
  </div>
);

function AdminShell() {
  const savedKey = sessionStorage.getItem('openwa_api_key');
  const [isAuthenticated, setIsAuthenticated] = useState(!!savedKey);
  const [, setApiKey] = useState(savedKey || '');
  const { setRole, role } = useRole();

  const handleLogin = async (key: string) => {
    setApiKey(key);
    sessionStorage.setItem('openwa_api_key', key);
    try {
      const response = await fetch('/api/auth/validate', {
        method: 'POST', headers: { 'X-API-Key': key },
      });
      if (response.ok) {
        const data = await response.json();
        setRole(data.role as UserRole);
      }
    } catch {
      setRole('viewer');
    }
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setApiKey('');
    setIsAuthenticated(false);
    setRole(null);
    sessionStorage.removeItem('openwa_api_key');
  };

  useEffect(() => {
    if (!savedKey) return;
    fetch('/api/auth/validate', { method: 'POST', headers: { 'X-API-Key': savedKey } })
      .then(res => res.json())
      .then(data => { if (data.valid && data.role) setRole(data.role as UserRole); })
      .catch(() => {});
  }, [savedKey, setRole]);

  if (!isAuthenticated) {
    return <Suspense fallback={loadingFallback}><Login onLogin={handleLogin} /></Suspense>;
  }

  return (
    <Suspense fallback={loadingFallback}>
      <Routes>
        <Route path="/" element={<Layout onLogout={handleLogout} userRole={role} />}>
          <Route index element={<Dashboard />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="webhooks" element={<Webhooks />} />
          {role === 'admin' && <Route path="api-keys" element={<ApiKeys />} />}
          <Route path="logs" element={<Logs />} />
          <Route path="message-tester" element={<MessageTester />} />
          <Route path="infrastructure" element={<Infrastructure />} />
          {role === 'admin' && <Route path="plugins" element={<Plugins />} />}
          {role === 'admin' && <Route path="users" element={<Users />} />}
          <Route path="import" element={<ImportWizard />} />
          <Route path="import/history" element={<ImportHistory />} />
          <Route path="chats/:chatId" element={<ChatViewer />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function ChatShell() {
  const savedUserStr = sessionStorage.getItem('owa_user');
  const [user, setUser] = useState<InternalUser | null>(savedUserStr ? JSON.parse(savedUserStr) : null);

  // Verify the JWT cookie is still valid; clear stale local state if not.
  useEffect(() => {
    if (!user) return;
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('unauth'))))
      .catch(() => {
        sessionStorage.removeItem('owa_user');
        setUser(null);
      });
  }, [user]);

  if (!user) {
    return <Suspense fallback={loadingFallback}><InternalLogin onLogin={setUser} /></Suspense>;
  }
  return <Suspense fallback={loadingFallback}><ChatPage /></Suspense>;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RoleProvider>
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                {/* Internal users land here */}
                <Route path="/" element={<ChatShell />} />
                <Route path="/chat" element={<ChatShell />} />
                {/* Admin / API-key dashboard lives under /admin */}
                <Route path="/admin/*" element={<AdminShell />} />
                <Route path="/legacy-login" element={<AdminShell />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </RoleProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
