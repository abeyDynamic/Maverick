import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, LogOut, Shield } from 'lucide-react';
import { formatCurrency } from '@/lib/mortgage-utils';

interface QualRow {
  id: string;
  created_at: string;
  client_name: string | null;
  residency_status: string | null;
  nationality: string | null;
  employment_type: string | null;
  loan_amount: number | null;
  dbr_pct: number | null;
  approved_count: number | null;
}

export default function Dashboard() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [qualifications, setQualifications] = useState<QualRow[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    async function load() {
      // Fetch applicants with property details for loan amount
      const { data: apps } = await supabase
        .from('applicants')
        .select('id, created_at, client_name, residency_status, nationality, employment_type')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!apps) { setQualifications([]); setCount(0); return; }

      // For each applicant, fetch property details for loan_amount
      const rows: QualRow[] = await Promise.all(
        (apps as any[]).map(async (a) => {
          const { data: pd } = await supabase
            .from('property_details')
            .select('loan_amount')
            .eq('applicant_id', a.id)
            .limit(1)
            .single();

          return {
            id: a.id,
            created_at: a.created_at,
            client_name: a.client_name ?? null,
            residency_status: a.residency_status,
            nationality: a.nationality,
            employment_type: a.employment_type,
            loan_amount: pd?.loan_amount ?? null,
            dbr_pct: null, // Could be computed but expensive per row
            approved_count: null,
          };
        })
      );

      setQualifications(rows);
      setCount(rows.length);
    }

    load();
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
            <CardContent><p className="text-3xl font-bold text-primary">{qualifications.filter(a => {
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
            {qualifications.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">No qualifications yet. Start your first one!</p>
            ) : (
              <div className="space-y-3">
                {qualifications.map(q => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between rounded-lg border p-4 hover:bg-secondary cursor-pointer transition-colors"
                    onClick={() => navigate(`/qualify/${q.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-accent" />
                      <div>
                        <p className="font-medium text-primary">
                          {q.client_name || q.nationality || 'Unknown Client'}
                        </p>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          {q.loan_amount && (
                            <span>AED {formatCurrency(q.loan_amount)}</span>
                          )}
                          <span>{new Date(q.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">Open</Button>
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
