import React, { useState, useEffect } from 'react';
import {
  hubspot,
  Flex,
  Text,
  Box,
  Heading,
  Badge,
  Link,
  Divider,
  LoadingSpinner,
  Alert,
  Statistics,
  StatisticsItem,
} from '@hubspot/ui-extensions';

hubspot.extend(({ context, runServerlessFunction, actions }) => (
  <DormancyCard
    context={context}
    runServerlessFunction={runServerlessFunction}
    actions={actions}
  />
));

const DormancyCard = ({ context, runServerlessFunction, actions }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dormancyData, setDormancyData] = useState(null);

  const contactId = context.crm.objectId;

  useEffect(() => {
    fetchDormancyData();
  }, [contactId]);

  const fetchDormancyData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await runServerlessFunction({
        name: 'getDormancyScore',
        parameters: { contactId },
      });

      if (response.status === 'SUCCESS') {
        setDormancyData(response.response);
      } else {
        setError('Failed to load dormancy data');
      }
    } catch (err) {
      setError('An error occurred while fetching data');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'danger';
    if (score >= 50) return 'warning';
    return 'default';
  };

  if (loading) {
    return (
      <Flex direction="column" align="center" justify="center" gap="small">
        <LoadingSpinner size="medium" />
        <Text>Loading dormancy data...</Text>
      </Flex>
    );
  }

  if (error) {
    return (
      <Alert variant="error" title="Error">
        {error}
      </Alert>
    );
  }

  if (!dormancyData || !dormancyData.isDormant) {
    return (
      <Flex direction="column" gap="small">
        <Heading>Dormancy Status</Heading>
        <Alert variant="success" title="Active Lead">
          This contact is not currently marked as dormant.
        </Alert>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="medium">
      <Flex justify="between" align="center">
        <Heading>Dormancy Status</Heading>
        <Badge variant={getScoreColor(dormancyData.dormancyScore)}>
          Score: {dormancyData.dormancyScore}
        </Badge>
      </Flex>

      <Divider />

      <Statistics>
        <StatisticsItem label="Days Dormant" number={dormancyData.daysDormant} />
        <StatisticsItem
          label="Last Contact"
          number={dormancyData.lastContactDate || 'Never'}
        />
      </Statistics>

      <Box>
        <Text variant="microcopy" format={{ fontWeight: 'bold' }}>
          Matched Rule:
        </Text>
        <Text>{dormancyData.matchedRuleName || 'Default'}</Text>
      </Box>

      {dormancyData.leadScore && (
        <Box>
          <Text variant="microcopy" format={{ fontWeight: 'bold' }}>
            Lead Score:
          </Text>
          <Text>{dormancyData.leadScore}</Text>
        </Box>
      )}

      <Divider />

      <Link
        href={`${process.env.APP_URL}/leads/${dormancyData.id}`}
        external={true}
      >
        View in Dashboard
      </Link>
    </Flex>
  );
};

export default DormancyCard;
