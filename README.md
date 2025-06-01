<a href="https://www.aibangxuanxing.com/">
  <img alt="Next.js 14 and App Router-ready AI chatbot." src="public/images/dify-ai-provider.jpg">
  <h1 align="center">Dify Chatbot</h1>
</a>

## Dify AI Provider & Chatbot

- This project is based on the Vercel ecosystem of the [ai-chatbot](https://github.com/vercel/ai-chatbot) and [ai-sdk](https://github.com/vercel/ai), supports Dify conversation and file upload functions.
  * Based on [ai-chatbot](https://github.com/vercel/ai-chatbot) version 2025-05-25.

- Deployment process see original project [README.md](https://github.com/iChuck-W/ai-chatbot-dify-provider/blob/main/README_EN.md)


## Core Files

- Set up `.env` file. I've uniformly modified the 'title-model' and 'artifact-model' to '@ai-sdk/deepseek', so you have to set the `DEEPSEEK_API_KEY` or change to other models supported by [ai-sdk](https://ai-sdk.dev/providers/ai-sdk-providers).
```bash
# DeepSeek API Key: https://api-docs.deepseek.com/zh-cn/
DEEPSEEK_API_KEY=****
```

- Add Dify AI Provider
  * lib/ai/dify/src: Dify "AI SDK"
  > The application route uses the 'streamText' function, so set the default response_mode `streaming` when calling Dify. 
  * app/(chat)/api/chat-dify/route.ts
  * app/(chat)/api/files-dify/upload/route.ts
  * components/multimodal-input-dify.tsx
  > The file type and size limit must be consistent with Dify backend.

- Add custom model id: selectedChatModel: z.enum(['dify'])
  * lib/ai/entitlements.ts
  * lib/ai/models.ts
  * lib/ai/providers.ts
  * app/(chat)/api/chat-dify/schema.ts

- Add `initialChatModel`, select different rendering components for different models
  * components/artifacts.tsx
  * components/chat.tsx
  * components/messages.tsx
  * components/multimodal-input.tsx

- Ensure conversation continuity
  * lib/db/schema.ts: pgTable('Chat') extends difyConversationId field
  * Application chatId matches difyConversationId

- Search "// console.log" to remove comments and run to understand data transmission paths and fields.

## Documentation

- [Dify API Reference](https://docs.dify.ai/api-reference/)

- [packages/provider/src/language-model/v1](https://github.com/vercel/ai/tree/main/packages/provider/src/language-model/v1)
> The core interface of the language model, defining the methods and properties that the model must implement, mainly dependent on @ai-sdk/provider and @ai-sdk/provider-utils

- [streamText](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text)

- [community-providers](https://ai-sdk.dev/providers/community-providers)
  - [Qwen Provider](https://ai-sdk.dev/providers/community-providers/qwen)
  - [Zhipu AI Provider](https://ai-sdk.dev/providers/community-providers/zhipu)
  - [Dify Provider](https://ai-sdk.dev/providers/community-providers/dify)
