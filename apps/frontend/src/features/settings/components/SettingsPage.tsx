import { useState, useEffect } from 'react';
import {
  useSettings,
  useUsageStats,
  useUpdateGeneralSettings,
  useUpdateSendingLimits,
  useUpdateAISettings,
  useUpdateNotificationSettings,
  useTestEmail,
  useTestSms,
} from '@/api/hooks/useSettings';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Save, Send, MessageSquare, Sparkles, Bell } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

const timezones = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export function SettingsPage() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useSettings();
  const { data: usage } = useUsageStats();
  const updateGeneral = useUpdateGeneralSettings();
  const updateLimits = useUpdateSendingLimits();
  const updateAI = useUpdateAISettings();
  const updateNotifications = useUpdateNotificationSettings();
  const testEmail = useTestEmail();
  const testSms = useTestSms();

  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [testPhoneNumber, setTestPhoneNumber] = useState('');

  // General Settings
  const [timezone, setTimezone] = useState('America/New_York');
  const [businessHoursStart, setBusinessHoursStart] = useState('09:00');
  const [businessHoursEnd, setBusinessHoursEnd] = useState('17:00');

  // Sending Limits
  const [dailyEmailLimit, setDailyEmailLimit] = useState(100);
  const [dailySmsLimit, setDailySmsLimit] = useState(50);
  const [monthlyEmailLimit, setMonthlyEmailLimit] = useState(3000);
  const [monthlySmsLimit, setMonthlySmsLimit] = useState(1500);

  // AI Settings
  const [defaultTone, setDefaultTone] = useState<'professional' | 'friendly' | 'casual'>('professional');
  const [autoApprove, setAutoApprove] = useState(false);
  const [maxTokens, setMaxTokens] = useState(500);

  // Notification Settings
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [notifyOnReplies, setNotifyOnReplies] = useState(true);
  const [notifyOnErrors, setNotifyOnErrors] = useState(true);
  const [dailyDigest, setDailyDigest] = useState(true);

  // Load settings
  useEffect(() => {
    if (settings) {
      // General settings
      if (settings.general) {
        setTimezone(settings.general.timezone ?? 'America/New_York');
        setBusinessHoursStart(settings.general.businessHoursStart ?? '09:00');
        setBusinessHoursEnd(settings.general.businessHoursEnd ?? '17:00');
      }
      // Sending limits
      if (settings.sendingLimits) {
        setDailyEmailLimit(settings.sendingLimits.dailyEmailLimit ?? 100);
        setDailySmsLimit(settings.sendingLimits.dailySmsLimit ?? 50);
        setMonthlyEmailLimit(settings.sendingLimits.monthlyEmailLimit ?? 3000);
        setMonthlySmsLimit(settings.sendingLimits.monthlySmsLimit ?? 1500);
      }
      // AI settings
      if (settings.ai) {
        setDefaultTone(settings.ai.defaultTone ?? 'professional');
        setAutoApprove(settings.ai.autoApprove ?? false);
        setMaxTokens(settings.ai.maxTokensPerMessage ?? 500);
      }
      // Notification settings
      if (settings.notifications) {
        setEmailNotifications(settings.notifications.emailNotifications ?? true);
        setNotifyOnReplies(settings.notifications.notifyOnReplies ?? true);
        setNotifyOnErrors(settings.notifications.notifyOnErrors ?? true);
        setDailyDigest(settings.notifications.dailyDigest ?? true);
      }
    }
  }, [settings]);

  const handleSaveGeneral = () => {
    updateGeneral.mutate(
      { timezone, businessHoursStart, businessHoursEnd },
      {
        onSuccess: () => toast({ title: 'General settings saved' }),
        onError: () => toast({ title: 'Failed to save', variant: 'destructive' }),
      }
    );
  };

  const handleSaveLimits = () => {
    updateLimits.mutate(
      { dailyEmailLimit, dailySmsLimit, monthlyEmailLimit, monthlySmsLimit },
      {
        onSuccess: () => toast({ title: 'Sending limits saved' }),
        onError: () => toast({ title: 'Failed to save', variant: 'destructive' }),
      }
    );
  };

  const handleSaveAI = () => {
    updateAI.mutate(
      { defaultTone, autoApprove, maxTokensPerMessage: maxTokens },
      {
        onSuccess: () => toast({ title: 'AI settings saved' }),
        onError: () => toast({ title: 'Failed to save', variant: 'destructive' }),
      }
    );
  };

  const handleSaveNotifications = () => {
    updateNotifications.mutate(
      { emailNotifications, notifyOnReplies, notifyOnErrors, dailyDigest },
      {
        onSuccess: () => toast({ title: 'Notification settings saved' }),
        onError: () => toast({ title: 'Failed to save', variant: 'destructive' }),
      }
    );
  };

  const handleTestEmail = () => {
    if (!testEmailAddress) return;
    testEmail.mutate(testEmailAddress, {
      onSuccess: (result) =>
        toast({
          title: result.success ? 'Test email sent' : 'Test failed',
          description: result.message,
          variant: result.success ? 'default' : 'destructive',
        }),
    });
  };

  const handleTestSms = () => {
    if (!testPhoneNumber) return;
    testSms.mutate(testPhoneNumber, {
      onSuccess: (result) =>
        toast({
          title: result.success ? 'Test SMS sent' : 'Test failed',
          description: result.message,
          variant: result.success ? 'default' : 'destructive',
        }),
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure your account preferences"
      />

      <Tabs defaultValue="general">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="sending">Sending</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Configure timezone and business hours</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Business Hours Start</Label>
                  <Input
                    type="time"
                    value={businessHoursStart}
                    onChange={(e) => setBusinessHoursStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Business Hours End</Label>
                  <Input
                    type="time"
                    value={businessHoursEnd}
                    onChange={(e) => setBusinessHoursEnd(e.target.value)}
                  />
                </div>
              </div>

              <Button onClick={handleSaveGeneral} disabled={updateGeneral.isPending}>
                <Save className="mr-2 h-4 w-4" />
                Save General Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sending Settings */}
        <TabsContent value="sending" className="mt-6 space-y-6">
          {/* Usage */}
          {usage && (
            <Card>
              <CardHeader>
                <CardTitle>Current Usage</CardTitle>
                <CardDescription>This month's usage against your limits</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Email ({formatNumber(usage.currentMonth?.emailsSent)} sent)</span>
                    <span>{(usage.percentUsed?.email ?? 0).toFixed(1)}%</span>
                  </div>
                  <Progress value={usage.percentUsed?.email ?? 0} />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>SMS ({formatNumber(usage.currentMonth?.smsSent)} sent)</span>
                    <span>{(usage.percentUsed?.sms ?? 0).toFixed(1)}%</span>
                  </div>
                  <Progress value={usage.percentUsed?.sms ?? 0} />
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Sending Limits</CardTitle>
              <CardDescription>Set daily and monthly limits for outreach</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Daily Email Limit</Label>
                  <Input
                    type="number"
                    value={dailyEmailLimit}
                    onChange={(e) => setDailyEmailLimit(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Daily SMS Limit</Label>
                  <Input
                    type="number"
                    value={dailySmsLimit}
                    onChange={(e) => setDailySmsLimit(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Monthly Email Limit</Label>
                  <Input
                    type="number"
                    value={monthlyEmailLimit}
                    onChange={(e) => setMonthlyEmailLimit(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Monthly SMS Limit</Label>
                  <Input
                    type="number"
                    value={monthlySmsLimit}
                    onChange={(e) => setMonthlySmsLimit(Number(e.target.value))}
                  />
                </div>
              </div>

              <Button onClick={handleSaveLimits} disabled={updateLimits.isPending}>
                <Save className="mr-2 h-4 w-4" />
                Save Limits
              </Button>
            </CardContent>
          </Card>

          {/* Test Sending */}
          <Card>
            <CardHeader>
              <CardTitle>Test Configuration</CardTitle>
              <CardDescription>Send test messages to verify your setup</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <Input
                  placeholder="test@example.com"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={handleTestEmail}
                  disabled={!testEmailAddress || testEmail.isPending}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Test Email
                </Button>
              </div>
              <div className="flex gap-4">
                <Input
                  placeholder="+1234567890"
                  value={testPhoneNumber}
                  onChange={(e) => setTestPhoneNumber(e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={handleTestSms}
                  disabled={!testPhoneNumber || testSms.isPending}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Test SMS
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Settings */}
        <TabsContent value="ai" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>AI Settings</CardTitle>
              <CardDescription>Configure AI message generation preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Default Message Tone</Label>
                <Select value={defaultTone} onValueChange={(v: typeof defaultTone) => setDefaultTone(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Max Tokens per Message</Label>
                <Input
                  type="number"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Number(e.target.value))}
                  min={100}
                  max={2000}
                />
                <p className="text-xs text-muted-foreground">
                  Higher values allow longer messages but cost more.
                </p>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-Approve Messages</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically approve AI-generated messages without manual review.
                  </p>
                </div>
                <Switch checked={autoApprove} onCheckedChange={setAutoApprove} />
              </div>

              <Button onClick={handleSaveAI} disabled={updateAI.isPending}>
                <Sparkles className="mr-2 h-4 w-4" />
                Save AI Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notification Settings */}
        <TabsContent value="notifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>Configure how you receive updates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-xs text-muted-foreground">
                    Receive notifications via email.
                  </p>
                </div>
                <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Reply Notifications</Label>
                  <p className="text-xs text-muted-foreground">
                    Get notified when a lead replies to your message.
                  </p>
                </div>
                <Switch checked={notifyOnReplies} onCheckedChange={setNotifyOnReplies} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Error Notifications</Label>
                  <p className="text-xs text-muted-foreground">
                    Get notified when something goes wrong.
                  </p>
                </div>
                <Switch checked={notifyOnErrors} onCheckedChange={setNotifyOnErrors} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Daily Digest</Label>
                  <p className="text-xs text-muted-foreground">
                    Receive a daily summary of activity.
                  </p>
                </div>
                <Switch checked={dailyDigest} onCheckedChange={setDailyDigest} />
              </div>

              <Button onClick={handleSaveNotifications} disabled={updateNotifications.isPending}>
                <Bell className="mr-2 h-4 w-4" />
                Save Notification Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
