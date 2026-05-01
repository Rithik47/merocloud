import Link from "next/link";
import { notFound } from "next/navigation";

import DocumentPreviewWithEditor from "@/components/DocumentPreviewWithEditor";
import ImagePreviewWithEditor from "@/components/ImagePreviewWithEditor";
import VideoPreviewWithAi from "@/components/VideoPreviewWithAi";
import EncryptedFilePreview from "@/components/EncryptedFilePreview";
import Thumbnail from "@/components/Thumbnail";
import { Button } from "@/components/ui/button";
import { getFileById } from "@/lib/actions/file.actions";
import { constructDownloadUrl, convertFileSize, formatDateTime } from "@/lib/utils";
import { Lock } from "lucide-react";

const PreviewPage = async ({ params }: SearchParamProps) => {
  const fileId = ((await params)?.fileId as string) || "";
  const file = await getFileById(fileId);

  if (!file) notFound();

  const isVideo    = file.type === "video";
  const isImage    = file.type === "image";
  const isDocument = file.type === "document";
  const isEncrypted = !!file.isEncrypted;

  return (
    <div className="page-container">
      <section className="w-full space-y-6">
        {/* File header */}
        <div className="flex flex-col gap-4 rounded-2xl border border-light-400 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-dark-200 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <Thumbnail
              type={file.type}
              extension={file.extension}
              url={file.url}
              className="!size-16"
              imageClassName="!size-10"
              isEncrypted={isEncrypted}
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="h3 text-light-100">{file.name}</h1>
                {isEncrypted && (
                  <span className="flex items-center gap-1 rounded-full bg-green/15 px-2 py-0.5 text-[11px] font-semibold text-green dark:bg-green/10">
                    <Lock className="size-3" />
                    E2E Encrypted
                  </span>
                )}
              </div>
              <p className="body-2 text-light-200">
                {convertFileSize(file.size)} • {formatDateTime(file.$createdAt)}
              </p>
            </div>
          </div>

          {/* Download button — only for non-encrypted files (encrypted handled inside EncryptedFilePreview) */}
          {!isEncrypted && (
            <div className="flex gap-3">
              <Button asChild className="modal-submit-button">
                <Link
                  href={constructDownloadUrl(file.bucketFileId)}
                  download={file.name}
                >
                  Download
                </Link>
              </Button>
            </div>
          )}
        </div>

        {/* Preview area */}
        <div className="rounded-2xl border border-light-400 bg-dark-100 p-4 dark:border-white/10">
          {isEncrypted ? (
            <EncryptedFilePreview
              fileUrl={file.url}
              encryptedFileKey={file.encryptedFileKey}
              iv={file.iv}
              fileName={file.name}
              fileType={file.type}
              fileExtension={file.extension}
              fileOwnerId={file.owner}
            />
          ) : isVideo ? (
            <VideoPreviewWithAi
              fileId={file.$id}
              fileName={file.name}
              fileUrl={file.url}
              fileExtension={file.extension}
            />
          ) : isImage ? (
            <ImagePreviewWithEditor
              fileId={file.$id}
              fileName={file.name}
              fileUrl={file.url}
            />
          ) : isDocument ? (
            <DocumentPreviewWithEditor
              fileId={file.$id}
              fileName={file.name}
              fileUrl={file.url}
              fileExtension={file.extension}
              fileType={file.type}
            />
          ) : (
            <div className="flex min-h-[50vh] items-center justify-center text-center">
              <div className="space-y-4">
                <p className="h4 text-white">Preview not available</p>
                <p className="body-2 text-light-200">
                  Use the download button to open this file.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default PreviewPage;
