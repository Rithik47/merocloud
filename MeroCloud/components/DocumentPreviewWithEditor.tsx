"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import DocumentAiPanel from "@/components/DocumentAiPanel";
import { getFileIcon } from "@/lib/utils";

type Props = {
  fileId: string;
  fileName: string;
  fileUrl: string;
  fileExtension: string;
  fileType: string;
};

const PREVIEWABLE_EXTENSIONS = ["pdf", "txt", "md", "html", "htm", "csv"];

const DocumentPreviewWithEditor = ({
  fileId,
  fileName,
  fileUrl,
  fileExtension,
  fileType,
}: Props) => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const ext = fileExtension.toLowerCase();
  const isPdf = ext === "pdf";
  const isText = ["txt", "md", "html", "htm", "csv"].includes(ext);
  const canPreview = PREVIEWABLE_EXTENSIONS.includes(ext);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-light-400 bg-dark-100 p-4 dark:border-slate-700 dark:bg-slate-950/40">

      {/* Document viewer */}
      <div className="relative">
        {isPdf ? (
          <iframe
            src={fileUrl}
            className="h-[75vh] w-full rounded-xl bg-white"
            title={fileName}
          />
        ) : isText ? (
          <iframe
            src={fileUrl}
            className="h-[75vh] w-full rounded-xl bg-white font-mono text-sm"
            title={fileName}
            sandbox="allow-same-origin"
          />
        ) : (
          <div className="flex min-h-[50vh] items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getFileIcon(ext, fileType)}
                alt={ext}
                className="size-16 opacity-60"
              />
              <div>
                <p className="h4 text-white">Preview not available</p>
                <p className="body-2 mt-1 text-light-200">
                  Use the Download button to open this file locally.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* AI panel toggle button */}
        <div className="absolute right-3 top-3">
          <Button
            onClick={() => setIsEditorOpen((prev) => !prev)}
            className="modal-submit-button"
          >
            {isEditorOpen ? "Close AI Panel" : "AI Edit"}
          </Button>
        </div>
      </div>

      {/* AI Panel — slide in from bottom on mobile, right on desktop */}
      <div
        className={`absolute inset-2 z-20 transition-all duration-300 sm:inset-x-auto sm:inset-y-4 sm:right-4 sm:w-[min(92vw,380px)] ${
          isEditorOpen
            ? "pointer-events-auto translate-x-0 translate-y-0 opacity-100"
            : "pointer-events-none translate-y-[108%] opacity-0 sm:translate-x-[108%] sm:translate-y-0"
        }`}
      >
        {/* Only mount the panel when open to avoid unnecessary API hooks */}
        {isEditorOpen && (
          <DocumentAiPanel
            fileId={fileId}
            onClose={() => setIsEditorOpen(false)}
          />
        )}
      </div>
    </div>
  );
};

export default DocumentPreviewWithEditor;
