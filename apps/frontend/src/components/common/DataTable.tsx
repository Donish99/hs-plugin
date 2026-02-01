import * as React from 'react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

export type SortDirection = 'asc' | 'desc' | null;

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  sortKey?: string;
  sortDirection?: SortDirection;
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  isLoading,
  emptyTitle = 'No data',
  emptyDescription,
  selectable,
  selectedKeys = new Set(),
  onSelectionChange,
  sortKey,
  sortDirection,
  onSort,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const allSelected = data.length > 0 && data.every((row) => selectedKeys.has(keyExtractor(row)));
  const someSelected = data.some((row) => selectedKeys.has(keyExtractor(row))) && !allSelected;

  const handleSelectAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(data.map(keyExtractor)));
    }
  };

  const handleSelectRow = (row: T) => {
    if (!onSelectionChange) return;
    const key = keyExtractor(row);
    const newSelection = new Set(selectedKeys);
    if (newSelection.has(key)) {
      newSelection.delete(key);
    } else {
      newSelection.add(key);
    }
    onSelectionChange(newSelection);
  };

  const renderSortIcon = (columnKey: string) => {
    if (sortKey !== columnKey) {
      return <ChevronsUpDown className="ml-2 h-4 w-4" />;
    }
    if (sortDirection === 'asc') {
      return <ChevronUp className="ml-2 h-4 w-4" />;
    }
    return <ChevronDown className="ml-2 h-4 w-4" />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className={cn('relative w-full overflow-auto', className)}>
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b">
          <tr className="border-b transition-colors hover:bg-muted/50">
            {selectable && (
              <th className="h-12 w-12 px-4">
                <Checkbox
                  checked={allSelected}
                  ref={(el) => {
                    if (el) {
                      (el as HTMLButtonElement & { indeterminate: boolean }).indeterminate =
                        someSelected;
                    }
                  }}
                  onCheckedChange={handleSelectAll}
                />
              </th>
            )}
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  'h-12 px-4 text-left align-middle font-medium text-muted-foreground',
                  column.className
                )}
              >
                {column.sortable && onSort ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8"
                    onClick={() => onSort(column.key)}
                  >
                    {column.header}
                    {renderSortIcon(column.key)}
                  </Button>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {data.map((row) => {
            const key = keyExtractor(row);
            const isSelected = selectedKeys.has(key);
            return (
              <tr
                key={key}
                className={cn(
                  'border-b transition-colors hover:bg-muted/50',
                  isSelected && 'bg-muted/50',
                  onRowClick && 'cursor-pointer'
                )}
                onClick={() => onRowClick?.(row)}
              >
                {selectable && (
                  <td className="w-12 px-4">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleSelectRow(row)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                )}
                {columns.map((column) => (
                  <td key={column.key} className={cn('p-4 align-middle', column.className)}>
                    {column.render
                      ? column.render(row)
                      : (row as Record<string, unknown>)[column.key]?.toString()}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
