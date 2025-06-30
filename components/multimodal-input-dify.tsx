'use client';

import type { Attachment, UIMessage } from 'ai';
import cx from 'classnames';
import type React from 'react';
import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
  type ChangeEvent,
  memo,
} from 'react';
import { toast } from 'sonner';
import { useLocalStorage, useWindowSize } from 'usehooks-ts';

import { ArrowUpIcon, PaperclipIcon, StopIcon } from './icons';
import { PreviewAttachment } from './preview-attachment';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { SuggestedActions } from './suggested-actions';
import equal from 'fast-deep-equal';
import type { UseChatHelpers } from '@ai-sdk/react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import { useScrollToBottom } from '@/hooks/use-scroll-to-bottom';
import type { VisibilityType } from './visibility-selector';

import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from './ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './ui/dropdown-menu';
import { 
  MIME_TYPE_MAP,
  type DifyFileType, 
  type DifyTransferMethod,
  FileConfig
} from '@/lib/ai/dify/src/dify-file-types-all';

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  append,
  handleSubmit,
  className,
  selectedVisibilityType,
  initialChatModel,
}: {
  chatId: string;
  input: UseChatHelpers['input'];
  setInput: UseChatHelpers['setInput'];
  status: UseChatHelpers['status'];
  stop: () => void;
  attachments: Array<Attachment>;
  setAttachments: Dispatch<SetStateAction<Array<Attachment>>>;
  messages: Array<UIMessage>;
  setMessages: UseChatHelpers['setMessages'];
  append: UseChatHelpers['append'];
  handleSubmit: UseChatHelpers['handleSubmit'];
  className?: string;
  selectedVisibilityType: VisibilityType;
  initialChatModel: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, []);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
    }
  };

  const resetHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = '98px';
    }
  };

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    'input',
    '',
  );

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue || localStorageInput || '';
      setInput(finalValue);
      adjustHeight();
    }
    // Only run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    adjustHeight();
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([]);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [remoteFileUrl, setRemoteFileUrl] = useState('');

  const submitForm = useCallback(() => {
    window.history.replaceState({}, '', `/chat/${chatId}`);

    handleSubmit(undefined, {
      experimental_attachments: attachments,
    });

    setAttachments([]);
    setLocalStorageInput('');
    resetHeight();

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    attachments,
    handleSubmit,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
  ]);

  // Upload local file
  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/files-dify/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();

        const mimeType = data.mime_type;
        let fileType: DifyFileType = 'document';
        
        for (const [type, mimeTypes] of Object.entries(MIME_TYPE_MAP)) {
          if (mimeTypes.includes(mimeType as any)) {
            fileType = type as DifyFileType;
            break;
          }
        }

        return {
          name: file.name,
          url: `data:${data.mime_type};base64,AA==`,
          contentType: data.mime_type,
          transfer_method: 'local_file' as DifyTransferMethod,
          upload_file_id: data.id,
          type: fileType
        };
      }
      const { error } = await response.json();
      toast.error(error);
    } catch (error) {
      toast.error('上传文档失败，请重试！');
    }
  };

  // Handle file selection
  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    if (attachments.length + files.length > FileConfig.maxFiles) {
      toast.error(`最多只能上传 ${FileConfig.maxFiles} 个文件`);
      return;
    }

    const validFiles: File[] = [];
    const uploadQueue: string[] = [];
    
    for (const file of Array.from(files)) {
      try {
        FileConfig.validateFile(file, 'document');
        validFiles.push(file);
        uploadQueue.push(file.name);
      } catch (error) {
        if (error instanceof Error) {
          toast.error(`文件 "${file.name}": ${error.message}`);
        } else {
          toast.error(`文件 "${file.name}" 验证失败`);
        }
      }
    }
    
    if (validFiles.length === 0) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }
    
    setUploadQueue(uploadQueue);

    try {
      const newAttachments = await Promise.all(
        validFiles.map((file) => uploadFile(file))
      );

      const validAttachments = newAttachments.filter((attachment): attachment is NonNullable<typeof attachment> => 
        attachment !== undefined
      );

      setAttachments([...attachments, ...validAttachments]);
    } catch (error) {
      toast.error('上传文件失败，请重试！');
    } finally {
      setUploadQueue([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle remote file
  const handleRemoteFile = () => {
    if (!remoteFileUrl.trim()) {
      toast.error('请输入有效的文件 URL');
      return;
    }

    if (attachments.length >= FileConfig.maxFiles) {
      toast.error(`最多只能上传 ${FileConfig.maxFiles} 个文件`);
      setShowUrlInput(false);
      return;
    }

    const fileExtension = remoteFileUrl.split('.').pop()?.toLowerCase() || '';
    let fileType: DifyFileType = 'document';
    
    const mimeType = 
    MIME_TYPE_MAP.document.find(type => type.endsWith(`/${fileExtension}`));
    
    const supportedExtensions = [
      'txt', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 
      'csv', 'md', 'markdown', 'html', 'xml', 'eml', 'msg', 'epub'
    ];
    
    if (!fileExtension || !supportedExtensions.includes(fileExtension)) {
      toast.error('不支持的文件类型，目前仅支持文档内容解读');
      return;
    }
    
    if (mimeType) {
      for (const [type, mimeTypes] of Object.entries(MIME_TYPE_MAP)) {
        if (mimeTypes.includes(mimeType)) {
          fileType = type as DifyFileType;
          break;
        }
      }
    }
    
    const newAttachment = {
      url: remoteFileUrl,
      name: remoteFileUrl.split('/').pop() || 'online-file',
      contentType: mimeType || `${fileType}/${fileExtension || 'unknown'}`,
      transfer_method: 'remote_url' as DifyTransferMethod,
      type: fileType
    };
    
    setAttachments([...attachments, newAttachment]);
    setRemoteFileUrl('');
    setShowUrlInput(false);
  };

  const { isAtBottom, scrollToBottom } = useScrollToBottom();

  useEffect(() => {
    if (status === 'submitted') {
      scrollToBottom();
    }
  }, [status, scrollToBottom]);

  return (
    <div className="relative w-full flex flex-col gap-4">
      <AnimatePresence>
        {!isAtBottom && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="absolute left-1/2 bottom-28 -translate-x-1/2 z-50"
          >
            <Button
              data-testid="scroll-to-bottom-button"
              className="rounded-full"
              size="icon"
              variant="outline"
              onClick={(event) => {
                event.preventDefault();
                scrollToBottom();
              }}
            >
              <ArrowDown />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {messages.length === 0 &&
        attachments.length === 0 &&
        uploadQueue.length === 0 && (
          <SuggestedActions
            append={append}
            chatId={chatId}
            selectedVisibilityType={selectedVisibilityType}
            modelId={initialChatModel}
          />
        )}

      <input
        type="file"
        className="fixed -top-4 -left-4 size-0.5 opacity-0 pointer-events-none"
        ref={fileInputRef}
        multiple
        onChange={handleFileSelect}
        tabIndex={-1}
      />

      {(attachments.length > 0 || uploadQueue.length > 0) && (
        <div
          data-testid="attachments-preview"
          className="flex flex-row gap-2 overflow-x-scroll items-end"
        >
          {attachments.map((attachment) => (
            <div key={attachment.url} className="relative">
              <PreviewAttachment 
                key={attachment.url} 
                attachment={attachment}
              />
              <button
                type="button"
                className="absolute top-0 right-0 bg-black/50 rounded-full p-1 text-white text-xs"
                onClick={() => {
                  setAttachments((attachments) =>
                    attachments.filter((a) => a.name !== attachment.name),
                  );
                }}
              >
                ✕
              </button>
            </div>
          ))}

          {uploadQueue.map((filename) => (
            <PreviewAttachment
              key={filename}
              attachment={{
                url: '',
                name: filename,
                contentType: '',
              }}
              isUploading={true}
            />
          ))}
        </div>
      )}

      <Textarea
        data-testid="multimodal-input"
        ref={textareaRef}
        placeholder="开始对话..."
        value={input}
        onChange={handleInput}
        className={cx(
          'min-h-[24px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-2xl !text-base bg-muted pb-10 dark:border-zinc-700',
          className,
        )}
        rows={2}
        autoFocus
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();

            if (status !== 'ready') {
              toast.error('请等待模型完成响应！');
            } else {
              submitForm();
            }
          }
        }}
      />

      <div className="absolute bottom-0 p-2 w-fit flex flex-row justify-start">
        <AttachmentsButton fileInputRef={fileInputRef} status={status} setShowUrlInput={setShowUrlInput} />
      </div>

      <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end">
        {status === 'submitted' ? (
          <StopButton stop={stop} setMessages={setMessages} />
        ) : (
          <SendButton
            input={input}
            submitForm={submitForm}
            uploadQueue={uploadQueue}
          />
        )}
      </div>

      {showUrlInput && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-800 p-6 rounded-lg w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">输入文件 URL</h3>
            <input
              type="text"
              value={remoteFileUrl}
              onChange={(event) => setRemoteFileUrl(event.target.value)}
              placeholder="https://document.pdf"
              className="w-full border rounded p-2 mb-4 dark:bg-zinc-700 dark:border-zinc-600"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleRemoteFile();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowUrlInput(false)}>
                取消
              </Button>
              <Button onClick={handleRemoteFile}>确定</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const MultimodalInputDify = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) return false;
    if (prevProps.status !== nextProps.status) return false;
    if (!equal(prevProps.attachments, nextProps.attachments)) return false;
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType)
      return false;

    return true;
  },
);

