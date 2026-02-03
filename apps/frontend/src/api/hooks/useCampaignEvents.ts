import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { campaignsKeys } from './useCampaigns';
import { CampaignDetails, CampaignProgress, OutreachRecord } from '../endpoints/campaigns';
import { getAccountId, getPortalId } from '../client';

/**
 * Campaign event types from SSE
 */
export type CampaignEventType =
  | 'connected'
  | 'message_generating'
  | 'message_generated'
  | 'message_sent'
  | 'message_failed'
  | 'progress_update'
  | 'campaign_completed'
  | 'campaign_paused';

/**
 * Base event structure
 */
interface BaseCampaignEvent {
  type: CampaignEventType;
  campaignId: string;
  timestamp: string;
}

/**
 * Message generating event
 */
interface MessageGeneratingEvent extends BaseCampaignEvent {
  type: 'message_generating';
  data: {
    outreachRecordId: string;
    contactEmail?: string;
    contactName?: string;
  };
}

/**
 * Message generated event
 */
interface MessageGeneratedEvent extends BaseCampaignEvent {
  type: 'message_generated';
  data: {
    outreachRecordId: string;
    contactEmail?: string;
    contactName?: string;
    subject?: string;
    tokensUsed?: number;
  };
}

/**
 * Message sent event
 */
interface MessageSentEvent extends BaseCampaignEvent {
  type: 'message_sent';
  data: {
    outreachRecordId: string;
    contactEmail?: string;
    contactName?: string;
    channel: 'email' | 'sms';
    messageId?: string;
    sentAt: string;
  };
}

/**
 * Message failed event
 */
interface MessageFailedEvent extends BaseCampaignEvent {
  type: 'message_failed';
  data: {
    outreachRecordId: string;
    contactEmail?: string;
    contactName?: string;
    channel: 'email' | 'sms';
    error: string;
  };
}

/**
 * Progress update event
 */
interface ProgressUpdateEvent extends BaseCampaignEvent {
  type: 'progress_update';
  data: CampaignProgress;
}

/**
 * Campaign completed event
 */
interface CampaignCompletedEvent extends BaseCampaignEvent {
  type: 'campaign_completed';
  data: {
    total: number;
    sent: number;
    failed: number;
    completedAt: string;
  };
}

/**
 * Campaign paused event
 */
interface CampaignPausedEvent extends BaseCampaignEvent {
  type: 'campaign_paused';
  data: {
    pausedAt: string;
  };
}

/**
 * Union type for all events
 */
type CampaignEvent =
  | MessageGeneratingEvent
  | MessageGeneratedEvent
  | MessageSentEvent
  | MessageFailedEvent
  | ProgressUpdateEvent
  | CampaignCompletedEvent
  | CampaignPausedEvent;

/**
 * Event callbacks for external handling
 */
export interface CampaignEventCallbacks {
  onMessageGenerating?: (data: MessageGeneratingEvent['data']) => void;
  onMessageGenerated?: (data: MessageGeneratedEvent['data']) => void;
  onMessageSent?: (data: MessageSentEvent['data']) => void;
  onMessageFailed?: (data: MessageFailedEvent['data']) => void;
  onProgressUpdate?: (data: ProgressUpdateEvent['data']) => void;
  onCampaignCompleted?: (data: CampaignCompletedEvent['data']) => void;
  onCampaignPaused?: (data: CampaignPausedEvent['data']) => void;
  onConnected?: () => void;
  onError?: (error: Event) => void;
}

/**
 * Hook for subscribing to real-time campaign events via SSE
 */
