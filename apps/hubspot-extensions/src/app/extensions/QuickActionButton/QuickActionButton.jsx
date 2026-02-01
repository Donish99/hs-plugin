import React, { useState } from 'react';
import {
  hubspot,
  Flex,
  Text,
  Button,
  Select,
  LoadingSpinner,
  Alert,
  Heading,
  Divider,
} from '@hubspot/ui-extensions';

hubspot.extend(({ context, runServerlessFunction, actions }) => (
  <QuickActionButton
    context={context}
    runServerlessFunction={runServerlessFunction}
    actions={actions}
  />
));

const QuickActionButton = ({ context, runServerlessFunction, actions }) => {
  const [loading, setLoading] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [status, setStatus] = useState(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  const contactId = context.crm.objectId;

  React.useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const response = await runServerlessFunction({
        name: 'getActiveCampaigns',
        parameters: {},
      });

      if (response.status === 'SUCCESS') {
        setCampaigns(response.response.campaigns || []);
      }
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const handleAddToCampaign = async () => {
    if (!selectedCampaign) {
      setStatus({ type: 'error', message: 'Please select a campaign' });
      return;
    }

    try {
      setLoading(true);
      setStatus(null);

      const response = await runServerlessFunction({
        name: 'addToCampaign',
        parameters: {
          contactId,
          campaignId: selectedCampaign,
        },
      });

      if (response.status === 'SUCCESS') {
        setStatus({
          type: 'success',
          message: 'Contact added to campaign successfully!',
        });

        // Refresh the contact record
        actions.refreshObjectProperties();
      } else {
        setStatus({
          type: 'error',
          message: response.message || 'Failed to add contact to campaign',
        });
      }
    } catch (err) {
      setStatus({
        type: 'error',
        message: 'An error occurred. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewCampaign = () => {
    // Open the dashboard in a new tab to create a campaign
    window.open(`${process.env.APP_URL}/campaigns/new?leadIds=${contactId}`, '_blank');
  };

  if (loadingCampaigns) {
    return (
      <Flex direction="column" align="center" justify="center" gap="small">
        <LoadingSpinner size="medium" />
        <Text>Loading campaigns...</Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="medium">
      <Heading>Add to Reactivation Campaign</Heading>

      <Text variant="microcopy">
        Add this contact to an active reactivation campaign to send personalized outreach.
      </Text>

      <Divider />

      {campaigns.length > 0 ? (
        <>
          <Select
            label="Select Campaign"
            name="campaign"
            placeholder="Choose a campaign..."
            options={campaigns.map((c) => ({
              label: `${c.name} (${c.channel})`,
              value: c.id,
            }))}
            value={selectedCampaign}
            onChange={(value) => {
              setSelectedCampaign(value);
              setStatus(null);
            }}
          />

          <Button
            variant="primary"
            onClick={handleAddToCampaign}
            disabled={loading || !selectedCampaign}
          >
            {loading ? 'Adding...' : 'Add to Campaign'}
          </Button>
        </>
      ) : (
        <Alert variant="info" title="No Active Campaigns">
          Create a campaign first to start reactivating dormant leads.
        </Alert>
      )}

      <Button variant="secondary" onClick={handleCreateNewCampaign}>
        Create New Campaign
      </Button>

      {status && (
        <Alert
          variant={status.type === 'success' ? 'success' : 'error'}
          title={status.type === 'success' ? 'Success' : 'Error'}
        >
          {status.message}
        </Alert>
      )}
    </Flex>
  );
};

export default QuickActionButton;
