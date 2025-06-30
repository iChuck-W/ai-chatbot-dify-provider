import {
  APICallError,
  UnsupportedFunctionalityError,
  type JSONValue,
  type LanguageModelV1,
  type LanguageModelV1CallWarning,
  type LanguageModelV1FinishReason,
  type LanguageModelV1StreamPart,
  type LanguageModelV1CallOptions,
} from '@ai-sdk/provider';
import {
  type FetchFunction,
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
  type ParseResult,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';

import type {
  DifyChatModelId,
  DifyChatSettings,
} from "./dify-chat-settings"

interface DifyChatConfig {
  provider: string
  headers: () => Record<string, string | undefined>
  baseURL: string;
  fetch?: FetchFunction
}

const completionResponseSchema = z.object({
  id: z.string(),
  answer: z.string(),
  task_id: z.string(),
  conversation_id: z.string(),
  message_id: z.string(),
  metadata: z.object({
    usage: z.object({
      completion_tokens: z.number(),
      prompt_tokens: z.number(),
      total_tokens: z.number(),
    }),
  }),
});

const errorResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  detail: z.optional(z.record(z.unknown())),
});

const difyFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: errorResponseSchema,
  errorToMessage: (data) => `Dify API error: ${data.message}`,
});

// For TypeScript compatibility
interface ExtendedLanguageModelV1CallOptions
  extends LanguageModelV1CallOptions {
  messages?: Array<{
    role: string;
    content: string | Array<string | { type: string; [key: string]: any }>;
  }>;
}

// Define a base schema with common fields that all events might have
const difyStreamEventBase = z
  .object({
    event: z.string(),
    conversation_id: z.string().optional(),
    message_id: z.string().optional(),
    task_id: z.string().optional(),
    created_at: z.number().optional(),
  })
  .passthrough();

// Create schemas for specific event types
const workflowStartedSchema = difyStreamEventBase.extend({
  event: z.literal("workflow_started"),
  workflow_run_id: z.string(),
  data: z
    .object({
      id: z.string(),
      workflow_id: z.string(),
      created_at: z.number(),
    })
    .passthrough(),
});

const workflowFinishedSchema = difyStreamEventBase.extend({
  event: z.literal("workflow_finished"),
  workflow_run_id: z.string(),
  data: z
    .object({
      id: z.string(),
      workflow_id: z.string(),
      total_tokens: z.number().optional(),
      created_at: z.number(),
    })
    .passthrough(),
});

const nodeStartedSchema = difyStreamEventBase.extend({
  event: z.literal("node_started"),
  workflow_run_id: z.string(),
  data: z
    .object({
      id: z.string(),
      node_id: z.string(),
      node_type: z.string(),
    })
    .passthrough(),
});

const nodeFinishedSchema = difyStreamEventBase.extend({
  event: z.literal("node_finished"),
  workflow_run_id: z.string(),
  data: z
    .object({
      id: z.string(),
      node_id: z.string(),
      node_type: z.string(),
    })
    .passthrough(),
});

const messageSchema = difyStreamEventBase.extend({
  event: z.literal("message"),
  id: z.string().optional(),
  answer: z.string(),
  from_variable_selector: z.array(z.string()).optional(),
});

const messageEndSchema = difyStreamEventBase.extend({
  event: z.literal("message_end"),
  id: z.string(),
  metadata: z
    .object({
      usage: z
        .object({
          prompt_tokens: z.number(),
          completion_tokens: z.number(),
          total_tokens: z.number(),
        })
        .passthrough(),
    })
    .passthrough(),
  files: z.array(z.unknown()).optional(),
});

const ttsMessageSchema = difyStreamEventBase.extend({
  event: z.literal("tts_message"),
  audio: z.string(),
});

const ttsMessageEndSchema = difyStreamEventBase.extend({
  event: z.literal("tts_message_end"),
  audio: z.string(),
});

// Combine all schemas with discriminatedUnion
const difyStreamEventSchema = z
  .discriminatedUnion("event", [
    workflowStartedSchema,
    workflowFinishedSchema,
    nodeStartedSchema,
    nodeFinishedSchema,
    messageSchema,
    messageEndSchema,
    ttsMessageSchema,
    ttsMessageEndSchema,
  ])
  .or(difyStreamEventBase); // Fallback for any other event types

type DifyStreamEvent = z.infer<typeof difyStreamEventSchema>;

// To store the conversation_id and chat.id
export const conversationIdMap = new Map<string, string>();