export function useCampaignEvents(
  campaignId: string,
  enabled: boolean = true,
  callbacks?: CampaignEventCallbacks
) {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000;

  /**
   * Update campaign progress in React Query cache
   */
  const updateProgress = useCallback(
    (progress: CampaignProgress) => {
      queryClient.setQueryData<CampaignDetails>(
        campaignsKeys.detail(campaignId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            progress,
            sentCount: progress.sent,
          };
        }
      );
    },
    [campaignId, queryClient]
  );

  /**
   * Update outreach record in cache
   */
  const updateOutreachRecord = useCallback(
    (recordId: string, updates: Partial<OutreachRecord>) => {
      // Update in outreach list
      queryClient.setQueryData(
        campaignsKeys.outreach(campaignId, undefined),
        (old: { records: OutreachRecord[]; total: number; page: number; limit: number } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            records: old.records.map((record) =>
              record.id === recordId ? { ...record, ...updates } : record
            ),
          };
        }
      );

      // Also invalidate to ensure fresh data
      queryClient.invalidateQueries({
        queryKey: campaignsKeys.outreach(campaignId, undefined),
        refetchType: 'none',
      });
    },
    [campaignId, queryClient]
  );

  /**
   * Handle incoming SSE events
   */
  const handleEvent = useCallback(
    (event: MessageEvent, eventType: CampaignEventType) => {
      try {
        const data = JSON.parse(event.data) as CampaignEvent;

        switch (eventType) {
          case 'message_generating':
            callbacks?.onMessageGenerating?.(
              (data as MessageGeneratingEvent).data
            );
            break;

          case 'message_generated':
            callbacks?.onMessageGenerated?.(
              (data as MessageGeneratedEvent).data
            );
            break;

          case 'message_sent': {
            const sentData = (data as MessageSentEvent).data;
            updateOutreachRecord(sentData.outreachRecordId, {
              status: 'sent',
              sentAt: sentData.sentAt,
            });
            callbacks?.onMessageSent?.(sentData);
            // Refetch campaign to get updated counts
            queryClient.invalidateQueries({
              queryKey: campaignsKeys.detail(campaignId),
            });
            break;
          }

          case 'message_failed': {
            const failedData = (data as MessageFailedEvent).data;
            updateOutreachRecord(failedData.outreachRecordId, {
              status: 'failed',
            });
            callbacks?.onMessageFailed?.(failedData);
            // Refetch campaign to get updated counts
            queryClient.invalidateQueries({
              queryKey: campaignsKeys.detail(campaignId),
            });
            break;
          }

          case 'progress_update':
            updateProgress((data as ProgressUpdateEvent).data);
            callbacks?.onProgressUpdate?.((data as ProgressUpdateEvent).data);
            break;

          case 'campaign_completed': {
            const completedData = (data as CampaignCompletedEvent).data;
            queryClient.setQueryData<CampaignDetails>(
              campaignsKeys.detail(campaignId),
              (old) => {
                if (!old) return old;
                return {
                  ...old,
                  status: 'completed',
                  completedAt: completedData.completedAt,
                  sentCount: completedData.sent,
                  progress: {
                    total: completedData.total,
                    pending: 0,
                    sent: completedData.sent,
                    failed: completedData.failed,
                    generating: 0,
                    percentComplete: 100,
                  },
                };
              }
            );
            callbacks?.onCampaignCompleted?.(completedData);
            // Invalidate to get final state
            queryClient.invalidateQueries({
              queryKey: campaignsKeys.detail(campaignId),
            });
            queryClient.invalidateQueries({
              queryKey: campaignsKeys.outreach(campaignId, undefined),
            });
            break;
          }

          case 'campaign_paused':
            queryClient.setQueryData<CampaignDetails>(
              campaignsKeys.detail(campaignId),
              (old) => {
                if (!old) return old;
                return {
                  ...old,
                  status: 'paused',
                };
              }
            );
            callbacks?.onCampaignPaused?.((data as CampaignPausedEvent).data);
            break;
        }
      } catch (error) {
        console.error('Failed to parse SSE event:', error);
      }
    },
    [campaignId, callbacks, queryClient, updateProgress, updateOutreachRecord]
  );

  /**
   * Connect to SSE endpoint
   */
  const connect = useCallback(() => {
    const accountId = getAccountId();
    const portalId = getPortalId();
    if (!accountId || !campaignId || !portalId) return;

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    const url = `${apiUrl}/accounts/${accountId}/campaigns/${campaignId}/events?portal_id=${portalId}`;

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log(`SSE connected to campaign ${campaignId}`);
      reconnectAttemptsRef.current = 0;
    };

    // Listen for specific event types
    const eventTypes: CampaignEventType[] = [
      'connected',
      'message_generating',
      'message_generated',
      'message_sent',
      'message_failed',
      'progress_update',
      'campaign_completed',
      'campaign_paused',
    ];

    eventTypes.forEach((eventType) => {
      eventSource.addEventListener(eventType, (event) => {
        if (eventType === 'connected') {
          callbacks?.onConnected?.();
        } else {
          handleEvent(event as MessageEvent, eventType);
        }
      });
    });

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      callbacks?.onError?.(error);

      // Close the errored connection
      eventSource.close();
      eventSourceRef.current = null;

      // Attempt reconnection with exponential backoff
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay =
          baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
        reconnectAttemptsRef.current++;
        console.log(
          `SSE reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`
        );
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    };
  }, [campaignId, handleEvent, callbacks]);

  /**
   * Disconnect from SSE endpoint
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
  }, []);

  // Connect/disconnect based on enabled state
  useEffect(() => {
    if (enabled && campaignId) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, campaignId, connect, disconnect]);

  return {
    isConnected: eventSourceRef.current?.readyState === EventSource.OPEN,
    disconnect,
    reconnect: connect,
  };
}
