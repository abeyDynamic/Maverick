import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import GlobalTickerBar from '@/components/GlobalTickerBar';
import DashboardEiborChart from '@/components/dashboard/DashboardEiborChart';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/mortgage-utils';
import { format } from 'date-fns';
import { Plus, FileText, Settings, LogOut, TrendingUp, BookOpen } from 'lucide-react';

interface RecentCase {
  id: string;
  full_name: string | null;
  created_at: string;
  latest_dbr: number | null;
  loan_amount: number | null;
}

export default function Dashboard() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [cases, setCases] = useState<RecentCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('applicants')
        .select(`
          id, full_name, created_at,
          qualification_results (loan_amount, dbr_percent)
        `)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(10);

      const mapped = (data ?? []).map((a: any) => {
        const latest = a.qualification_results?.[a.qualification_results.length - 1];
        return {
          id: a.id,
          full_name: a.full_name,
          created_at: a.created_at,
          latest_dbr: latest?.dbr_percent ?? null,
          loan_amount: latest?.loan_amount ?? null,
        };
      });
      setCases(mapped);
      setLoading(false);
    }
    if (user) load();
  }, [user]);

  const dbrColor = (dbr: number | null) => {
    if (!dbr) return 'text-muted-foreground';
    if (dbr < 42) return 'text-[hsl(174,85%,30%)]';
    if (dbr <= 50) return 'text-amber-600';
    return 'text-red-500';
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header style={{ background: 'hsl(216,75%,12%)' }} className="text-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-white/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">Maverick</h1>
              <p className="text-[10px] text-white/40 -mt-0.5 uppercase tracking-widest">KSquare Mortgages</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/40 mr-2">
              {user?.email} · <span className="capitalize">{role}</span>
            </span>
            <Button variant="ghost" size="sm"
              className="text-white/60 hover:text-white hover:bg-white/10 h-8 px-3 text-xs"
              onClick={() => navigate('/policies')}>
              <BookOpen className="h-3.5 w-3.5 mr-1.5" /> Policies
            </Button>
            {role === 'admin' && (
              <Button variant="ghost" size="sm"
                className="text-white/60 hover:text-white hover:bg-white/10 h-8 px-3 text-xs"
                onClick={() => navigate('/admin')}>
                <Settings className="h-3.5 w-3.5 mr-1.5" /> Admin
              </Button>
            )}
            <Button variant="ghost" size="sm"
              className="text-white/60 hover:text-white hover:bg-white/10 h-8 px-3 text-xs"
              onClick={signOut}>
              <LogOut className="h-3.5 w-3.5 mr-1.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <GlobalTickerBar />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-3 gap-6">

          {/* Left — Cases */}
          <div className="col-span-1 space-y-5">
            {/* New qualification CTA */}
            <div className="result-panel">
              <p className="result-panel-eyebrow">Qualification Engine</p>
              <p className="text-white text-lg font-semibold mt-1 mb-1">
                Start a new case
              </p>
              <p className="text-white/50 text-[12px] mb-5">
                Check eligibility across 8 UAE banks instantly.
              </p>
              <button
                onClick={() => navigate('/qualify/new')}
                className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{ background: 'hsl(174,85%,32%)', color: 'white' }}
              >
                <Plus className="inline h-4 w-4 mr-1.5 -mt-0.5" />
                New Qualification
              </button>
            </div>

            {/* Recent cases */}
            <div>
              <div className="form-section-title mb-3">
                <span>Recent Cases</span>
              </div>
              {loading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-16 rounded-lg bg-border/40 animate-pulse" />
                  ))}
                </div>
              ) : cases.length === 0 ? (
                <div className="surface p-6 text-center">
                  <FileText className="h-8 w-8 text-border mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No cases yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cases.map(c => (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/qualify/${c.id}`)}
                      className="w-full surface p-3.5 text-left hover:border-[hsl(213,65%,30%)] transition-colors group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {c.full_name || 'Unnamed case'}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {format(new Date(c.created_at), 'dd MMM yyyy')}
                            {c.loan_amount ? ` · AED ${formatCurrency(c.loan_amount)}` : ''}
                          </p>
                        </div>
                        {c.latest_dbr !== null && (
                          <div className="text-right flex-shrink-0 ml-3">
                            <p className={`text-sm font-mono font-semibold ${dbrColor(c.latest_dbr)}`}>
                              {c.latest_dbr.toFixed(1)}%
                            </p>
                            <p className="text-[10px] text-muted-foreground">DBR</p>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right — EIBOR chart */}
          <div className="col-span-2">
            <div className="form-section-title mb-4">
              <span>EIBOR Rate History</span>
            </div>
            <DashboardEiborChart />
          </div>

        </div>
      </main>
    </div>
  );
}
