"use client";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import Image from "next/image";
import { Models } from "node-appwrite";
import { actionsDropdownItems } from "@/constants";
import Link from "next/link";
import { constructDownloadUrl } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  deleteFile,
  renameFile,
  updateFileUsers,
} from "@/lib/actions/file.actions";
import { usePathname, useRouter } from "next/navigation";
import { FileDetails, ShareInput } from "@/components/ActionsModalContent";
import { useCurrentUserId } from "@/contexts/UserContext";
import { decryptFileFromStorage, downloadDecryptedFile } from "@/lib/crypto";
import { Loader2 } from "lucide-react";

const ActionDropdown = ({ file }: { file: Models.Document }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [action, setAction] = useState<ActionType | null>(null);
  const [name, setName] = useState(file.name);
  const [isLoading, setIsLoading] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);

  const path = usePathname();
  const router = useRouter();
  const currentUserId = useCurrentUserId();

  const closeAllModals = () => {
    setIsModalOpen(false);
    setIsDropdownOpen(false);
    setAction(null);
    setName(file.name);
  };

  const handleAction = async () => {
    if (!action) return;
    setIsLoading(true);
    let success = false;

    const actions = {
      rename: () =>
        renameFile({ fileId: file.$id, name, extension: file.extension, path }),
      share: () => updateFileUsers({ fileId: file.$id, emails, path }),
      delete: () =>
        deleteFile({ fileId: file.$id, bucketFileId: file.bucketFileId, path }),
    };

    success = await actions[action.value as keyof typeof actions]();

    if (success) {
      closeAllModals();

      if (action.value === "delete" && path.startsWith("/preview/")) {
        router.push("/");
      }

      router.refresh();
    }

    setIsLoading(false);
  };

  const handleRemoveUser = async (email: string) => {
    const updatedEmails = emails.filter((e) => e !== email);

    const success = await updateFileUsers({
      fileId: file.$id,
      emails: updatedEmails,
      path,
    });

    if (success) setEmails(updatedEmails);
    closeAllModals();
  };

  const handleEncryptedDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const ownerId = typeof file.owner === "object" ? file.owner?.$id : file.owner;
    if (ownerId !== currentUserId) {
      alert("This file is end-to-end encrypted and can only be downloaded by its owner.");
      return;
    }

    setIsDecrypting(true);
    try {
      const plaintext = await decryptFileFromStorage(
        file.url,
        file.encryptedFileKey,
        file.iv,
        currentUserId,
      );
      downloadDecryptedFile(plaintext, file.name);
    } catch {
      alert("Decryption failed. The file may be corrupted or belong to a different account.");
    } finally {
      setIsDecrypting(false);
    }
  };

  const renderDialogContent = () => {
    if (!action) return null;

    const { value, label } = action;

    return (
      <DialogContent className="shad-dialog button">
        <DialogHeader className="flex flex-col gap-3">
          <DialogTitle className="text-center text-light-100">
            {label}
          </DialogTitle>
          {value === "rename" && (
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          {value === "details" && <FileDetails file={file} />}
          {value === "share" && (
            <ShareInput
              file={file}
              onInputChange={setEmails}
              onRemove={handleRemoveUser}
            />
          )}
          {value === "delete" && (
            <p className="delete-confirmation">
              Move{` `}
              <span className="delete-file-name">{file.name}</span>
              {` `}to Trash?
            </p>
          )}
        </DialogHeader>
        {["rename", "delete", "share"].includes(value) && (
          <DialogFooter className="flex flex-col gap-3 md:flex-row">
            <Button onClick={closeAllModals} className="modal-cancel-button">
              Cancel
            </Button>
            <Button onClick={handleAction} className="modal-submit-button">
              <p className="capitalize">{label}</p>
              {isLoading && (
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
        )}
      </DialogContent>
    );
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenuTrigger className="shad-no-focus action-menu-trigger">
          <Image
            src="/assets/icons/dots.svg"
            alt="dots"
            width={34}
            height={34}
            className="action-menu-icon"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel className="max-w-[200px] truncate">
            {file.name}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {actionsDropdownItems.map((actionItem) => (
            <DropdownMenuItem
              key={actionItem.value}
              className="shad-dropdown-item"
              onClick={() => {
                setAction(actionItem);

                if (
                  ["rename", "share", "delete", "details"].includes(
                    actionItem.value,
                  )
                ) {
                  setIsModalOpen(true);
                }
              }}
            >
              {actionItem.value === "download" ? (
                file.isEncrypted ? (
                  <button
                    onClick={handleEncryptedDownload}
                    disabled={isDecrypting}
                    className="flex items-center gap-2 disabled:opacity-60"
                  >
                    {isDecrypting ? (
                      <Loader2 className="size-[30px] animate-spin text-green" />
                    ) : (
                      <Image
                        src={actionItem.icon}
                        alt={actionItem.label}
                        width={30}
                        height={30}
                        className="dropdown-action-icon"
                      />
                    )}
                    {isDecrypting ? "Decrypting..." : actionItem.label}
                  </button>
                ) : (
                  <Link
                    href={constructDownloadUrl(file.bucketFileId)}
                    download={file.name}
                    className="flex items-center gap-2"
                  >
                    <Image
                      src={actionItem.icon}
                      alt={actionItem.label}
                      width={30}
                      height={30}
                      className="dropdown-action-icon"
                    />
                    {actionItem.label}
                  </Link>
                )
              ) : (
                <div className="flex items-center gap-2">
                  <Image
                    src={actionItem.icon}
                    alt={actionItem.label}
                    width={30}
                    height={30}
                    className="dropdown-action-icon"
                  />
                  {actionItem.label}
                </div>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {renderDialogContent()}
    </Dialog>
  );
};
export default ActionDropdown;
