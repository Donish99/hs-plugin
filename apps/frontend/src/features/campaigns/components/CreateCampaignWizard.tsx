import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateCampaign } from '@/api/hooks/useCampaigns';
import { useRules } from '@/api/hooks/useRules';
import { useLeads } from '@/api/hooks/useLeads';
import { useEstimateCost } from '@/api/hooks/useGenerate';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, Check, Mail, MessageSquare, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn, formatNumber, formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, AlertCircle } from 'lucide-react';

const campaignSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  channel: z.enum(['email', 'sms', 'both']),
  tone: z.enum(['professional', 'friendly', 'casual']),
  ruleId: z.string().optional(),
  enableABTest: z.boolean().default(false),
  requiresReview: z.boolean().default(true),
});

type CampaignFormData = z.infer<typeof campaignSchema>;

const steps = [
  { id: 'basics', title: 'Basics', description: 'Campaign name and channel' },
  { id: 'targeting', title: 'Targeting', description: 'Select leads to target' },
  { id: 'settings', title: 'Settings', description: 'Message settings' },
  { id: 'review', title: 'Review', description: 'Confirm and launch' },
];

export function CreateCampaignWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const createCampaign = useCreateCampaign();
  const { data: rulesData } = useRules();
  const { data: leadsData } = useLeads({ limit: 100 });

  const preSelectedLeadIds = (location.state as { selectedLeadIds?: string[] })?.selectedLeadIds || [];
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>(preSelectedLeadIds);
  const [targetingMode, setTargetingMode] = useState<'rule' | 'manual'>(
    preSelectedLeadIds.length > 0 ? 'manual' : 'rule'
  );
  const [costEstimate, setCostEstimate] = useState<{
    estimatedCost: number;
    tokensEstimate: number;
    details: string;
  } | null>(null);
  const estimateCost = useEstimateCost();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CampaignFormData>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: '',
      description: '',
      channel: 'email',
      tone: 'professional',
      enableABTest: false,
      requiresReview: true,
    },
  });

  const formValues = watch();

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return formValues.name && formValues.channel;
      case 1:
        return targetingMode === 'rule' ? !!formValues.ruleId : selectedLeadIds.length > 0;
      case 2:
        return !!formValues.tone;
      default:
        return true;
    }
  };

  const onSubmit = async (data: CampaignFormData) => {
    // Only submit on the final review step
    if (currentStep !== steps.length - 1) {
      return;
    }
    try {
      await createCampaign.mutateAsync({
        ...data,
        leadIds: targetingMode === 'manual' ? selectedLeadIds : undefined,
        requiresReview: data.requiresReview,
      });
      toast({ title: 'Campaign created', description: 'Your campaign is ready to launch.' });
      navigate('/campaigns');
    } catch {
      toast({ title: 'Creation failed', variant: 'destructive' });
    }
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    );
  };

  // Estimate cost when entering review step
  useEffect(() => {
    if (currentStep === 3) {
      const contactCount = targetingMode === 'manual'
        ? selectedLeadIds.length
        : (rulesData?.rules.find(r => r.id === formValues.ruleId)?.matchedLeadsCount || 0);

      if (contactCount > 0) {
        estimateCost.mutate({
          contactCount,
          channel: formValues.channel === 'both' ? 'email' : formValues.channel,
          includeVariants: formValues.enableABTest,
        }, {
          onSuccess: (data) => setCostEstimate(data),
        });
      }
    }
  }, [currentStep]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Campaign"
        description="Set up a new lead reactivation campaign"
        actions={
          <Button variant="outline" onClick={() => navigate('/campaigns')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Cancel
          </Button>
        }
      />

      {/* Step Indicator */}
      <div className="flex justify-center">
        <nav className="flex items-center gap-2">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <button
                type="button"
                onClick={() => index < currentStep && setCurrentStep(index)}
                className={cn(
                  'flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors',
                  index === currentStep
                    ? 'bg-primary text-primary-foreground'
                    : index < currentStep
                    ? 'bg-primary/20 text-primary cursor-pointer hover:bg-primary/30'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {index < currentStep ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border text-xs">
                    {index + 1}
                  </span>
                )}
                <span className="hidden sm:inline">{step.title}</span>
              </button>
              {index < steps.length - 1 && (
                <div className="mx-2 h-px w-8 bg-border" />
              )}
            </div>
          ))}
        </nav>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        onKeyDown={(e) => {
          // Prevent Enter key from submitting the form on non-final steps
          if (e.key === 'Enter' && currentStep !== steps.length - 1) {
            e.preventDefault();
          }
        }}
      >
        {/* Step 1: Basics */}
        {currentStep === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Campaign Basics</CardTitle>
              <CardDescription>Give your campaign a name and select the channel</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Campaign Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Q1 Lead Reactivation"
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
                  placeholder="Optional description..."
                  {...register('description')}
                />
              </div>

              <div className="space-y-2">
                <Label>Channel *</Label>
                <RadioGroup
                  value={formValues.channel}
                  onValueChange={(value) => setValue('channel', value as 'email' | 'sms' | 'both')}
                  className="grid grid-cols-3 gap-4"
                >
                  <label
                    className={cn(
                      'flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-4 hover:bg-muted/50',
                      formValues.channel === 'email' && 'border-primary bg-primary/5'
                    )}
                  >
                    <RadioGroupItem value="email" className="sr-only" />
                    <Mail className="h-6 w-6" />
                    <span className="text-sm font-medium">Email</span>
                  </label>
                  <label
                    className={cn(
                      'flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-4 hover:bg-muted/50',
                      formValues.channel === 'sms' && 'border-primary bg-primary/5'
                    )}
                  >
                    <RadioGroupItem value="sms" className="sr-only" />
                    <MessageSquare className="h-6 w-6" />
                    <span className="text-sm font-medium">SMS</span>
                  </label>
                  <label
                    className={cn(
                      'flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-4 hover:bg-muted/50',
                      formValues.channel === 'both' && 'border-primary bg-primary/5'
                    )}
                  >
                    <RadioGroupItem value="both" className="sr-only" />
                    <div className="flex gap-1">
                      <Mail className="h-5 w-5" />
                      <MessageSquare className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-medium">Both</span>
                  </label>
                </RadioGroup>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Targeting */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Target Audience</CardTitle>
              <CardDescription>Choose how to select leads for this campaign</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <RadioGroup
                value={targetingMode}
                onValueChange={(value) => setTargetingMode(value as 'rule' | 'manual')}
                className="grid gap-4 md:grid-cols-2"
              >
                <label
                  className={cn(
                    'flex cursor-pointer flex-col gap-2 rounded-lg border p-4 hover:bg-muted/50',
                    targetingMode === 'rule' && 'border-primary bg-primary/5'
                  )}
                >
                  <RadioGroupItem value="rule" className="sr-only" />
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    <span className="font-medium">Use Dormancy Rule</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Target all leads matching a specific dormancy rule
                  </p>
                </label>
                <label
                  className={cn(
                    'flex cursor-pointer flex-col gap-2 rounded-lg border p-4 hover:bg-muted/50',
                    targetingMode === 'manual' && 'border-primary bg-primary/5'
                  )}
                >
                  <RadioGroupItem value="manual" className="sr-only" />
                  <div className="flex items-center gap-2">
                    <Check className="h-5 w-5" />
                    <span className="font-medium">Manual Selection</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Hand-pick specific leads from your dormant list
                  </p>
                </label>
              </RadioGroup>

              {targetingMode === 'rule' && (
                <div className="space-y-2">
                  <Label>Select Rule</Label>
                  <Select
                    value={formValues.ruleId}
                    onValueChange={(value) => setValue('ruleId', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a dormancy rule" />
                    </SelectTrigger>
                    <SelectContent>
                      {rulesData?.rules.map((rule) => (
                        <SelectItem key={rule.id} value={rule.id}>
                          {rule.name} {rule.criteria.min_days_inactive ? `(${rule.criteria.min_days_inactive}+ days)` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {targetingMode === 'manual' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Select Leads ({selectedLeadIds.length} selected)</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSelectedLeadIds(
                          selectedLeadIds.length === leadsData?.leads.length
                            ? []
                            : leadsData?.leads.map((l) => l.id) || []
                        )
                      }
                    >
                      {selectedLeadIds.length === leadsData?.leads.length
                        ? 'Deselect All'
                        : 'Select All'}
                    </Button>
                  </div>
                  <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-2">
                    {leadsData?.leads.map((lead) => (
                      <label
                        key={lead.id}
                        className="flex cursor-pointer items-center gap-3 rounded p-2 hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selectedLeadIds.includes(lead.id)}
                          onCheckedChange={() => toggleLeadSelection(lead.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {[lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{lead.email}</p>
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          {lead.dormancyScore}
                        </Badge>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Settings */}
        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Message Settings</CardTitle>
              <CardDescription>Configure how messages will be generated</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Message Tone *</Label>
                <RadioGroup
                  value={formValues.tone}
                  onValueChange={(value) =>
                    setValue('tone', value as 'professional' | 'friendly' | 'casual')
                  }
                  className="grid gap-4 md:grid-cols-3"
                >
                  {[
                    { value: 'professional', label: 'Professional', desc: 'Formal and business-like' },
                    { value: 'friendly', label: 'Friendly', desc: 'Warm and approachable' },
                    { value: 'casual', label: 'Casual', desc: 'Relaxed and conversational' },
                  ].map((tone) => (
                    <label
                      key={tone.value}
                      className={cn(
                        'flex cursor-pointer flex-col gap-1 rounded-lg border p-4 hover:bg-muted/50',
                        formValues.tone === tone.value && 'border-primary bg-primary/5'
                      )}
                    >
                      <RadioGroupItem value={tone.value} className="sr-only" />
                      <span className="font-medium">{tone.label}</span>
                      <span className="text-xs text-muted-foreground">{tone.desc}</span>
                    </label>
                  ))}
                </RadioGroup>
              </div>

              <div className="flex items-center gap-3 rounded-lg border p-4">
                <Checkbox
                  id="enableABTest"
                  checked={formValues.enableABTest}
                  onCheckedChange={(checked) => setValue('enableABTest', !!checked)}
                />
                <div className="flex-1">
                  <Label htmlFor="enableABTest" className="cursor-pointer">
                    Enable A/B Testing
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Generate multiple message variants and track which performs best
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg border p-4 border-blue-200 bg-blue-50/50">
                <Checkbox
                  id="requiresReview"
                  checked={formValues.requiresReview}
                  onCheckedChange={(checked) => setValue('requiresReview', !!checked)}
                />
                <div className="flex-1">
                  <Label htmlFor="requiresReview" className="cursor-pointer">
                    Require Human Review
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    AI-generated messages will be queued for review before sending. You can approve, edit, or reject each message.
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0">Recommended</Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Review */}
        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Review Campaign</CardTitle>
              <CardDescription>Confirm your campaign settings before creating</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Campaign Name</p>
                  <p className="font-medium">{formValues.name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Channel</p>
                  <Badge variant="outline" className="capitalize">
                    {formValues.channel}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Targeting</p>
                  <p className="font-medium">
                    {targetingMode === 'rule'
                      ? rulesData?.rules.find((r) => r.id === formValues.ruleId)?.name
                      : `${selectedLeadIds.length} leads selected`}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Tone</p>
                  <p className="font-medium capitalize">{formValues.tone}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">A/B Testing</p>
                  <p className="font-medium">{formValues.enableABTest ? 'Enabled' : 'Disabled'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Human Review</p>
                  <p className="font-medium">
                    {formValues.requiresReview ? (
                      <span className="text-blue-600">Required before sending</span>
                    ) : (
                      <span className="text-amber-600">Direct send (no review)</span>
                    )}
                  </p>
                </div>
                {formValues.description && (
                  <div className="space-y-1 md:col-span-2">
                    <p className="text-sm text-muted-foreground">Description</p>
                    <p className="text-sm">{formValues.description}</p>
                  </div>
                )}
              </div>

              {/* Cost Estimate */}
              <div className="mt-6 rounded-lg border bg-muted/50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="h-5 w-5 text-green-600" />
                  <span className="font-medium">Estimated AI Generation Cost</span>
                </div>
                {estimateCost.isPending ? (
                  <Skeleton className="h-10 w-32" />
                ) : costEstimate ? (
                  <div className="space-y-2">
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(costEstimate.estimatedCost)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ~{formatNumber(costEstimate.tokensEstimate)} tokens &bull; {costEstimate.details}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertCircle className="h-4 w-4" />
                    <span>Unable to estimate cost</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCurrentStep((prev) => prev - 1)}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          {currentStep < steps.length - 1 ? (
            <Button
              type="button"
              onClick={() => setCurrentStep((prev) => prev + 1)}
              disabled={!canProceed()}
            >
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={createCampaign.isPending}>
              {createCampaign.isPending ? 'Creating...' : 'Create Campaign'}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