function PureAttachmentsButton({
  fileInputRef,
  status,
  setShowUrlInput,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers['status'];
  setShowUrlInput: (showUrlInput: boolean) => void;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <DropdownMenu>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                data-testid="attachments-button"
                className="rounded-md rounded-bl-lg p-[7px] h-fit dark:border-zinc-700 hover:dark:bg-zinc-900 hover:bg-zinc-200"
                disabled={status !== 'ready'}
                variant="ghost"
              >
                <PaperclipIcon size={14} />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => {
              fileInputRef.current?.click();
            }}>
              上传本地文件
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              setShowUrlInput(true);
            }}>
              上传在线文件
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipContent side="top">
          <p>● 文件数量：最多 {FileConfig.maxFiles} 个</p>
          <p>● 支持多种格式文档，大小限制：15.00MB</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers['setMessages'];
}) {
  return (
    <Button
      data-testid="stop-button"
      className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);

function PureSendButton({
  submitForm,
  input,
  uploadQueue,
}: {
  submitForm: () => void;
  input: string;
  uploadQueue: Array<string>;
}) {
  return (
    <Button
      data-testid="send-button"
      className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
      onClick={(event) => {
        event.preventDefault();
        submitForm();
      }}
      disabled={input.length === 0 || uploadQueue.length > 0}
    >
      <ArrowUpIcon size={14} />
    </Button>
  );
}

const SendButton = memo(PureSendButton, (prevProps, nextProps) => {
  if (prevProps.uploadQueue.length !== nextProps.uploadQueue.length)
    return false;
  if (prevProps.input !== nextProps.input) return false;
  return true;
});
