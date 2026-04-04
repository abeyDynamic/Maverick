import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  return user ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />;
}
