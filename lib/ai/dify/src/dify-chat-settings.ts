// [Send Chat Message - Dify Docs](https://docs.dify.ai/api-reference/chat/send-chat-message)
export type DifyChatModelId = string;

// Settings for dify API.
export interface DifyChatSettings {

  inputs?: Record<string, any>;

  /**
   * User ID.
   */
  user?: string;

  /**
   * Conversation ID to continue a conversation
   */
  conversation_id?: string;

  /**
   * Response mode: streaming、blocking.
   */
  response_mode?: "streaming" | "blocking";

  /**
   * Auto generate name: true or false.
   */
  auto_generate_name?: boolean;

  /**
   * API Key
   */
  apiKey?: string;
}
