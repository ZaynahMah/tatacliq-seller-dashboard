'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileSpreadsheet, X, Check, AlertCircle } from 'lucide-react';
import { uploadFile } from '@/lib/api';
import { cn } from '@/lib/utils';

interface UploadedFile {
  file: File;
  status: 'uploading' | 'done' | 'error';
  storageKey?: string;
  error?: string;
}

interface FileUploaderProps {
  onComplete?: (files: UploadedFile[]) => void;
  accept?: string;
  maxSizeMb?: number;
}

export function FileUploader({
  onComplete,
  accept = '.xlsx,.xls,.csv,.zip,image/*',
  maxSizeMb = 50,
}: FileUploaderProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const incoming = Array.from(fileList);
      const next: UploadedFile[] = incoming.map((file) => ({ file, status: 'uploading' }));
      setFiles((prev) => [...prev, ...next]);

      for (const item of next) {
        if (item.file.size > maxSizeMb * 1024 * 1024) {
          setFiles((prev) =>
            prev.map((f) =>
              f.file === item.file ? { ...f, status: 'error', error: `Max ${maxSizeMb}MB` } : f,
            ),
          );
          continue;
        }
        try {
          const result = await uploadFile(item.file);
          setFiles((prev) =>
            prev.map((f) =>
              f.file === item.file ? { ...f, status: 'done', storageKey: result.storageKey } : f,
            ),
          );
        } catch (err: any) {
          setFiles((prev) =>
            prev.map((f) =>
              f.file === item.file ? { ...f, status: 'error', error: err.message } : f,
            ),
          );
        }
      }

      onComplete?.(files);
    },
    [maxSizeMb, onComplete, files],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const removeFile = (file: File) => setFiles((prev) => prev.filter((f) => f.file !== file));

  return (
    <div className="space-y-3">
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'relative cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all',
          dragActive
            ? 'border-royal-500 bg-royal-50 dark:bg-royal-950/30'
            : 'border-ink-200 hover:border-royal-400 hover:bg-royal-50/50 dark:border-ink-700 dark:hover:bg-royal-950/20',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-royal-500 to-royal-700 text-white shadow-soft">
            <Upload className="h-7 w-7" />
          </div>
          <div>
            <div className="font-semibold text-ink-900 dark:text-ink-50">
              Drag & drop seller files here
            </div>
            <div className="mt-1 text-sm text-ink-500">
              or <span className="text-royal-600 font-medium">browse</span> — Excel, CSV, ZIP,
              images up to {maxSizeMb}MB
            </div>
          </div>
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900"
            >
              <FileSpreadsheet className="h-5 w-5 text-royal-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                  {f.file.name}
                </div>
                <div className="text-xs text-ink-500">
                  {(f.file.size / 1024).toFixed(0)} KB
                  {f.error && ` • ${f.error}`}
                </div>
              </div>
              {f.status === 'uploading' && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-royal-300 border-t-royal-600" />
              )}
              {f.status === 'done' && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-700">
                  <Check className="h-4 w-4" />
                </div>
              )}
              {f.status === 'error' && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-700">
                  <AlertCircle className="h-4 w-4" />
                </div>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(f.file);
                }}
                className="text-ink-400 hover:text-ink-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
