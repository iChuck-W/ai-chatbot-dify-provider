import { test, expect } from '@playwright/test';
import { DifyChatLanguageModel } from './dify-chat-language-model';
import type { DifyChatSettings } from './dify-chat-settings';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import type { LanguageModelV1CallOptions } from '@ai-sdk/provider';

// Create a mock response for testing
const createMockResponse = (status: number, data: any): Response => {
  const jsonString = JSON.stringify(data);
  const blob = new Blob([jsonString], { type: 'application/json' });
  return new Response(blob, {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
};

// Mock fetch function for testing
const mockFetch: FetchFunction = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input.toString();
  
  // Mock successful response for chat-messages endpoint
  if (url.includes('/chat-messages')) {
    if (init?.headers && (init.headers as any).Accept === 'text/event-stream') {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('event: message\ndata: {"event":"message","answer":"This is ","conversation_id":"test-conversation-id","task_id":"test-task-id"}\n\n'));
          controller.enqueue(encoder.encode('event: message\ndata: {"event":"message","answer":"a test response","conversation_id":"test-conversation-id","task_id":"test-task-id"}\n\n'));
          controller.enqueue(encoder.encode('event: workflow_finished\ndata: {"event":"workflow_finished","conversation_id":"test-conversation-id","task_id":"test-task-id","data":{"total_tokens":30}}\n\n'));
          controller.close();
        }
      });
      
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream' }
      });
    }
    
    return createMockResponse(200, {
      id: 'test-message-id',
      answer: 'This is a test response from Dify API',
      task_id: 'test-task-id',
      conversation_id: 'test-conversation-id',
      message_id: 'test-message-id',
      metadata: {
        usage: {
          completion_tokens: 10,
          prompt_tokens: 20,
          total_tokens: 30,
        },
      },
    });
  }
  
  // Default response for other endpoints
  return createMockResponse(404, { error: 'Not found' });
};

// Create a mock config
const createMockConfig = (apiKey = 'test-api-key') => {
  return {
    provider: 'dify',
    baseURL: 'https://api.dify.ai/v1',
    headers: () => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
    fetch: mockFetch as FetchFunction,
  };
};

// Create mock settings
const createMockSettings = (): DifyChatSettings => {
  return {
    apiKey: 'test-api-key',
    user: 'test-user',
    inputs: {},
    response_mode: 'streaming',
  };
};

test.describe('DifyChatLanguageModel', () => {
  test('should initialize with correct properties', () => {
    const model = new DifyChatLanguageModel(
      'difyProvider',
      createMockSettings(),
      createMockConfig()
    );
    
    expect(model.modelId).toBe('difyProvider');
    expect(model.provider).toBe('dify');
    expect(model.supportsStructuredOutputs).toBe(true);
  });
  
  test('should process user messages correctly', async () => {
    const model = new DifyChatLanguageModel(
      'difyProvider',
      createMockSettings(),
      createMockConfig()
    );
    
    const result = await model.doGenerate({
      mode: { type: 'regular' },
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Hello, how are you?' }] }
      ],
      providerMetadata: { files: { attachments: [] } },
      headers: {},
      inputFormat: 'messages',
    } as LanguageModelV1CallOptions);
    
    expect(result.text).toBe('This is a test response from Dify API');
    expect(result.finishReason).toBe('stop');
    expect(result.usage.promptTokens).toBe(20);
    expect(result.usage.completionTokens).toBe(10);
  });
  
  test('should handle conversation context', async () => {
    const model = new DifyChatLanguageModel(
      'difyProvider',
      createMockSettings(),
      createMockConfig()
    );
    
    // First message (new conversation)
    await model.doGenerate({
      mode: { type: 'regular' },
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Hello, how are you?' }] }
      ],
      providerMetadata: { files: { attachments: [] } },
      headers: {},
      inputFormat: 'messages',
    } as LanguageModelV1CallOptions);
    
    // Second message (continuing conversation)
    const result = await model.doGenerate({
      mode: { type: 'regular' },
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Hello, how are you?' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'I am fine, thank you!' }] },
        { role: 'user', content: [{ type: 'text', text: 'What can you do?' }] }
      ],
      providerMetadata: { files: { attachments: [] } },
      headers: {},
      inputFormat: 'messages',
    } as LanguageModelV1CallOptions);
    
    expect(result.text).toBe('This is a test response from Dify API');
  });
  
  test('should handle structured output mode', async () => {
    const model = new DifyChatLanguageModel(
      'difyProvider',
      createMockSettings(),
      createMockConfig()
    );
    
    const result = await model.doGenerate({
      mode: { type: 'object-json' },
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Return a JSON with name and age' }] }
      ],
      providerMetadata: { files: { attachments: [] } },
      headers: {},
      inputFormat: 'messages',
    } as LanguageModelV1CallOptions);
    
    expect(result.text).toBe('This is a test response from Dify API');
    // Check that the JSON format was requested in the API call
    expect(result.request?.body).toContain('"response_format":{"type":"json_object"}');
  });
  
  test('should throw error for unsupported mode', async () => {
    const model = new DifyChatLanguageModel(
      'difyProvider',
      createMockSettings(),
      createMockConfig()
    );
    
    await expect(model.doGenerate({
      mode: { type: 'object-tool', tool: { type: 'function', name: 'test', description: 'test', parameters: {} } },
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Use a tool' }] }
      ],
      providerMetadata: { files: { attachments: [] } },
      headers: {},
      inputFormat: 'messages',
    } as LanguageModelV1CallOptions)).rejects.toThrow('tool-mode object generation');
  });
  
  // Test streaming functionality
  test('should support streaming responses', async () => {
    const model = new DifyChatLanguageModel(
      'difyProvider',
      createMockSettings(),
      createMockConfig()
    );
    
    const result = await model.doStream({
      mode: { type: 'regular' },
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Stream a response' }] }
      ],
      providerMetadata: { files: { attachments: [] } },
      headers: {},
      inputFormat: 'messages',
    } as LanguageModelV1CallOptions);
    
    expect(result.stream).toBeDefined();
  });
});
