"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { cn, convertFileToUrl, getFileType } from "@/lib/utils";
import Image from "next/image";
import Thumbnail from "@/components/Thumbnail";
import { MAX_FILE_SIZE } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { uploadFile } from "@/lib/actions/file.actions";
import { usePathname } from "next/navigation";

interface Props {
  ownerId: string;
  accountId: string;
  className?: string;
}

const FileUploader = ({ ownerId, accountId, className }: Props) => {
  const path = usePathname();
  const { toast } = useToast();
  const [files, setFiles] = useState<
    Array<{
      id: string;
      file: File;
      progress: number;
      status: "uploading" | "success" | "failed";
      error?: string;
    }>
  >([]);
  const progressTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const maxFileSizeInMB = Math.floor(MAX_FILE_SIZE / (1024 * 1024));

  const updateFileState = useCallback(
    (
      fileId: string,
      updater: (file: {
        id: string;
        file: File;
        progress: number;
        status: "uploading" | "success" | "failed";
        error?: string;
      }) => {
        id: string;
        file: File;
        progress: number;
        status: "uploading" | "success" | "failed";
        error?: string;
      },
    ) => {
      setFiles((prevFiles) =>
        prevFiles.map((currentFile) =>
          currentFile.id === fileId ? updater(currentFile) : currentFile,
        ),
      );
    },
    [],
  );

  const clearProgressTimer = useCallback((fileId: string) => {
    const timer = progressTimers.current[fileId];

    if (!timer) return;

    clearInterval(timer);
    delete progressTimers.current[fileId];
  }, []);

  const startProgressTimer = useCallback(
    (fileId: string) => {
      clearProgressTimer(fileId);

      progressTimers.current[fileId] = setInterval(() => {
        updateFileState(fileId, (fileState) => {
          if (fileState.status !== "uploading") {
            return fileState;
          }

          const nextProgress = Math.min(
            92,
            fileState.progress + Math.max(1, Math.ceil((95 - fileState.progress) / 8)),
          );

          return {
            ...fileState,
            progress: nextProgress,
          };
        });
      }, 220);
    },
    [clearProgressTimer, updateFileState],
  );

  const removeFileEntry = useCallback(
    (fileId: string) => {
      clearProgressTimer(fileId);
      setFiles((prevFiles) => prevFiles.filter((fileState) => fileState.id !== fileId));
    },
    [clearProgressTimer],
  );

  useEffect(() => {
    return () => {
      Object.values(progressTimers.current).forEach((timer) => {
        clearInterval(timer);
      });
      progressTimers.current = {};
    };
  }, []);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const queueItems = acceptedFiles.map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        progress: 0,
        status: "uploading" as const,
      }));

      setFiles((prevFiles) => [...queueItems, ...prevFiles]);

      const uploadPromises = queueItems.map(async (queueItem) => {
        const { file, id } = queueItem;

        if (file.size > MAX_FILE_SIZE) {
          updateFileState(id, (fileState) => ({
            ...fileState,
            status: "failed",
            progress: 100,
            error: `Max file size is ${maxFileSizeInMB}MB.`,
          }));

          toast({
            description: (
              <p className="body-2 text-white">
                <span className="font-semibold">{file.name}</span> is too large.
                {` Max file size is ${maxFileSizeInMB}MB.`}
              </p>
            ),
            className: "error-toast",
          });

          return;
        }

        startProgressTimer(id);

        try {
          const uploadedFile = await uploadFile({ file, ownerId, accountId, path });

          clearProgressTimer(id);

          if (uploadedFile?.file) {
            updateFileState(id, (fileState) => ({
              ...fileState,
              progress: 100,
              status: "success",
            }));

            if (uploadedFile?.meta?.usedOriginalAfterVideoFallback) {
              toast({
                description: (
                  <p className="body-2 text-white">
                    <span className="font-semibold">{file.name}</span> was uploaded using the original video because compression failed.
                  </p>
                ),
              });
            }

            setTimeout(() => removeFileEntry(id), 1300);
            return;
          }

          throw new Error("Upload failed. Please try again.");
        } catch (error) {
          clearProgressTimer(id);

          const message =
            error instanceof Error && error.message
              ? error.message
              : "Upload failed. Please try again.";

          updateFileState(id, (fileState) => ({
            ...fileState,
            status: "failed",
            progress: 100,
            error: message,
          }));

          toast({
            description: (
              <p className="body-2 text-white">
                <span className="font-semibold">{file.name}</span>: {message}
              </p>
            ),
            className: "error-toast",
          });
        }
      });

      await Promise.all(uploadPromises);
    },
    [
      ownerId,
      accountId,
      path,
      maxFileSizeInMB,
      startProgressTimer,
      clearProgressTimer,
      removeFileEntry,
      updateFileState,
      toast,
    ],
  );

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  const handleRemoveFile = (
    e: React.MouseEvent<HTMLImageElement, MouseEvent>,
    fileId: string,
  ) => {
    e.stopPropagation();
    removeFileEntry(fileId);
  };

  return (
    <div {...getRootProps()} className="cursor-pointer">
      <input {...getInputProps()} />
      <Button type="button" className={cn("uploader-button", className)}>
        <Image
          src="/assets/icons/upload.svg"
          alt="upload"
          width={24}
          height={24}
        />{" "}
        <p>Upload</p>
      </Button>
      {files.length > 0 && (
        <ul className="uploader-preview-list">
          <h4 className="h4 text-light-100">Uploading</h4>

          {files.map((uploadItem) => {
            const { type, extension } = getFileType(uploadItem.file.name);
            const statusColorClass =
              uploadItem.status === "failed"
                ? "bg-red"
                : uploadItem.status === "success"
                  ? "bg-green"
                  : "bg-brand";

            return (
              <li key={uploadItem.id} className="uploader-preview-item">
                <div className="flex items-center gap-3">
                  <Thumbnail
                    type={type}
                    extension={extension}
                    url={convertFileToUrl(uploadItem.file)}
                  />

                  <div className="w-full">
                    <p className="preview-item-name mb-1">{uploadItem.file.name}</p>
                    <div className="h-2 w-full rounded-full bg-light-400">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${statusColorClass}`}
                        style={{ width: `${uploadItem.progress}%` }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <p className="caption text-light-200">
                        {uploadItem.status === "uploading"
                          ? "Uploading..."
                          : uploadItem.status === "success"
                            ? "Uploaded"
                            : "Failed"}
                      </p>
                      <p className="caption text-light-200">{uploadItem.progress}%</p>
                    </div>
                    {uploadItem.error && (
                      <p className="caption mt-1 text-red">{uploadItem.error}</p>
                    )}
                  </div>
                </div>

                <Image
                  src="/assets/icons/remove.svg"
                  width={24}
                  height={24}
                  alt="Remove"
                  onClick={(e) => handleRemoveFile(e, uploadItem.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default FileUploader;
