import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Search, FileText, BarChart3 } from 'lucide-react';
import { useTriggerScan } from '@/api/hooks/useLeads';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export function QuickActions() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const triggerScan = useTriggerScan();

  const handleScan = () => {
    triggerScan.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: 'Scan Started',
          description: 'Dormancy scan has been triggered. Results will appear shortly.',
        });
      },
      onError: () => {
        toast({
          title: 'Scan Failed',
          description: 'Failed to trigger dormancy scan. Please try again.',
          variant: 'destructive',
        });
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <Button
          variant="outline"
          className="justify-start"
          onClick={() => navigate('/campaigns/new')}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Campaign
        </Button>
        <Button
          variant="outline"
          className="justify-start"
          onClick={handleScan}
          disabled={triggerScan.isPending}
        >
          {triggerScan.isPending ? (
            <LoadingSpinner size="sm" className="mr-2" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          Run Dormancy Scan
        </Button>
        <Button variant="outline" className="justify-start" onClick={() => navigate('/rules/new')}>
          <FileText className="mr-2 h-4 w-4" />
          Create Rule
        </Button>
        <Button variant="outline" className="justify-start" onClick={() => navigate('/analytics')}>
          <BarChart3 className="mr-2 h-4 w-4" />
          View Analytics
        </Button>
      </CardContent>
    </Card>
  );
}
