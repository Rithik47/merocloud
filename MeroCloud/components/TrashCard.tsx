"use client";

import { useState } from "react";
import Image from "next/image";
import { Models } from "node-appwrite";
import { Lock } from "lucide-react";
import { Thumbnail } from "@/components/Thumbnail";
import { FormattedDateTime } from "@/components/FormattedDateTime";
import { convertFileSize } from "@/lib/utils";
import { restoreFile, permanentlyDeleteFile } from "@/lib/actions/file.actions";
import { usePathname, useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const TrashCard = ({
  file,
  isSelected,
  onToggle,
}: {
  file: Models.Document;
  isSelected: boolean;
  onToggle: (id: string) => void;
}) => {
  const [isRestoring, setIsRestoring] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const path = usePathname();
  const router = useRouter();

  const handleRestore = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRestoring(true);
    await restoreFile({ fileId: file.$id, path });
    setIsRestoring(false);
    router.refresh();
  };

  const handleDeleteForever = async () => {
    setIsDeleting(true);
    await permanentlyDeleteFile({
      fileId: file.$id,
      bucketFileId: file.bucketFileId,
      path,
    });
    setIsDeleting(false);
    setShowConfirm(false);
    router.refresh();
  };

  return (
    <>
      <div
        className={`file-card file-card--other relative ${
          isSelected ? "ring-2 ring-brand" : ""
        }`}
      >
        {/* Checkbox */}
        <div
          className="absolute left-3 top-3 z-20"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggle(file.$id);
          }}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggle(file.$id)}
            className="size-4 cursor-pointer accent-brand"
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        <div className="flex justify-between">
          <Thumbnail
            type={file.type}
            extension={file.extension}
            url={file.url}
            className="!size-20"
            imageClassName="!size-11"
          />

          <div className="flex flex-col items-end justify-between gap-2">
            {/* Restore */}
            <button
              onClick={handleRestore}
              disabled={isRestoring}
              title="Restore file"
              className="flex size-8 items-center justify-center rounded-full bg-green/10 text-green transition-colors hover:bg-green/20 disabled:opacity-50"
            >
              {isRestoring ? (
                <Image
                  src="/assets/icons/loader.svg"
                  alt="restoring"
                  width={16}
                  height={16}
                  className="animate-spin"
                />
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              )}
            </button>

            {/* Delete forever */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowConfirm(true);
              }}
              title="Delete forever"
              className="flex size-8 items-center justify-center rounded-full bg-red/10 transition-colors hover:bg-red/20"
            >
              <Image
                src="/assets/icons/delete.svg"
                alt="delete forever"
                width={16}
                height={16}
                className="opacity-60"
              />
            </button>
          </div>
        </div>

        <div className="file-card-details">
          <div className="flex items-center gap-1.5">
            <p className="subtitle-2 line-clamp-1">{file.name}</p>
            {file.isEncrypted && (
              <span
                title="End-to-end encrypted"
                className="flex shrink-0 items-center gap-1 rounded-full bg-green/15 px-1.5 py-0.5 text-[10px] font-semibold text-green dark:bg-green/10"
              >
                <Lock className="size-2.5" />
                E2E
              </span>
            )}
          </div>
          <FormattedDateTime
            date={file.$updatedAt}
            className="body-2 text-light-100"
          />
          <p className="caption line-clamp-1 text-light-200">
            {convertFileSize(file.size)}
          </p>
        </div>
      </div>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="shad-dialog button">
          <DialogHeader className="flex flex-col gap-3">
            <DialogTitle className="text-center text-light-100">
              Delete Forever
            </DialogTitle>
            <p className="delete-confirmation">
              Permanently delete{" "}
              <span className="delete-file-name">{file.name}</span>? This cannot
              be undone.
            </p>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-3 md:flex-row">
            <Button
              onClick={() => setShowConfirm(false)}
              className="modal-cancel-button"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteForever}
              disabled={isDeleting}
              className="modal-submit-button"
            >
              <p>Delete Forever</p>
              {isDeleting && (
                <Image
                  src="/assets/icons/loader.svg"
                  alt="loader"
                  width={24}
                  height={24}
                  className="animate-spin"
                />
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TrashCard;
