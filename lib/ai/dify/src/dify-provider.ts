import { 
  FetchFunction, 
  loadApiKey
} from "@ai-sdk/provider-utils";
import { 
  DifyChatSettings, 
  DifyChatModelId
} from "./dify-chat-settings";
import { DifyChatLanguageModel } from "./dify-chat-language-model";

// Dify provider interface.
export interface DifyProvider {
  (
    modelId: DifyChatModelId,
    settings?: DifyChatSettings
  ): DifyChatLanguageModel;

  // Create a new chat model for text generation.
  chat(
    modelId: DifyChatModelId,
    settings?: DifyChatSettings
  ): DifyChatLanguageModel;
}

// Dify provider settings interface.
export interface DifyProviderSettings {
  /**
   * Base URL for the Dify API calls.
   * @default 'https://api.dify.ai/v1'
   */
  baseURL?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

// Create a new Dify provider instance.
export function createDifyProvider(
  options: DifyProviderSettings = {}
): DifyProvider {
  const createChatModel = (
    modelId: DifyChatModelId,
    settings: DifyChatSettings = {}
  ) =>
    new DifyChatLanguageModel(modelId, settings, {
      provider: "dify.chat",
      baseURL: options.baseURL || "https://api.dify.ai/v1",
      headers: () => ({
        Authorization: `Bearer ${loadApiKey({
          apiKey: settings.apiKey,
          environmentVariableName: "DIFY_API_KEY",
          description: "Dify API Key",
        })}`,
        "Content-Type": "application/json",
        ...options.headers,
      }),
    });

  const provider = function (
    modelId: DifyChatModelId,
    settings?: DifyChatSettings
  ) {
    if (new.target) {
      throw new Error(
        "The model factory function cannot be called with the new keyword."
      );
    }

    return createChatModel(modelId, settings);
  };

  provider.chat = createChatModel;

  return provider;
}

// Default Dify provider instance.
export const difyProvider = createDifyProvider();
