export type DifyFileType = 'document' | 'image' | 'audio' | 'video';
export type DifyTransferMethod = 'remote_url' | 'local_file';

export const SUPPORTED_DOCUMENT_TYPES = [
  'application/octet-stream',      
  'text/plain',                    
  'text/markdown',                 
  'application/pdf',               
  'text/html',                     
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',      
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
  'text/csv',                
  'message/rfc822',    
  'application/vnd.ms-outlook',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', 
  'application/vnd.ms-powerpoint',
  'application/xml',          
  'application/epub+zip',
] as const;

export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',                    
  'image/png',                     
  'image/gif',                     
  'image/webp',                    
  'image/svg+xml',                 
] as const;

export const SUPPORTED_AUDIO_TYPES = [
  'audio/mpeg',                    
  'audio/mp4',                     
  'audio/wav',                     
  'audio/webm',                    
  'audio/amr',                     
] as const;

export const SUPPORTED_VIDEO_TYPES = [
  'video/mp4',                     
  'video/quicktime',               
  'video/mpeg',                    
  'audio/mpeg',                    
] as const;

export const SUPPORTED_FILE_TYPES = [
  ...SUPPORTED_DOCUMENT_TYPES,
  ...SUPPORTED_IMAGE_TYPES,
  ...SUPPORTED_AUDIO_TYPES,
  ...SUPPORTED_VIDEO_TYPES
] as const;

export type SupportedMimeType = typeof SUPPORTED_FILE_TYPES[number];

type MimeTypesConfig = {
  readonly [K in DifyFileType | 'default']: readonly string[];
};

type SizeLimitsConfig = {
  readonly [K in DifyFileType | 'default']: number;
};

export type FileConfigType = {
  readonly sizeLimits: SizeLimitsConfig;
  readonly mimeTypes: MimeTypesConfig;
  readonly maxFiles: number;
  validateFile(file: File | Blob, type: keyof MimeTypesConfig): void;
};

export const MIME_TYPE_MAP: Record<DifyFileType, readonly SupportedMimeType[]> = {
  document: SUPPORTED_DOCUMENT_TYPES,
  image: SUPPORTED_IMAGE_TYPES,
  audio: SUPPORTED_AUDIO_TYPES,
  video: SUPPORTED_VIDEO_TYPES
};

export const FileConfig: FileConfigType = {
  sizeLimits: {
    document: 15 * 1024 * 1024,
    image: 10 * 1024 * 1024,
    audio: 50 * 1024 * 1024,
    video: 100 * 1024 * 1024,
    default: 20 * 1024 * 1024
  },
  mimeTypes: {
    document: SUPPORTED_DOCUMENT_TYPES,
    image: SUPPORTED_IMAGE_TYPES,
    audio: SUPPORTED_AUDIO_TYPES,
    video: SUPPORTED_VIDEO_TYPES,
    default: SUPPORTED_DOCUMENT_TYPES
  },
  maxFiles: 3,
  validateFile(file: File | Blob, type: keyof MimeTypesConfig) {
    const mimeType = file instanceof File ? file.type : 'application/octet-stream';
    
    if (mimeType === 'application/octet-stream') {
      return;
    }
    if (!SUPPORTED_FILE_TYPES.includes(mimeType as SupportedMimeType)) {
      throw new Error(`不支持的文件类型：${mimeType}`);
    }

    const limit = FileConfig.sizeLimits[type] || FileConfig.sizeLimits.default;
    if (file.size > limit) {
      throw new Error(`文件大小超过 ${limit / 1024 / 1024}MB 限制`);
    }
  }
} as const;