export class DifyChatLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly modelId: string;
  readonly supportsStructuredOutputs = true;
  readonly defaultObjectGenerationMode = 'json';

  private readonly sessionManager;
  private readonly config: DifyChatConfig;

  constructor(
    modelId: DifyChatModelId, 
    private settings: DifyChatSettings,
    config: DifyChatConfig,
    sessionManager = createDifySessionManager()
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
    this.sessionManager = sessionManager;
  }

  get provider(): string {
    return this.config.provider
  }

  private getArgs({
    mode,
    prompt,
    providerMetadata,
    headers
  }: Parameters<LanguageModelV1["doGenerate"]>[0]) {

    const type = mode.type;
    const warnings: LanguageModelV1CallWarning[] = [];

    // Get user query from the latest message
    const latestMessage = prompt[prompt.length - 1];

    if (latestMessage.role !== "user") {
      throw new APICallError({
        message: "The last message must be a user message",
        url: this.config.baseURL,
        requestBodyValues: { latestMessageRole: latestMessage.role },
      });
    }

    // Determine if it's a new conversation ID, only one user message and no assistant messages
    // If it's a new conversation, use undefined to start a new session
    // If it's a continuing conversation, use the existing conversation ID from sessionManager
    const userMessages = prompt.filter(message => message.role === 'user');
    const assistantMessages = prompt.filter(message => message.role === 'assistant');
    const conversationId = headers?.conversationId as string | undefined;
    let finalConversationId = conversationId;
    if (!finalConversationId) {
      const isNewConversation = userMessages.length === 1 && assistantMessages.length === 0;
      finalConversationId = isNewConversation ? undefined : this.sessionManager.getConversationId();
    }
    
    // console.log(`dify-chat-language-model: headers conversationId=${conversationId}, finalConversationId=${finalConversationId}`);
    
    // Extract query text from the latest message
    let query = '';
    if (typeof latestMessage.content === 'string') {
      query = latestMessage.content;
    } else if (Array.isArray(latestMessage.content)) {
      // Handle AI SDK v4 format content array
      query = latestMessage.content
        .map((part: any) => {
          if (typeof part === "string") {
            return part;
          } else if (part.type === "text") {
            return part.text;
          }
          return "";
        })
        .filter(Boolean)
        .join(" ");
    }
    
    // Get user ID from request headers, using userId as the identifier
    const userId = headers?.userId;
    
    // Extract files directly from providerMetadata
    const files = providerMetadata?.files?.attachments ?? [];
    
    const baseArgs = {
      inputs: this.settings.inputs || {},
      query,
      user: userId,
      conversation_id: finalConversationId,
      response_mode: 'streaming',
      files,
    };

    // console.log('dify-chat-language-model-query:', query);
    // console.log('dify-chat-language-model-files:', JSON.stringify(baseArgs.files, null, 2));

    switch (type) {
      case 'regular': {
        return { args: baseArgs, warnings };
      }

      case "object-json": {
        return {
          args: {
            ...baseArgs,
            response_format: { type: "json_object" },
          },
          warnings,
        };
      }
  
      case 'object-tool': {
        throw new UnsupportedFunctionalityError({
          functionality: 'tool-mode object generation',
        });
      }
  
      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }


/**
 * Generates a text response from the model.
 * @param options - Options for the generate call.
 * @returns A promise that resolves to the generated result.
 */
  async doGenerate(
    options: ExtendedLanguageModelV1CallOptions,
  ): Promise<Awaited<ReturnType<LanguageModelV1["doGenerate"]>>> {
    const { args, warnings } = this.getArgs(options);
    const { inputs: rawPrompt, ...rawSettings } = args;

    const body = { ...args };    
    const sessionManager = this.sessionManager;

    const { 
      responseHeaders,
      value: response,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/chat-messages`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body: body,
      failedResponseHandler: difyFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        completionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    extractConversationId(response).then(conversationId => {
      if (conversationId && sessionManager) {
        sessionManager.setConversationId(conversationId);
      }
    });

    return {
      text: response.answer,
      finishReason: 'stop' as LanguageModelV1FinishReason,
      usage: {
        promptTokens: response.metadata?.usage?.prompt_tokens ?? Number.NaN,
        completionTokens: response.metadata?.usage?.completion_tokens ?? Number.NaN,
      },
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      request: { body: JSON.stringify(args) },
      response: response,
      warnings,
    };
  }

  /**
   * Generates a streaming text response from the model.
   * @param options - Generation options.
   * @returns A promise resolving with the generation result.
   */
  async doStream(
    options: ExtendedLanguageModelV1CallOptions,
  ): Promise<Awaited<ReturnType<LanguageModelV1["doStream"]>>> {

    const { args, warnings } = this.getArgs(options);
    const body = { ...args };
    const { inputs: rawPrompt, ...rawSettings } = args;
    const sessionManager = this.sessionManager;

    //console.log('dify-chat-language-model-Request', JSON.stringify(body, null, 2));
    
    const { 
      responseHeaders, 
      value: response
    } = await postJsonToApi({
      url: `${this.config.baseURL}/chat-messages`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: difyFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        difyStreamEventSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      stream: response.pipeThrough(
        new TransformStream<
        ParseResult<DifyStreamEvent>,
          LanguageModelV1StreamPart
        >({
          transform(chunk, controller) {
            // If parsing fails, send error and return
            if (!chunk.success) {
              controller.enqueue({ type: "error", error: chunk.error });
              return;
            }

            // Log the chunk value for debugging
            // console.log('dify-chat-language-model-value:', JSON.stringify(chunk.value, null, 2));

            const data = chunk.value;

            let conversationId: string | undefined;
            let messageId: string | undefined;
            let taskId: string | undefined;
            
            if (data.conversation_id) {
              conversationId = data.conversation_id;
              // Update session manager with conversation ID
              if (sessionManager) {
                sessionManager.setConversationId(conversationId);
              }

              // save conversation_id to global map
              const chatId = options.headers?.chatId as string | undefined;
              if (chatId) {
                const existingConversationId = conversationIdMap.get(chatId);
                if (existingConversationId !== conversationId) {
                  conversationIdMap.set(chatId, conversationId);
                  console.log(`Updated conversation_id ${conversationId} for chat ${chatId} in global map`);
                }
              }
            }
            
            if (data.task_id) taskId = data.task_id;
            
            // Handle different types of events
            switch (data.event) {   
              // Handle message event - return text delta
              case "message": {
                if ("answer" in data && typeof data.answer === 'string') {
                  controller.enqueue({
                    type: "text-delta",
                    textDelta: data.answer,
                  });
                }
                break;
              }
              
              // Handle workflow finished event
              case "workflow_finished": {
                let totalTokens = 0;

                // Type guard for data.data
                if (
                  "data" in data &&
                  data.data &&
                  typeof data.data === "object" &&
                  "total_tokens" in data.data &&
                  typeof data.data.total_tokens === "number"
                ) {
                  totalTokens = data.data.total_tokens;
                }

                controller.enqueue({
                  type: "finish",
                  finishReason: "stop" as LanguageModelV1FinishReason,
                  providerMetadata: {
                    difyWorkflowData: {
                      conversationId: conversationId as JSONValue,
                      messageId: messageId as JSONValue,
                      taskId: taskId as JSONValue,
                    },
                  },
                  usage: {
                    promptTokens: 0,
                    completionTokens: totalTokens,
                  },
                });
                break;
              }
            }
          }
        })
      ),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      request: { body: JSON.stringify(body) },
      warnings,
    };
  }
}

/**
 * Create a Dify session manager to manage session ID
 * @returns session manager object
 */
export function createDifySessionManager() {
  let conversationId: string | undefined;

  return {
    /**
     * Set the current conversation ID
     * @param id - The conversation ID to set
     */
    setConversationId(id: string | undefined) {
      conversationId = id;
    },

    /**
     * Get the current conversation ID
     * @returns The current conversation ID
     */
    getConversationId() {
      return conversationId;
    },

    /**
     * Reset the conversation state
     * Called when a new conversation is started
     */
    resetConversation() {
      conversationId = undefined;
    },
  };
}

/**
 * Extract the conversation ID from the response
 * @param response - The response object or response data
 * @returns The extracted conversation ID, or undefined if not found
 */
export async function extractConversationId(
  response: Response | any
): Promise<string | undefined> {
  try {
    // If it's a Response object, try to parse JSON
    if (response instanceof Response) {
      const clonedResponse = response.clone();
      const data = await clonedResponse.json();
      return data.conversation_id;
    }
    
    // If it's a response metadata object
    if (response && typeof response === 'object') {
      // Check if it has already been processed by getResponseMetadata
      if (response.conversationId) {
        return response.conversationId;
      }
      // Check the original response
      return response.conversation_id;
    }
    
    return undefined;
  } catch (error) {
    console.error('提取会话 ID 时出错:', error);
    return undefined;
  }
}
