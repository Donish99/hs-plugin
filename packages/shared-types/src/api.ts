/**
 * API-related types for request/response handling
 */

export interface PaginatedRequest {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface HubSpotAccount {
  id: string;
  portalId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalyticsSummary {
  totalCampaigns: number;
  activeCampaigns: number;
  totalLeadsReactivated: number;
  totalMessagesSent: number;
  averageOpenRate: number;
  averageReplyRate: number;
  revenueGenerated?: number;
}

export interface DateRangeFilter {
  startDate: Date;
  endDate: Date;
}
