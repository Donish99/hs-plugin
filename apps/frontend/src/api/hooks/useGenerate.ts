import { useQuery, useMutation } from '@tanstack/react-query';
import { generateApi, GenerateMessageInput, GenerateVariantsInput } from '../endpoints/generate';

export const generateKeys = {
  all: ['generate'] as const,
  templates: (channel?: 'email' | 'sms') => [...generateKeys.all, 'templates', channel] as const,
};

export function useTemplates(channel?: 'email' | 'sms') {
  return useQuery({
    queryKey: generateKeys.templates(channel),
    queryFn: () => generateApi.getTemplates(channel),
  });
}

export function useGenerateMessage() {
  return useMutation({
    mutationFn: (input: GenerateMessageInput) => generateApi.generateMessage(input),
  });
}

export function useGenerateVariants() {
  return useMutation({
    mutationFn: (input: GenerateVariantsInput) => generateApi.generateVariants(input),
  });
}

export function usePreviewMessage() {
  return useMutation({
    mutationFn: (input: GenerateMessageInput) => generateApi.preview(input),
  });
}

export function useGenerateBatch() {
  return useMutation({
    mutationFn: (input: {
      contactIds: string[];
      channel: 'email' | 'sms';
      tone?: 'professional' | 'friendly' | 'casual';
      templateId?: string;
    }) => generateApi.generateBatch(input),
  });
}

export function useValidateMessage() {
  return useMutation({
    mutationFn: (input: { channel: 'email' | 'sms'; subject?: string; body: string }) =>
      generateApi.validate(input),
  });
}

export function useEstimateCost() {
  return useMutation({
    mutationFn: (input: {
      contactCount: number;
      channel: 'email' | 'sms';
      includeVariants?: boolean;
    }) => generateApi.estimateCost(input),
  });
}
