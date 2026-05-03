import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PolicyTerm } from '@/lib/policies/policyTypes';
import PolicyStatusBadge from './PolicyStatusBadge';
import { Button } from '@/components/ui/button';
import { Copy, Flag, Filter } from 'lucide-react';
import { toast } from 'sonner';
import PolicyNoteForm from './PolicyNoteForm';
import { useState } from 'react';
import PolicyFlagDialog from './PolicyFlagDialog';

interface Props {
  policy: PolicyTerm | null;
  onClose: () => void;
  onFilterBank: (bank: string) => void;
  onFilterAttribute: (attr: string) => void;
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground mt-0.5 break-words">{value ?? '—'}</p>
    </div>
  );
}

export default function PolicyDetailDrawer({ policy, onClose, onFilterBank, onFilterAttribute }: Props) {
  const [flagOpen, setFlagOpen] = useState(false);
  const [defaultFlag, setDefaultFlag] = useState<string | undefined>();

  function flag(type: string) {
    setDefaultFlag(type);
    setFlagOpen(true);
  }

  return (
    <Sheet open={!!policy} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {policy && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {policy.bank} <PolicyStatusBadge policy={policy} />
              </SheetTitle>
              <p className="text-xs text-muted-foreground">{policy.canonical_attribute ?? policy.raw_attribute}</p>
            </SheetHeader>

            <div className="mt-4 space-y-4">
              <section className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identification</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Policy Ref" value={policy.policy_ref} />
                  <Field label="Bank" value={policy.bank} />
                  <Field label="Segment" value={policy.segment} />
                  <Field label="Employment Type" value={policy.employment_type} />
                  <Field label="Product Variant" value={policy.product_variant} />
                  <Field label="Source Tab" value={policy.source_tab} />
                </div>
              </section>

              <section className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attribute</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Raw Attribute" value={policy.raw_attribute} />
                  <Field label="Canonical Attribute" value={policy.canonical_attribute} />
                  <Field label="Policy Category" value={policy.policy_category} />
                  <Field label="Target Module" value={policy.target_module} />
                </div>
                <Field label="Description" value={policy.attribute_description} />
              </section>

              <section className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Value</h4>
                <Field label="Value" value={policy.value} />
                <Field label="Normalized Value" value={policy.normalized_value} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Value Status" value={policy.value_status} />
                  <Field label="Data Status" value={policy.data_status} />
                </div>
                <Field label="Cleaning Notes" value={policy.cleaning_notes} />
              </section>

              <section className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meta</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Ready for Search" value={String(policy.ready_for_search ?? false)} />
                  <Field label="Ready for Rule Engine" value={String(policy.ready_for_rule_engine ?? false)} />
                  <Field label="Created" value={policy.created_at?.slice(0,10)} />
                  <Field label="Updated" value={policy.updated_at?.slice(0,10)} />
                </div>
              </section>

              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</h4>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => {
                    const text = `${policy.bank} | ${policy.canonical_attribute ?? policy.raw_attribute}: ${policy.normalized_value ?? policy.value ?? ''}`;
                    navigator.clipboard.writeText(text);
                    toast.success('Copied');
                  }}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy policy
                  </Button>
                  {policy.bank && (
                    <Button size="sm" variant="outline" onClick={() => onFilterBank(policy.bank!)}>
                      <Filter className="h-3.5 w-3.5 mr-1" /> All for this bank
                    </Button>
                  )}
                  {policy.canonical_attribute && (
                    <Button size="sm" variant="outline" onClick={() => onFilterAttribute(policy.canonical_attribute!)}>
                      <Filter className="h-3.5 w-3.5 mr-1" /> All for this attribute
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    ['outdated','Flag outdated'],
                    ['unclear','Flag unclear'],
                    ['incorrect','Flag incorrect'],
                    ['duplicate','Flag duplicate'],
                    ['important','Flag important'],
                    ['convert_to_rule','Convert to rule'],
                    ['needs_bank_confirmation','Needs bank confirmation'],
                  ].map(([t,l]) => (
                    <Button key={t} size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => flag(t)}>
                      <Flag className="h-3 w-3 mr-1" /> {l}
                    </Button>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add note</h4>
                <PolicyNoteForm policy={policy} />
              </section>
            </div>

            <PolicyFlagDialog open={flagOpen} onOpenChange={setFlagOpen} policy={policy} defaultType={defaultFlag} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
