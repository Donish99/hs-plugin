import { useRules } from '@/api/hooks/useRules';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { LeadsListParams } from '@/api/endpoints/leads';

interface LeadsFiltersProps {
  filters: LeadsListParams;
  onFiltersChange: (filters: LeadsListParams) => void;
}

export function LeadsFilters({ filters, onFiltersChange }: LeadsFiltersProps) {
  const { data: rulesData } = useRules();

  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, search: value || undefined, page: 1 });
  };

  const handleRuleChange = (value: string) => {
    onFiltersChange({ ...filters, ruleId: value === 'all' ? undefined : value, page: 1 });
  };

  const handleSortChange = (value: string) => {
    const [sortBy, sortOrder] = value.split('-');
    onFiltersChange({
      ...filters,
      sortBy,
      sortOrder: sortOrder as 'asc' | 'desc',
      page: 1,
    });
  };

  const clearFilters = () => {
    onFiltersChange({ page: 1, limit: filters.limit });
  };

  const hasActiveFilters = filters.search || filters.ruleId;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or email..."
          value={filters.search || ''}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select value={filters.ruleId || 'all'} onValueChange={handleRuleChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Filter by rule" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Rules</SelectItem>
          {rulesData?.rules.map((rule) => (
            <SelectItem key={rule.id} value={rule.id}>
              {rule.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={`${filters.sortBy || 'dormancyScore'}-${filters.sortOrder || 'desc'}`}
        onValueChange={handleSortChange}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="dormancyScore-desc">Highest Score</SelectItem>
          <SelectItem value="dormancyScore-asc">Lowest Score</SelectItem>
          <SelectItem value="daysDormant-desc">Most Days Dormant</SelectItem>
          <SelectItem value="daysDormant-asc">Least Days Dormant</SelectItem>
          <SelectItem value="lastContactDate-asc">Oldest Contact</SelectItem>
          <SelectItem value="lastContactDate-desc">Newest Contact</SelectItem>
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="mr-1 h-4 w-4" />
          Clear Filters
        </Button>
      )}
    </div>
  );
}
