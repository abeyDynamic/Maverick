import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, FileText, LogOut, Shield } from 'lucide-react';

interface Applicant {
  id: string;
  created_at: string;
  residency_status: string | null;
  nationality: string | null;
  employment_type: string | null;
}

export default function Dashboard() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('applicants')
      .select('id, created_at, residency_status, nationality, employment_type')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setApplicants(data || []);
        setCount(data?.length || 0);
      });
  }, [user]);

  return (
    <div className="min-h-screen bg-secondary">
      <header className="bg-primary text-primary-foreground">
        <div className="container mx-auto flex items-center justify-between py-4 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent">
              <span className="text-sm font-bold text-accent-foreground">K²</span>
            </div>
            <h1 className="text-xl font-semibold">KSquare Mortgage Engine</h1>
          </div>
          <div className="flex items-center gap-3">
            {role === 'admin' && (
              <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-accent" onClick={() => navigate('/admin')}>
                <Shield className="mr-1 h-4 w-4" /> Admin
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-accent" onClick={signOut}>
              <LogOut className="mr-1 h-4 w-4" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-primary">Dashboard</h2>
            <p className="text-muted-foreground">Welcome back, {user?.email}</p>
          </div>
          <Button onClick={() => navigate('/qualify/new')} className="bg-accent text-accent-foreground hover:bg-mid-blue">
            <Plus className="mr-2 h-4 w-4" /> New Qualification
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card className="bg-background">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Qualifications</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold text-primary">{count}</p></CardContent>
          </Card>
          <Card className="bg-background">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">This Month</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold text-primary">{applicants.filter(a => {
              const d = new Date(a.created_at);
              const now = new Date();
              return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            }).length}</p></CardContent>
          </Card>
          <Card className="bg-background">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Role</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold text-accent capitalize">{role || 'adviser'}</p></CardContent>
          </Card>
        </div>

        <Card className="bg-background">
          <CardHeader>
            <CardTitle className="text-lg text-primary">Recent Qualifications</CardTitle>
          </CardHeader>
          <CardContent>
            {applicants.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">No qualifications yet. Start your first one!</p>
            ) : (
              <div className="space-y-3">
                {applicants.map(a => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border p-4 hover:bg-secondary cursor-pointer transition-colors" onClick={() => navigate(`/qualify/${a.id}`)}>
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-accent" />
                      <div>
                        <p className="font-medium text-primary">{a.nationality || 'Unknown'} — {a.employment_type || 'N/A'}</p>
                        <p className="text-sm text-muted-foreground">{a.residency_status?.replace('_', ' ') || 'N/A'} • {new Date(a.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">View</Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
