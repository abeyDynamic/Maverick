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
  full_name: string | null;
  loan_amount: number | null;
  dbr_percent: number | null;
  saved_at: string;
}

export default function Dashboard() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [qualifications, setQualifications] = useState<QualRow[]>([]);

  useEffect(() => {
    if (!user) return;

    async function load() {
      // Fetch applicants with saved results summary
      const { data: apps } = await supabase
        .from('applicants')
        .select('id, created_at, full_name, dbr_pct, approved_count, cost_comparison')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(20) as any;

      if (!apps) { setQualifications([]); return; }

      // For each applicant, get loan_amount from property_details and top bank from cost_comparison
      const rows: QualRow[] = await Promise.all(
        (apps as any[]).map(async (a: any) => {
          const { data: pd } = await supabase
            .from('property_details')
            .select('loan_amount')
            .eq('applicant_id', a.id)
            .limit(1)
            .single();

          // Extract top ranked bank from cost_comparison jsonb
          let topBank: string | null = null;
          if (Array.isArray(a.cost_comparison) && a.cost_comparison.length > 0) {
            const sorted = [...a.cost_comparison].sort((x: any, y: any) => (x.rank ?? 99) - (y.rank ?? 99));
            topBank = sorted[0]?.bank_name ?? null;
          }

          return {
            id: a.id,
            created_at: a.created_at,
            full_name: a.full_name ?? null,
            loan_amount: pd?.loan_amount ?? null,
            dbr_pct: a.dbr_pct ?? null,
            approved_count: a.approved_count ?? null,
            top_bank: topBank,
          };
        })
      );

      setQualifications(rows);
    }

    load();
  }, [user]);

  const count = qualifications.length;

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
                          {q.full_name || 'Unnamed Client'}
                        </p>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                          {q.loan_amount != null && (
                            <span>AED {formatCurrency(q.loan_amount)}</span>
                          )}
                          {q.dbr_pct != null && (
                            <span>DBR: <strong className="text-foreground">{Number(q.dbr_pct).toFixed(1)}%</strong></span>
                          )}
                          {q.approved_count != null && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {q.approved_count} approved
                            </Badge>
                          )}
                          {q.top_bank && (
                            <span className="flex items-center gap-1">
                              <Trophy className="h-3 w-3 text-yellow-500" />
                              <strong className="text-foreground">{q.top_bank}</strong>
                            </span>
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
