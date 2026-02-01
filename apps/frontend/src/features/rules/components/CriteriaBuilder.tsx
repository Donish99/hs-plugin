import { DormancyCriterion } from '@/api/endpoints/rules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';

interface CriteriaBuilderProps {
  criteria: DormancyCriterion[];
  onChange: (criteria: DormancyCriterion[]) => void;
}

const fieldOptions = [
  { value: 'lifecyclestage', label: 'Lifecycle Stage' },
  { value: 'hs_lead_status', label: 'Lead Status' },
  { value: 'jobtitle', label: 'Job Title' },
  { value: 'industry', label: 'Industry' },
  { value: 'annualrevenue', label: 'Annual Revenue' },
  { value: 'numberofemployees', label: 'Number of Employees' },
  { value: 'hs_analytics_num_page_views', label: 'Page Views' },
  { value: 'hs_analytics_num_visits', label: 'Website Visits' },
  { value: 'hs_email_open', label: 'Email Opens' },
  { value: 'hubspotscore', label: 'HubSpot Score' },
  { value: 'country', label: 'Country' },
  { value: 'state', label: 'State/Region' },
  { value: 'city', label: 'City' },
];

const operatorOptions = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'greater_than', label: 'is greater than' },
  { value: 'less_than', label: 'is less than' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
];

export function CriteriaBuilder({ criteria, onChange }: CriteriaBuilderProps) {
  const addCriterion = () => {
    onChange([
      ...criteria,
      { field: 'lifecyclestage', operator: 'equals', value: '' },
    ]);
  };

  const updateCriterion = (index: number, updates: Partial<DormancyCriterion>) => {
    const newCriteria = [...criteria];
    newCriteria[index] = { ...newCriteria[index], ...updates };
    onChange(newCriteria);
  };

  const removeCriterion = (index: number) => {
    onChange(criteria.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Additional Criteria</h4>
        <Button type="button" variant="outline" size="sm" onClick={addCriterion}>
          <Plus className="mr-1 h-4 w-4" />
          Add Criterion
        </Button>
      </div>

      {criteria.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">
          No additional criteria. Click "Add Criterion" to filter leads by specific properties.
        </p>
      ) : (
        <div className="space-y-3">
          {criteria.map((criterion, index) => (
            <div
              key={index}
              className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3"
            >
              <Select
                value={criterion.field}
                onValueChange={(value) => updateCriterion(index, { field: value })}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {fieldOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={criterion.operator}
                onValueChange={(value) =>
                  updateCriterion(index, {
                    operator: value as DormancyCriterion['operator'],
                  })
                }
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Select operator" />
                </SelectTrigger>
                <SelectContent>
                  {operatorOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                placeholder="Value"
                value={criterion.value.toString()}
                onChange={(e) => updateCriterion(index, { value: e.target.value })}
                className="flex-1"
              />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeCriterion(index)}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {criteria.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Leads must match ALL criteria to be detected by this rule.
        </p>
      )}
    </div>
  );
}
