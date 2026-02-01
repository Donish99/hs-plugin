import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRule, useCreateRule, useUpdateRule } from '@/api/hooks/useRules';
import { CreateRuleInput, DormancyCriterion } from '@/api/endpoints/rules';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CriteriaBuilder } from './CriteriaBuilder';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save } from 'lucide-react';
import { useState } from 'react';

const ruleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  daysSinceLastContact: z.number().min(1).max(365),
  priority: z.number().min(1).max(100).optional(),
});

type RuleFormData = z.infer<typeof ruleSchema>;

export function RuleEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEditing = !!id;

  const { data: existingRule, isLoading } = useRule(id || '');
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();

  const [criteria, setCriteria] = useState<DormancyCriterion[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RuleFormData>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      name: '',
      description: '',
      daysSinceLastContact: 30,
      priority: 10,
    },
  });

  // Populate form when editing
  useEffect(() => {
    if (existingRule) {
      reset({
        name: existingRule.name,
        description: existingRule.description || '',
        daysSinceLastContact: existingRule.daysSinceLastContact,
        priority: existingRule.priority,
      });
      setCriteria(existingRule.criteria);
    }
  }, [existingRule, reset]);

  const onSubmit = async (data: RuleFormData) => {
    const payload: CreateRuleInput = {
      ...data,
      criteria,
    };

    try {
      if (isEditing) {
        await updateRule.mutateAsync({ id, input: payload });
        toast({ title: 'Rule updated', description: 'Your changes have been saved.' });
      } else {
        await createRule.mutateAsync(payload);
        toast({ title: 'Rule created', description: 'Your new rule is now active.' });
      }
      navigate('/rules');
    } catch {
      toast({
        title: isEditing ? 'Update failed' : 'Creation failed',
        description: 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (isEditing && isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEditing ? 'Edit Rule' : 'Create Rule'}
        description={isEditing ? 'Modify your dormancy detection rule' : 'Define a new rule for identifying dormant leads'}
        actions={
          <Button variant="outline" onClick={() => navigate('/rules')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Rule Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Rule Name *</Label>
              <Input
                id="name"
                placeholder="e.g., High-Value Dormant Leads"
                {...register('name')}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe when this rule should apply..."
                {...register('description')}
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description.message}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="daysSinceLastContact">Days Since Last Contact *</Label>
                <Input
                  id="daysSinceLastContact"
                  type="number"
                  min={1}
                  max={365}
                  {...register('daysSinceLastContact', { valueAsNumber: true })}
                />
                <p className="text-xs text-muted-foreground">
                  Leads with no activity for this many days will be marked as dormant.
                </p>
                {errors.daysSinceLastContact && (
                  <p className="text-sm text-destructive">{errors.daysSinceLastContact.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Input
                  id="priority"
                  type="number"
                  min={1}
                  max={100}
                  {...register('priority', { valueAsNumber: true })}
                />
                <p className="text-xs text-muted-foreground">
                  Higher priority rules are evaluated first. Default is 10.
                </p>
                {errors.priority && (
                  <p className="text-sm text-destructive">{errors.priority.message}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Targeting Criteria</CardTitle>
          </CardHeader>
          <CardContent>
            <CriteriaBuilder criteria={criteria} onChange={setCriteria} />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => navigate('/rules')}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            <Save className="mr-2 h-4 w-4" />
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Rule'}
          </Button>
        </div>
      </form>
    </div>
  );
}
