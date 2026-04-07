import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Edit, CheckCircle2, XCircle, Trophy } from 'lucide-react';
import { formatCurrency } from '@/lib/mortgage-utils';
import { cn } from '@/lib/utils';
import QualifyNew from './QualifyNew';

interface SavedBankResult {
  bank_name: string;
  stress_rate: number;
  monthly_emi: number;
  dbr_percent: number;
  dbr_limit: number;
  min_salary_met: boolean;
  eligible: boolean;
  product_rate: number | null;
  fixed_period: string | null;
  qualification_notes_count: number;
}

interface SavedCostEntry {
  bank_name: string;
  nominal_rate: number;
  monthly_emi: number;
  life_ins: number;
  prop_ins: number;
  total_monthly: number;
  fixed_period_total: number;
  upfront_costs: number;
  grand_total: number;
  rank: number;
}

interface SavedData {
  id: string;
  full_name: string | null;
  created_at: string;
  bank_results: SavedBankResult[] | null;
  cost_comparison: SavedCostEntry[] | null;
  dbr_pct: number | null;
  approved_count: number | null;
  property_value: number | null;
  loan_amount: number | null;
  ltv: number | null;
  emirate: string;
  preferred_tenor_months: number;
}

const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
const RANK_COLORS = [
  'bg-yellow-500 text-yellow-950',
  'bg-zinc-300 text-zinc-800',
  'bg-amber-700 text-amber-50',
];

function formatDbrLimit(val: number): string {
  const rounded = Math.round(val * 100) / 100;
  return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2);
}

