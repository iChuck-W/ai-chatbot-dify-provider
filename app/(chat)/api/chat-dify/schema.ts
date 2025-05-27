import { z } from 'zod';
import { SUPPORTED_FILE_TYPES } from '@/lib/ai/dify/src/dify-file-types-all';

const textPartSchema = z.object({
  text: z.string().min(1).max(2000),
  type: z.enum(['text']),
});

const attachmentSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(2000),
  contentType: z.enum(SUPPORTED_FILE_TYPES),
  type: z.enum(['image', 'audio', 'video', 'document']).optional(),
  transfer_method: z.enum(['remote_url', 'local_file']).optional(),
  upload_file_id: z.string().optional(),
});

export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  message: z.object({
    id: z.string().uuid(),
    createdAt: z.coerce.date(),
    role: z.enum(['user']),
    content: z.string().min(1).max(2000),
    parts: z.array(textPartSchema),
    experimental_attachments: z.array(attachmentSchema).optional(),
  }),
  selectedChatModel: z.enum(['chat-model', 'chat-model-reasoning', 'dify']),
  selectedVisibilityType: z.enum(['public', 'private']),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
