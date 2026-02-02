import { DormancyCriteria } from '@/api/endpoints/rules';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface CriteriaBuilderProps {
  criteria: DormancyCriteria;
  onChange: (criteria: DormancyCriteria) => void;
}

const criteriaFields = [
  {
    key: 'min_days_inactive' as const,
    label: 'Minimum Days Inactive',
    description: 'Days since last activity',
    type: 'number',
    min: 1,
    max: 365,
  },
  {
    key: 'no_email_opens_days' as const,
    label: 'No Email Opens (Days)',
    description: 'Days without opening any emails',
    type: 'number',
    min: 1,
    max: 365,
  },
  {
    key: 'no_email_clicks_days' as const,
    label: 'No Email Clicks (Days)',
    description: 'Days without clicking email links',
    type: 'number',
    min: 1,
    max: 365,
  },
  {
    key: 'no_website_visits_days' as const,
    label: 'No Website Visits (Days)',
    description: 'Days without visiting your website',
    type: 'number',
    min: 1,
    max: 365,
  },
  {
    key: 'min_lead_score' as const,
    label: 'Minimum Lead Score',
    description: 'Only target leads with score above this',
    type: 'number',
    min: 0,
    max: 100,
  },
];

export function CriteriaBuilder({ criteria, onChange }: CriteriaBuilderProps) {
  const updateField = (key: keyof DormancyCriteria, value: string) => {
    const numValue = value === '' ? undefined : parseInt(value, 10);
    onChange({
      ...criteria,
      [key]: isNaN(numValue as number) ? undefined : numValue,
    });
  };

  const updateArrayField = (key: 'deal_stages' | 'exclude_tags', value: string) => {
    const arrayValue = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    onChange({
      ...criteria,
      [key]: arrayValue.length > 0 ? arrayValue : undefined,
    });
  };

  const activeCount = Object.values(criteria).filter(
    (v) => v !== undefined && (Array.isArray(v) ? v.length > 0 : true)
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Set at least one condition. Leads must match ALL enabled criteria to be detected.
        </p>
        <Badge variant="secondary">{activeCount} active</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {criteriaFields.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            <Input
              id={field.key}
              type="number"
              min={field.min}
              max={field.max}
              placeholder="Not set"
              value={criteria[field.key] ?? ''}
              onChange={(e) => updateField(field.key, e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{field.description}</p>
          </div>
        ))}
      </div>

      <div className="space-y-4 pt-4 border-t">
        <div className="space-y-2">
          <Label htmlFor="deal_stages">Deal Stages (comma-separated)</Label>
          <Input
            id="deal_stages"
            placeholder="e.g., appointmentscheduled, qualifiedtobuy"
            value={criteria.deal_stages?.join(', ') ?? ''}
            onChange={(e) => updateArrayField('deal_stages', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Only target leads in these deal stages
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="exclude_tags">Exclude Tags (comma-separated)</Label>
          <Input
            id="exclude_tags"
            placeholder="e.g., do-not-contact, vip"
            value={criteria.exclude_tags?.join(', ') ?? ''}
            onChange={(e) => updateArrayField('exclude_tags', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Exclude leads with any of these tags
          </p>
        </div>
      </div>
    </div>
  );
}