export default function QualifyEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [savedData, setSavedData] = useState<SavedData | null>(null);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (!id) return;
    async function load() {
      setLoading(true);
      const [appRes, propRes] = await Promise.all([
        supabase.from('applicants').select('id, full_name, created_at, bank_results, cost_comparison, dbr_pct, approved_count').eq('id', id).single(),
        supabase.from('property_details').select('property_value, loan_amount, ltv, emirate, preferred_tenor_months').eq('applicant_id', id).single(),
      ]);

      const app = appRes.data as any;
      const prop = propRes.data as any;

      if (!app) {
        setSavedData(null);
        setLoading(false);
        return;
      }

      // If no saved results, go straight to edit mode
      if (!app.bank_results || !Array.isArray(app.bank_results) || app.bank_results.length === 0) {
        setEditMode(true);
        setLoading(false);
        return;
      }

      setSavedData({
        id: app.id,
        client_name: app.client_name,
        created_at: app.created_at,
        bank_results: app.bank_results,
        cost_comparison: app.cost_comparison,
        dbr_pct: app.dbr_pct,
        approved_count: app.approved_count,
        property_value: prop?.property_value ?? null,
        loan_amount: prop?.loan_amount ?? null,
        ltv: prop?.ltv ?? null,
        emirate: prop?.emirate ?? 'dubai',
        preferred_tenor_months: prop?.preferred_tenor_months ?? 300,
      });
      setLoading(false);
    }
    load();
  }, [id]);

  // Edit mode: render QualifyNew with pre-loaded data
  if (editMode) {
    return <QualifyNew editApplicantId={id} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center">
        <p className="text-muted-foreground">Loading saved results…</p>
      </div>
    );
  }

  if (!savedData) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center">
        <p className="text-destructive">Qualification not found.</p>
      </div>
    );
  }

  const bankResults = savedData.bank_results ?? [];
  const costComparison = (savedData.cost_comparison ?? []).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const approvedBanks = bankResults.filter(r => r.eligible);

  return (
    <div className="min-h-screen bg-secondary">
      <header className="bg-primary text-primary-foreground">
        <div className="container mx-auto flex items-center gap-4 py-4 px-6">
          <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary/80" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">Saved Results — {savedData.client_name || 'Client'}</h1>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-6">
        {/* Summary Bar */}
        <Card className="bg-background">
          <CardContent className="py-4 px-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <span className="font-semibold text-foreground">{savedData.client_name || 'Client'}</span>
                {savedData.loan_amount != null && (
                  <span className="text-muted-foreground">Loan: <strong className="text-foreground">AED {formatCurrency(savedData.loan_amount)}</strong></span>
                )}
                {savedData.property_value != null && (
                  <span className="text-muted-foreground">Property: <strong className="text-foreground">AED {formatCurrency(savedData.property_value)}</strong></span>
                )}
                {savedData.ltv != null && (
                  <span className="text-muted-foreground">LTV: <strong className="text-foreground">{savedData.ltv}%</strong></span>
                )}
                {savedData.dbr_pct != null && (
                  <span className="text-muted-foreground">DBR: <strong className="text-foreground">{Number(savedData.dbr_pct).toFixed(1)}%</strong></span>
                )}
                <span className="text-muted-foreground">Tenor: <strong className="text-foreground">{savedData.preferred_tenor_months}m</strong></span>
                <span className="text-muted-foreground">Saved: <strong className="text-foreground">{new Date(savedData.created_at).toLocaleDateString()}</strong></span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                <Edit className="h-4 w-4 mr-1" /> Edit & Recalculate
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Bank Eligibility from saved data */}
        <Card className="bg-background">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold text-primary">Bank Eligibility ({approvedBanks.length} approved / {bankResults.length} total)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Bank</TableHead>
                  <TableHead className="text-xs text-right">Stress Rate</TableHead>
                  <TableHead className="text-xs text-right">Stress EMI</TableHead>
                  <TableHead className="text-xs text-right">DBR %</TableHead>
                  <TableHead className="text-xs text-center">Min Salary</TableHead>
                  <TableHead className="text-xs text-center">Eligible</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankResults.map((r, i) => {
                  const rowBg = r.eligible
                    ? 'bg-green-50 dark:bg-green-950/20'
                    : 'bg-red-50 dark:bg-red-950/20';
                  return (
                    <TableRow key={i} className={rowBg}>
                      <TableCell className="font-medium text-xs py-2">{r.bank_name}</TableCell>
                      <TableCell className="text-right text-xs py-2">{r.stress_rate.toFixed(2)}%</TableCell>
                      <TableCell className="text-right text-xs py-2">AED {formatCurrency(Math.round(r.monthly_emi))}</TableCell>
                      <TableCell className="text-right text-xs py-2">
                        <span className={cn(
                          'font-semibold',
                          r.dbr_percent <= 42 ? 'text-green-600' : r.dbr_percent <= 50 ? 'text-amber-600' : 'text-red-600'
                        )}>
                          {r.dbr_percent.toFixed(1)}%
                        </span>
                        <span className="text-muted-foreground text-[10px] ml-1">/ {formatDbrLimit(r.dbr_limit)}%</span>
                      </TableCell>
                      <TableCell className="text-center py-2">
                        {r.min_salary_met
                          ? <CheckCircle2 className="inline h-3.5 w-3.5 text-green-600" />
                          : <XCircle className="inline h-3.5 w-3.5 text-red-600" />}
                      </TableCell>
                      <TableCell className="text-center py-2">
                        {r.eligible ? (
                          <Badge className="bg-green-600 text-white hover:bg-green-700 text-[10px] px-1.5 py-0">Approved</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Not Qualified</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Cost Comparison from saved data */}
        {costComparison.length > 0 && (
          <Card className="bg-background">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-semibold text-primary">Cost Comparison — Approved Banks</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs min-w-[140px]">Bank</TableHead>
                    <TableHead className="text-xs text-right">Rate</TableHead>
                    <TableHead className="text-xs text-right">EMI</TableHead>
                    <TableHead className="text-xs text-right">Life Ins</TableHead>
                    <TableHead className="text-xs text-right">Prop Ins</TableHead>
                    <TableHead className="text-xs text-right">Total Monthly</TableHead>
                    <TableHead className="text-xs text-right">Fixed Period</TableHead>
                    <TableHead className="text-xs text-right">Upfront</TableHead>
                    <TableHead className="text-xs text-right">Grand Total</TableHead>
                    <TableHead className="text-xs text-center">Rank</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costComparison.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-xs py-2">{c.bank_name}</TableCell>
                      <TableCell className="text-right text-xs py-2">{c.nominal_rate.toFixed(2)}%</TableCell>
                      <TableCell className="text-right text-xs py-2">AED {formatCurrency(c.monthly_emi)}</TableCell>
                      <TableCell className="text-right text-xs py-2">AED {formatCurrency(c.life_ins)}</TableCell>
                      <TableCell className="text-right text-xs py-2">AED {formatCurrency(c.prop_ins)}</TableCell>
                      <TableCell className="text-right text-xs py-2 font-semibold">AED {formatCurrency(c.total_monthly)}</TableCell>
                      <TableCell className="text-right text-xs py-2">AED {formatCurrency(c.fixed_period_total)}</TableCell>
                      <TableCell className="text-right text-xs py-2">AED {formatCurrency(c.upfront_costs)}</TableCell>
                      <TableCell className="text-right text-xs py-2 font-bold">AED {formatCurrency(c.grand_total)}</TableCell>
                      <TableCell className="text-center py-2">
                        <Badge className={cn('text-[10px] px-2 py-0.5', RANK_COLORS[c.rank] ?? 'bg-muted text-muted-foreground')}>
                          {RANK_LABELS[c.rank] ?? `${c.rank + 1}th`}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
