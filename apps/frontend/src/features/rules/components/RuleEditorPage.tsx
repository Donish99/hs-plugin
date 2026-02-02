import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRule, useCreateRule, useUpdateRule } from '@/api/hooks/useRules';
import {
  CreateRuleInput,
  DormancyCriteria,
  ActionType,
  ActionConfig,
} from '@/api/endpoints/rules';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CriteriaBuilder } from './CriteriaBuilder';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save } from 'lucide-react';
import { useState } from 'react';

const ruleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  actionType: z.enum(['email', 'sms', 'sequence', 'task']),
  tone: z.string().optional(),
  template: z.string().optional(),
});

type RuleFormData = z.infer<typeof ruleSchema>;

const actionTypeOptions: { value: ActionType; label: string; description: string }[] = [
  { value: 'email', label: 'Email', description: 'Send a personalized email' },
  { value: 'sms', label: 'SMS', description: 'Send a text message' },
  { value: 'sequence', label: 'Sequence', description: 'Enroll in HubSpot sequence' },
  { value: 'task', label: 'Task', description: 'Create a follow-up task' },
];

const toneOptions = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'casual', label: 'Casual' },
];

export function RuleEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEditing = !!id;

  const { data: existingRule, isLoading } = useRule(id || '');
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();

  const [criteria, setCriteria] = useState<DormancyCriteria>({});

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RuleFormData>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      name: '',
      actionType: 'email',
      tone: 'professional',
      template: '',
    },
  });

  const actionType = watch('actionType');

  // Populate form when editing
  useEffect(() => {
    if (existingRule) {
      reset({
        name: existingRule.name,
        actionType: existingRule.actionType,
        tone: existingRule.actionConfig.tone || 'professional',
        template: existingRule.actionConfig.template || '',
      });
      setCriteria(existingRule.criteria);
    }
  }, [existingRule, reset]);

  const onSubmit = async (data: RuleFormData) => {
    // Validate at least one criterion is set
    const hasAnyCriteria = Object.values(criteria).some(
      (v) => v !== undefined && (Array.isArray(v) ? v.length > 0 : true)
    );

    if (!hasAnyCriteria) {
      toast({
        title: 'Validation Error',
        description: 'Please set at least one dormancy criterion.',
        variant: 'destructive',
      });
      return;
    }

    const actionConfig: ActionConfig = {
      tone: data.tone,
      template: data.template || undefined,
    };

    const payload: CreateRuleInput = {
      name: data.name,
      criteria,
      actionType: data.actionType,
      actionConfig,
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
        description={
          isEditing
            ? 'Modify your dormancy detection rule'
            : 'Define a new rule for identifying dormant leads'
        }
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dormancy Criteria</CardTitle>
          </CardHeader>
          <CardContent>
            <CriteriaBuilder criteria={criteria} onChange={setCriteria} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Action Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Action Type *</Label>
              <Select
                value={actionType}
                onValueChange={(value) => setValue('actionType', value as ActionType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  {actionTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div>
                        <span className="font-medium">{option.label}</span>
                        <span className="text-muted-foreground ml-2">
                          - {option.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(actionType === 'email' || actionType === 'sms') && (
              <>
                <div className="space-y-2">
                  <Label>Message Tone</Label>
                  <Select
                    value={watch('tone')}
                    onValueChange={(value) => setValue('tone', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select tone" />
                    </SelectTrigger>
                    <SelectContent>
                      {toneOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template">Message Template (optional)</Label>
                  <Input
                    id="template"
                    placeholder="e.g., re-engagement-v1"
                    {...register('template')}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to use AI-generated personalized messages
                  </p>
                </div>
              </>
            )}
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
