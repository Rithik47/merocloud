"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import PreviewImagePresetTools from "@/components/PreviewImagePresetTools";
import PreviewImageEffectTools from "@/components/PreviewImageEffectTools";
import { useToast } from "@/hooks/use-toast";

type Props = {
  fileId: string;
  fileName: string;
  fileUrl: string;
};

const ImagePreviewWithEditor = ({ fileId, fileName, fileUrl }: Props) => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedActionKey, setSelectedActionKey] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>(fileUrl);
  const [previewedActionKey, setPreviewedActionKey] = useState<string | null>(null);
  const [activeActionLabel, setActiveActionLabel] = useState<string>("Original");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const isBusy = isPreviewing || isSaving;
  const hasPreview = previewedActionKey !== null && previewUrl !== fileUrl;
  const isSelectionStale =
    selectedActionKey !== null &&
    previewedActionKey !== null &&
    selectedActionKey !== previewedActionKey;

  const clearProgressTimer = () => {
    if (!progressTimer.current) return;

    clearInterval(progressTimer.current);
    progressTimer.current = null;
  };

  const beginProgress = () => {
    clearProgressTimer();
    setProgress(5);

    progressTimer.current = setInterval(() => {
      setProgress((current) => {
        if (current >= 92) return current;

        return current + 6;
      });
    }, 180);
  };

  const finishProgress = () => {
    clearProgressTimer();
    setProgress(100);

    setTimeout(() => {
      setProgress(0);
    }, 250);
  };

  useEffect(() => {
    return () => {
      clearProgressTimer();
    };
  }, []);

  const handleSelectAction = (actionKey: string) => {
    setSelectedActionKey(actionKey);
  };

  const handlePreview = async () => {
    if (!selectedActionKey) {
      toast({
        title: "Select an edit",
        description: "Choose an editing option before generating preview.",
        variant: "destructive",
      });

      return;
    }

    setIsPreviewing(true);
    beginProgress();

    try {
      const response = await fetch("/api/ai/image/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileId,
          actionKey: selectedActionKey,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        previewUrl?: string;
        actionKey?: string;
        actionLabel?: string;
      };

      if (!response.ok || !data.previewUrl || !data.actionKey) {
        toast({
          title: "Preview failed",
          description: data.error || "Unable to generate preview for selected edit.",
          variant: "destructive",
        });

        return;
      }

      setPreviewUrl(data.previewUrl);
      setPreviewedActionKey(data.actionKey);
      setActiveActionLabel(data.actionLabel || "Edited Preview");

      toast({
        title: "Preview ready",
        description: "Review the image and click Save when you're satisfied.",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unexpected error while generating image preview.";

      toast({
        title: "Preview failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      finishProgress();
      setIsPreviewing(false);
    }
  };

  const handleResetPreview = () => {
    setPreviewUrl(fileUrl);
    setPreviewedActionKey(null);
    setActiveActionLabel("Original");
  };

  const handleSave = async () => {
    if (!previewedActionKey) {
      toast({
        title: "No preview to save",
        description: "Generate a preview first, then save your edited version.",
        variant: "destructive",
      });

      return;
    }

    setIsSaving(true);
    beginProgress();

    try {
      const response = await fetch("/api/ai/image/transform", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileId,
          actionKey: previewedActionKey,
          path: pathname,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        file?: {
          $id?: string;
        };
      };

      if (!response.ok) {
        toast({
          title: "Save failed",
          description: data.error || "Unable to save the edited image.",
          variant: "destructive",
        });

        return;
      }

      toast({
        title: "Saved",
        description: "Edited image saved as a new file version.",
      });

      if (data.file?.$id) {
        router.push(`/preview/${data.file.$id}`);
      } else {
        router.refresh();
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected error while saving edited image.";

      toast({
        title: "Save failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      finishProgress();
      setIsSaving(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-light-400 bg-dark-100 p-4 dark:border-slate-700 dark:bg-slate-950/40">
      <div className="relative flex justify-center">
        <Image
          src={previewUrl}
          alt={fileName}
          width={1600}
          height={1200}
          className="size-auto max-h-[75vh] rounded-xl object-contain shadow-lg"
        />

        <div className="absolute right-3 top-3">
          <Button
            onClick={() => setIsEditorOpen((previous) => !previous)}
            className="modal-submit-button"
          >
            {isEditorOpen ? "Close Editor" : "Edit Image"}
          </Button>
        </div>
      </div>

      <div
        className={`absolute inset-2 z-20 flex w-auto flex-col rounded-2xl border border-sky-200/80 bg-gradient-to-b from-sky-50/95 via-cyan-50/90 to-emerald-50/90 shadow-2xl backdrop-blur-xl transition-all duration-300 dark:border-slate-700 dark:from-slate-900/95 dark:via-slate-900/90 dark:to-slate-800/90 sm:inset-x-auto sm:inset-y-4 sm:right-4 sm:w-[min(92vw,380px)] ${
          isEditorOpen
            ? "translate-x-0 translate-y-0 opacity-100"
            : "pointer-events-none translate-y-[108%] opacity-0 sm:translate-x-[108%] sm:translate-y-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-sky-200/80 bg-white/55 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
          <div>
            <p className="subtitle-2 bg-gradient-to-r from-sky-700 via-cyan-600 to-emerald-600 bg-clip-text text-transparent">
              Editor Panel
            </p>
            <p className="caption leading-snug text-slate-600 dark:text-slate-300">
              Select an edit, preview it, then save when ready
            </p>
          </div>
          <Button
            onClick={() => setIsEditorOpen(false)}
            variant="outline"
            className="h-9 rounded-full border-sky-300 bg-white/80 px-3 text-xs text-sky-700 hover:bg-sky-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Close
          </Button>
        </div>

        <div className="border-b border-sky-200/80 bg-white/60 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/55">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Current View</p>
            <p className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-slate-700 dark:text-sky-200">
              {activeActionLabel}
            </p>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-sky-100 dark:bg-slate-700">
            <div
              className="h-full bg-gradient-to-r from-sky-500 via-cyan-500 to-emerald-500 transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
            {isPreviewing
              ? "Generating preview..."
              : isSaving
                ? "Saving edited file..."
                : hasPreview
                  ? "Preview ready. Save to create a new version."
                  : "No preview generated yet."}
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <section className="space-y-3 rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-amber-50 p-4 shadow-sm dark:border-rose-800/70 dark:from-rose-950/40 dark:to-amber-900/30">
            <div>
              <p className="subtitle-2 text-rose-700 dark:text-rose-300">Background</p>
              <p className="caption leading-snug text-rose-600 dark:text-rose-200/80">Cut out subject from image</p>
            </div>
            <Button
              type="button"
              variant={selectedActionKey === "remove_background" ? "default" : "outline"}
              className="h-auto min-h-20 w-full flex-col items-start gap-1 rounded-xl border-rose-200 bg-white/90 p-3 text-left text-rose-700 hover:bg-rose-100 dark:border-rose-700 dark:bg-slate-800/70 dark:text-rose-200 dark:hover:bg-rose-900/30"
              onClick={() => handleSelectAction("remove_background")}
              disabled={isBusy}
            >
              <span className="block w-full text-sm font-semibold leading-tight">
                Remove Background
              </span>
              <span className="block w-full text-[11px] font-normal leading-snug opacity-85">
                AI subject extraction with transparent PNG output
              </span>
            </Button>
          </section>

          <section className="space-y-3">
            <div>
              <p className="subtitle-2 text-sky-700 dark:text-sky-300">Crop & Resize</p>
              <p className="caption text-sky-600 dark:text-sky-200/80">Choose a target layout before exporting</p>
            </div>
            <PreviewImagePresetTools
              selectedActionKey={selectedActionKey}
              onSelectAction={handleSelectAction}
              disabled={isBusy}
              fileUrl={fileUrl}
            />
          </section>

          <PreviewImageEffectTools
            selectedActionKey={selectedActionKey}
            onSelectAction={handleSelectAction}
            disabled={isBusy}
          />
        </div>

        <div className="space-y-2 border-t border-sky-200/80 bg-white/65 p-4 dark:border-slate-700 dark:bg-slate-900/55">
          <Button
            type="button"
            onClick={handlePreview}
            disabled={isBusy || !selectedActionKey}
            className="w-full bg-gradient-to-r from-sky-600 to-cyan-600 text-white hover:from-sky-500 hover:to-cyan-500"
          >
            {isPreviewing ? "Generating Preview..." : "Preview Edit"}
          </Button>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleResetPreview}
              disabled={isBusy || !hasPreview}
              className="border-slate-300 bg-white/80 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Reset Preview
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isBusy || !hasPreview || isSelectionStale}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500"
            >
              {isSaving ? "Saving..." : "Save as New Version"}
            </Button>
          </div>

          {isSelectionStale ? (
            <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-300">
              Selection changed after preview. Generate a fresh preview before saving.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ImagePreviewWithEditor;
