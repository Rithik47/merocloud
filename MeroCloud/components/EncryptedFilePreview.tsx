"use client";

import { useEffect, useState } from "react";
import { Lock, ShieldCheck, ShieldOff, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUserId } from "@/contexts/UserContext";
import {
  decryptFileFromStorage,
  downloadDecryptedFile,
} from "@/lib/crypto";

interface Props {
  fileUrl: string;
  encryptedFileKey: string;
  iv: string;
  fileName: string;
  fileType: string;
  fileExtension: string;
  fileOwnerId: string | { $id: string };
}

type DecryptState = "idle" | "decrypting" | "decrypted" | "error";

const EncryptedFilePreview = ({
  fileUrl,
  encryptedFileKey,
  iv,
  fileName,
  fileType,
  fileOwnerId,
}: Props) => {
  const currentUserId = useCurrentUserId();
  // fileOwnerId may be the raw $id string or an expanded Appwrite document
  const resolvedOwnerId =
    typeof fileOwnerId === "object" && fileOwnerId !== null
      ? (fileOwnerId as { $id: string }).$id
      : fileOwnerId;
  const isOwner = currentUserId === resolvedOwnerId;

  const [state, setState] = useState<DecryptState>("idle");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const handleDecrypt = async () => {
    setState("decrypting");
    try {
      const plaintext = await decryptFileFromStorage(
        fileUrl,
        encryptedFileKey,
        iv,
        currentUserId,
      );
      const blob = new Blob([plaintext]);
      setBlobUrl(URL.createObjectURL(blob));
      setState("decrypted");
    } catch {
      setErrorMsg(
        "Decryption failed. The file may have been encrypted by a different account.",
      );
      setState("error");
    }
  };

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    a.click();
  };

  const handleDecryptAndDownload = async () => {
    setState("decrypting");
    try {
      const plaintext = await decryptFileFromStorage(
        fileUrl,
        encryptedFileKey,
        iv,
        currentUserId,
      );
      downloadDecryptedFile(plaintext, fileName);
      setState("idle");
    } catch {
      setErrorMsg("Decryption failed.");
      setState("error");
    }
  };

  // Non-owner view
  if (!isOwner) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-6 text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-light-400/60 dark:bg-dark-100">
          <ShieldOff className="size-9 text-light-200" />
        </div>
        <div className="space-y-2">
          <p className="h4 text-white">End-to-end encrypted</p>
          <p className="body-2 max-w-sm text-light-200">
            This file is encrypted and can only be viewed by its owner. You can
            still download the encrypted file from the menu.
          </p>
        </div>
      </div>
    );
  }

  // Idle: show unlock prompt
  if (state === "idle") {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-6 text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-green/15 dark:bg-green/10">
          <Lock className="size-9 text-green" />
        </div>
        <div className="space-y-2">
          <p className="h4 text-white">End-to-end encrypted</p>
          <p className="body-2 max-w-sm text-light-200">
            This file is encrypted. Decryption happens entirely in your browser
            — nothing is sent to the server.
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={handleDecrypt} className="modal-submit-button gap-2">
            <Lock className="size-4" />
            Decrypt & Preview
          </Button>
          <Button
            onClick={handleDecryptAndDownload}
            variant="outline"
            className="modal-cancel-button gap-2"
          >
            <Download className="size-4" />
            Decrypt & Download
          </Button>
        </div>
      </div>
    );
  }

  // Decrypting spinner
  if (state === "decrypting") {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-4 text-center">
        <Loader2 className="size-12 animate-spin text-green" />
        <p className="body-1 text-white">Decrypting in browser...</p>
        <p className="caption text-light-200">
          AES-GCM 256-bit — no data leaves your device
        </p>
      </div>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-red/15">
          <ShieldOff className="size-8 text-red" />
        </div>
        <p className="h4 text-white">Decryption failed</p>
        <p className="body-2 max-w-sm text-light-200">{errorMsg}</p>
        <Button onClick={() => setState("idle")} className="modal-cancel-button">
          Try again
        </Button>
      </div>
    );
  }

  // Decrypted: show preview
  if (state === "decrypted" && blobUrl) {
    return (
      <div className="flex flex-col gap-4">
        {/* Success bar */}
        <div className="flex items-center justify-between rounded-xl border border-green/30 bg-green/10 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-green" />
            <p className="caption text-green">
              Decrypted in browser — AES-GCM 256-bit
            </p>
          </div>
          <Button
            onClick={handleDownload}
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 border-green/40 px-3 text-green hover:bg-green/10"
          >
            <Download className="size-3.5" />
            Save
          </Button>
        </div>

        {/* Preview content */}
        <div className="overflow-hidden rounded-xl bg-dark-100">
          {fileType === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={blobUrl}
              alt={fileName}
              className="mx-auto max-h-[70vh] object-contain"
            />
          ) : fileType === "video" ? (
            <video
              src={blobUrl}
              controls
              className="mx-auto max-h-[70vh] w-full"
            />
          ) : fileType === "audio" ? (
            <div className="flex items-center justify-center p-12">
              <audio src={blobUrl} controls className="w-full max-w-md" />
            </div>
          ) : (
            <iframe
              src={blobUrl}
              title={fileName}
              className="h-[70vh] w-full border-0"
            />
          )}
        </div>
      </div>
    );
  }

  return null;
};

export default EncryptedFilePreview;
