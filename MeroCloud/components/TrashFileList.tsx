"use client";

import { useState } from "react";
import { Models } from "node-appwrite";
import TrashCard from "@/components/TrashCard";
import { restoreFile, permanentlyDeleteFile } from "@/lib/actions/file.actions";
import { usePathname, useRouter } from "next/navigation";

const TrashFileList = ({ files }: { files: Models.Document[] }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const path = usePathname();
  const router = useRouter();

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(
      selected.size === files.length
        ? new Set()
        : new Set(files.map((f) => f.$id)),
    );
  };

  const handleBulkRestore = async () => {
    setIsLoading(true);
    await Promise.all(
      Array.from(selected).map((id) => restoreFile({ fileId: id, path })),
    );
    setSelected(new Set());
    setIsLoading(false);
    router.refresh();
  };

  const handleBulkDeleteForever = async () => {
    if (
      !confirm(
        `Permanently delete ${selected.size} file(s)? This cannot be undone.`,
      )
    )
      return;
    setIsLoading(true);
    await Promise.all(
      Array.from(selected).map((id) => {
        const file = files.find((f) => f.$id === id);
        if (!file) return;
        return permanentlyDeleteFile({
          fileId: id,
          bucketFileId: file.bucketFileId,
          path,
        });
      }),
    );
    setSelected(new Set());
    setIsLoading(false);
    router.refresh();
  };

  return (
    <>
      <div className="flex w-full items-center gap-3 px-1">
        <input
          type="checkbox"
          checked={selected.size === files.length && files.length > 0}
          onChange={selectAll}
          className="size-4 cursor-pointer accent-brand"
        />
        <span className="body-2 text-light-200">
          {selected.size > 0
            ? `${selected.size} of ${files.length} selected`
            : "Select all"}
        </span>
      </div>

      <section className="file-list">
        {files.map((file) => (
          <TrashCard
            key={file.$id}
            file={file}
            isSelected={selected.has(file.$id)}
            onToggle={toggle}
          />
        ))}
      </section>

      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-white/50 bg-white/90 px-6 py-3 shadow-drop-3 backdrop-blur-xl dark:border-white/15 dark:bg-dark-200/90">
          <span className="body-2 font-semibold text-light-100">
            {selected.size} selected
          </span>
          <div className="h-4 w-px bg-light-300 dark:bg-white/20" />
          <button
            onClick={() => setSelected(new Set())}
            className="caption text-light-200 hover:text-light-100"
          >
            Clear
          </button>
          <button
            onClick={handleBulkRestore}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-full bg-green/10 px-4 py-2 text-sm font-semibold text-green hover:bg-green/20 disabled:opacity-50"
          >
            {isLoading ? "Restoring…" : "Restore All"}
          </button>
          <button
            onClick={handleBulkDeleteForever}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-full bg-red/10 px-4 py-2 text-sm font-semibold text-red hover:bg-red/20 disabled:opacity-50"
          >
            {isLoading ? "Deleting…" : "Delete Forever"}
          </button>
        </div>
      )}
    </>
  );
};

export default TrashFileList;
