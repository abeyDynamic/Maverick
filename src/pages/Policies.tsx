import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from '@/components/ui/pagination';
import { ArrowLeft, Database, FileText, AlertTriangle, FileWarning, Building2, LogOut, Settings, TrendingUp } from 'lucide-react';
import GlobalTickerBar from '@/components/GlobalTickerBar';
import { usePolicySearch } from '@/hooks/usePolicySearch';
import { applyClientFilters } from '@/lib/policies/policyFilters';
import { EMPTY_FILTERS, PolicyFiltersState, PolicyTerm, SORT_OPTIONS, SortKey } from '@/lib/policies/policyTypes';
import { getPolicyStatus } from '@/components/policies/PolicyStatusBadge';
import PolicySearchBar from '@/components/policies/PolicySearchBar';
import PolicyQuickChips from '@/components/policies/PolicyQuickChips';
import PolicyFilters from '@/components/policies/PolicyFilters';
import PolicyResultsTable from '@/components/policies/PolicyResultsTable';
import PolicyDetailDrawer from '@/components/policies/PolicyDetailDrawer';
import SavedSearches from '@/components/policies/SavedSearches';

function StatCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number | string; tone?: string }) {
  return (
    <div className="surface p-4 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-md flex items-center justify-center ${tone ?? 'bg-muted text-foreground'}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

export default function Policies() {
  const navigate = useNavigate();
  const { user, role, signOut } = useAuth();
  const { rows, loading, error } = usePolicySearch();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<PolicyFiltersState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>('relevance');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<PolicyTerm | null>(null);

  const filtered = useMemo(
    () => applyClientFilters(rows, search, filters, sort),
    [rows, search, filters, sort],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const stats = useMemo(() => {
    let clean = 0, needs = 0, formula = 0;
    const banks = new Set<string>();
    rows.forEach((r) => {
      const s = getPolicyStatus(r).label;
      if (s === 'Clean') clean++;
      else if (s === 'Needs Review') needs++;
      else if (s === 'Formula Needs Update') formula++;
      if (r.bank) banks.add(r.bank);
    });
    return { total: rows.length, clean, needs, formula, banks: banks.size };
  }, [rows]);

  function clear() {
    setFilters(EMPTY_FILTERS);
    setSearch('');
    setPage(1);
  }

  function applySaved(s: string, f: PolicyFiltersState) {
    setSearch(s);
    setFilters({ ...EMPTY_FILTERS, ...f });
    setPage(1);
  }

  return (
    <div className="min-h-screen bg-background">
      <header style={{ background: 'hsl(216,75%,12%)' }} className="text-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-white/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">Maverick</h1>
              <p className="text-[10px] text-white/40 -mt-0.5 uppercase tracking-widest">Bank Policy Search</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm"
              className="text-white/60 hover:text-white hover:bg-white/10 h-8 px-3 text-xs"
              onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Dashboard
            </Button>
            <span className="text-[11px] text-white/40 mx-2">
              {user?.email} · <span className="capitalize">{role}</span>
            </span>
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

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        {/* Page heading */}
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Bank Policy Search</h2>
          <p className="text-sm text-muted-foreground">
            Search, filter and review bank policy terms from the master policy matrix.
          </p>
        </div>

        {/* Data quality */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard icon={Database} label="Total terms" value={stats.total.toLocaleString()} tone="bg-primary/10 text-primary" />
          <StatCard icon={FileText} label="Clean" value={stats.clean.toLocaleString()} tone="bg-emerald-50 text-emerald-700" />
          <StatCard icon={AlertTriangle} label="Needs review" value={stats.needs.toLocaleString()} tone="bg-amber-50 text-amber-700" />
          <StatCard icon={FileWarning} label="Formula needs update" value={stats.formula.toLocaleString()} tone="bg-orange-50 text-orange-700" />
          <StatCard icon={Building2} label="Banks covered" value={stats.banks} tone="bg-muted text-foreground" />
        </div>

        {/* Search + chips */}
        <div className="space-y-3">
          <PolicySearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} />
          <PolicyQuickChips
            active={filters.quickChip}
            onChange={(k) => { setFilters((f) => ({ ...f, quickChip: k })); setPage(1); }}
          />
        </div>

        {/* Filters */}
        <PolicyFilters
          rows={rows}
          filters={filters}
          onChange={(f) => { setFilters(f); setPage(1); }}
          onClear={clear}
        />

        {/* Saved searches */}
        <SavedSearches search={search} filters={filters} onApply={applySaved} />

        {/* Results summary + sort + page size */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            {loading ? 'Searching policy database…' :
              error ? <span className="text-destructive">Could not load policy data. Please try again.</span> :
              <>Showing <span className="font-semibold text-foreground">{pageRows.length}</span> of <span className="font-semibold text-foreground">{filtered.length}</span> results</>}
          </p>
          <div className="flex items-center gap-2">
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-9 w-[180px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-9 w-[100px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="surface p-12 text-center text-sm text-muted-foreground">Searching policy database…</div>
        ) : error ? (
          <div className="surface p-12 text-center text-sm text-destructive">Could not load policy data. Please try again.</div>
        ) : filtered.length === 0 ? (
          <div className="surface p-12 text-center text-sm text-muted-foreground">
            No policy terms found. Try clearing filters or searching a broader term.
          </div>
        ) : (
          <>
            <PolicyResultsTable rows={pageRows} onSelect={setSelected} />
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setPage(Math.max(1, safePage - 1)); }} />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#" isActive>{safePage} / {totalPages}</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext href="#" onClick={(e) => { e.preventDefault(); setPage(Math.min(totalPages, safePage + 1)); }} />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </>
        )}

        {/* Explanations */}
        <div className="grid md:grid-cols-2 gap-3 text-xs text-muted-foreground">
          <div className="surface p-3">
            <p className="font-semibold text-foreground mb-1">Needs Review</p>
            Rows marked Needs Review are searchable and usable for adviser reference, but may have missing descriptions or metadata.
          </div>
          <div className="surface p-3">
            <p className="font-semibold text-foreground mb-1">Formula Needs Update</p>
            Rows marked Formula Needs Update contain spreadsheet formulas such as =SUM(...). They should not be treated as confirmed values until updated.
          </div>
        </div>
      </main>

      <PolicyDetailDrawer
        policy={selected}
        onClose={() => setSelected(null)}
        onFilterBank={(bank) => { setFilters({ ...EMPTY_FILTERS, bank: [bank] }); setSearch(''); setPage(1); setSelected(null); }}
        onFilterAttribute={(attr) => { setFilters({ ...EMPTY_FILTERS, canonical_attribute: [attr] }); setSearch(''); setPage(1); setSelected(null); }}
      />
    </div>
  );
}
