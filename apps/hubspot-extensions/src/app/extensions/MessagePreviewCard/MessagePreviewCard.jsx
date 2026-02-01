import React, { useState } from 'react';
import {
  hubspot,
  Flex,
  Text,
  Button,
  Box,
  Select,
  TextArea,
  Heading,
  Divider,
  LoadingSpinner,
  Alert,
  Badge,
} from '@hubspot/ui-extensions';

hubspot.extend(({ context, runServerlessFunction, actions }) => (
  <MessagePreviewCard
    context={context}
    runServerlessFunction={runServerlessFunction}
    actions={actions}
  />
));

const MessagePreviewCard = ({ context, runServerlessFunction, actions }) => {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [channel, setChannel] = useState('email');
  const [tone, setTone] = useState('professional');
  const [generatedMessage, setGeneratedMessage] = useState(null);
  const [error, setError] = useState(null);

  const contactId = context.crm.objectId;

  const handleGeneratePreview = async () => {
    try {
      setGenerating(true);
      setError(null);
      setGeneratedMessage(null);

      const response = await runServerlessFunction({
        name: 'generateMessagePreview',
        parameters: {
          contactId,
          channel,
          tone,
        },
      });

      if (response.status === 'SUCCESS') {
        setGeneratedMessage(response.response);
      } else {
        setError('Failed to generate message preview');
      }
    } catch (err) {
      setError('An error occurred while generating the preview');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyToClipboard = () => {
    if (generatedMessage) {
      const textToCopy = generatedMessage.subject
        ? `Subject: ${generatedMessage.subject}\n\n${generatedMessage.body}`
        : generatedMessage.body;

      navigator.clipboard.writeText(textToCopy);
      // Could show a toast here if supported
    }
  };

  return (
    <Flex direction="column" gap="medium">
      <Heading>AI Message Preview</Heading>

      <Text variant="microcopy">
        Generate a personalized message preview for this contact using AI.
      </Text>

      <Divider />

      <Flex gap="small" wrap="wrap">
        <Box flex={1}>
          <Select
            label="Channel"
            name="channel"
            options={[
              { label: 'Email', value: 'email' },
              { label: 'SMS', value: 'sms' },
            ]}
            value={channel}
            onChange={setChannel}
          />
        </Box>
        <Box flex={1}>
          <Select
            label="Tone"
            name="tone"
            options={[
              { label: 'Professional', value: 'professional' },
              { label: 'Friendly', value: 'friendly' },
              { label: 'Casual', value: 'casual' },
            ]}
            value={tone}
            onChange={setTone}
          />
        </Box>
      </Flex>

      <Button
        variant="primary"
        onClick={handleGeneratePreview}
        disabled={generating}
      >
        {generating ? (
          <>
            <LoadingSpinner size="small" />
            {' Generating...'}
          </>
        ) : (
          'Generate Preview'
        )}
      </Button>

      {error && (
        <Alert variant="error" title="Error">
          {error}
        </Alert>
      )}

      {generatedMessage && (
        <Box>
          <Flex justify="between" align="center">
            <Text format={{ fontWeight: 'bold' }}>Generated Message</Text>
            <Badge>
              ~{generatedMessage.tokensEstimate || 0} tokens
            </Badge>
          </Flex>

          {generatedMessage.subject && (
            <Box marginTop="small">
              <Text variant="microcopy" format={{ fontWeight: 'bold' }}>
                Subject:
              </Text>
              <Text>{generatedMessage.subject}</Text>
            </Box>
          )}

          <Box
            marginTop="small"
            padding="small"
            backgroundColor="neutral100"
            borderRadius="small"
          >
            <Text variant="microcopy" format={{ fontWeight: 'bold' }}>
              Message:
            </Text>
            <Text format={{ whiteSpace: 'pre-wrap' }}>
              {generatedMessage.body}
            </Text>
          </Box>

          <Flex gap="small" marginTop="small">
            <Button variant="secondary" onClick={handleCopyToClipboard}>
              Copy to Clipboard
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                window.open(
                  `${process.env.APP_URL}/leads/${contactId}`,
                  '_blank'
                )
              }
            >
              Open in Dashboard
            </Button>
          </Flex>
        </Box>
      )}
    </Flex>
  );
};

export default MessagePreviewCard;
