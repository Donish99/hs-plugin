import { useNavigate } from 'react-router-dom';
import { useRules, useDeleteRule, useToggleRuleActive } from '@/api/hooks/useRules';
import { DormancyRule } from '@/api/endpoints/rules';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, MoreVertical, Pencil, Trash2, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { EmptyState } from '@/components/common/EmptyState';

function RuleCard({
  rule,
  onEdit,
  onDelete,
  onToggle,
}: {
  rule: DormancyRule;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base font-medium">{rule.name}</CardTitle>
          {rule.description && (
            <p className="text-sm text-muted-foreground">{rule.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={rule.isActive} onCheckedChange={() => onToggle()} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Days dormant:</span>
            <Badge variant="secondary">{rule.daysSinceLastContact}+</Badge>
          </div>
          {rule.criteria.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Criteria:</span>
              <Badge variant="outline">{rule.criteria.length}</Badge>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Priority:</span>
            <Badge variant="outline">{rule.priority}</Badge>
          </div>
          <Badge variant={rule.isActive ? 'success' : 'secondary'}>
            {rule.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export function RulesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading } = useRules();
  const deleteRule = useDeleteRule();
  const toggleRule = useToggleRuleActive();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<DormancyRule | null>(null);

  const handleDelete = (rule: DormancyRule) => {
    setRuleToDelete(rule);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (!ruleToDelete) return;
    deleteRule.mutate(ruleToDelete.id, {
      onSuccess: () => {
        toast({ title: 'Rule deleted', description: 'The rule has been removed.' });
        setDeleteDialogOpen(false);
        setRuleToDelete(null);
      },
      onError: () => {
        toast({ title: 'Delete failed', variant: 'destructive' });
      },
    });
  };

  const handleToggle = (rule: DormancyRule) => {
    const newActive = !rule.isActive;
    toggleRule.mutate(
      rule.id,
      {
        onSuccess: () => {
          toast({
            title: newActive ? 'Rule activated' : 'Rule deactivated',
            description: `"${rule.name}" is now ${newActive ? 'active' : 'inactive'}.`,
          });
        },
        onError: () => {
          toast({ title: 'Update failed', variant: 'destructive' });
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dormancy Rules"
        description="Define criteria for identifying dormant leads"
        actions={
          <Button onClick={() => navigate('/rules/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Create Rule
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : data?.rules && data.rules.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {data.rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onEdit={() => navigate(`/rules/${rule.id}`)}
              onDelete={() => handleDelete(rule)}
              onToggle={() => handleToggle(rule)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="No rules defined"
          description="Create your first dormancy rule to start identifying leads that need re-engagement."
          action={{
            label: 'Create Rule',
            onClick: () => navigate('/rules/new'),
          }}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{ruleToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
