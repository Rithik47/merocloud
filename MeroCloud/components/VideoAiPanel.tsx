"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VideoAction = "transcribe" | "captions" | "summarize" | "key_points" | "translate" | "ask";

type ApiResponse = {
  error?: string;
  status?: string;
  result?: string;
  savedFile?: { $id?: string } | null;
};

type Props = {
  fileId: string;
  onClose: () => void;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANGUAGES = [
  "Arabic", "Bengali", "Chinese (Simplified)", "Chinese (Traditional)",
  "Dutch", "French", "German", "Greek", "Gujarati", "Hebrew",
  "Hindi", "Indonesian", "Italian", "Japanese", "Kannada", "Korean",
  "Malay", "Marathi", "Nepali", "Persian", "Polish", "Portuguese",
  "Punjabi", "Romanian", "Russian", "Spanish", "Swahili", "Swedish",
  "Tamil", "Telugu", "Thai", "Turkish", "Ukrainian", "Urdu", "Vietnamese",
];

const QUICK_ACTIONS: { key: VideoAction; label: string; description: string }[] = [
  { key: "transcribe",  label: "Transcribe",        description: "Convert speech to text"             },
  { key: "captions",    label: "Generate Captions",  description: "Create .srt subtitle file"         },
  { key: "summarize",   label: "Summarize",          description: "What the video is about"           },
  { key: "key_points",  label: "Extract Key Points", description: "Topics, names, facts & decisions"  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const VideoAiPanel = ({ fileId, onClose }: Props) => {
  const [selectedAction, setSelectedAction] = useState<VideoAction | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("French");
  const [question, setQuestion]             = useState("");
  const [isLoading, setIsLoading]           = useState(false);
  const [result, setResult]                 = useState<string | null>(null);
  const [resultOpen, setResultOpen]         = useState(false);
  const [savedFileId, setSavedFileId]       = useState<string | null>(null);
  const [isSaving, setIsSaving]             = useState(false);
  const [progress, setProgress]             = useState(0);

  const pathname  = usePathname();
  const router    = useRouter();
  const { toast } = useToast();

  const isBusy = isLoading || isSaving;

  const getResultTitle = () => {
    switch (selectedAction) {
      case "transcribe":  return "Video Transcript";
      case "captions":    return "Generated Captions (.srt)";
      case "summarize":   return "Video Summary";
      case "key_points":  return "Key Points";
      case "translate":   return `Translated Transcript → ${targetLanguage}`;
      case "ask":         return "Answer";
      default:            return "AI Result";
    }
  };

  // ── progress bar ─────────────────────────────────────────────────────────
  let progressTimer: ReturnType<typeof setInterval> | null = null;

  const beginProgress = () => {
    setProgress(5);
    progressTimer = setInterval(() => {
      setProgress((p) => (p >= 85 ? p : p + 3));
    }, 400);
  };

  const finishProgress = () => {
    if (progressTimer) clearInterval(progressTimer);
    setProgress(100);
    setTimeout(() => setProgress(0), 300);
  };

  // ── run action ───────────────────────────────────────────────────────────
  const handleRun = async () => {
    if (!selectedAction) {
      toast({ title: "Select an action", description: "Choose a video AI action first.", variant: "destructive" });
      return;
    }
    if (selectedAction === "ask" && !question.trim()) {
      toast({ title: "Enter a question", description: "Type your question before running.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setResult(null);
    setSavedFileId(null);
    beginProgress();

    const body: Record<string, unknown> = {
      action: selectedAction,
      fileId,
      path: pathname,
    };

    if (selectedAction === "translate") body.targetLanguage = targetLanguage;
    if (selectedAction === "ask")       body.question       = question.trim();

    try {
      const response = await fetch("/api/ai/video", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.result) {
        toast({
          title:       "AI action failed",
          description: data.error || "Unable to process the video.",
          variant:     "destructive",
        });
        return;
      }

      setResult(data.result);
      setResultOpen(true);
      toast({ title: "Done", description: "AI finished processing your video." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      finishProgress();
      setIsLoading(false);
    }
  };

  // ── save result as file ───────────────────────────────────────────────────
  const handleSaveAsFile = async () => {
    if (!result || !selectedAction) return;

    setIsSaving(true);
    beginProgress();

    const body: Record<string, unknown> = {
      action:     selectedAction,
      fileId,
      path:       pathname,
      saveAsFile: true,
    };

    if (selectedAction === "translate") body.targetLanguage = targetLanguage;
    if (selectedAction === "ask")       body.question       = question.trim();

    try {
      const response = await fetch("/api/ai/video", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok) {
        toast({ title: "Save failed", description: data.error || "Could not save file.", variant: "destructive" });
        return;
      }

      toast({ title: "Saved", description: "Result saved as a new document in your files." });

      if (data.savedFile?.$id) {
        setSavedFileId(data.savedFile.$id);
        router.refresh();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error.";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    } finally {
      finishProgress();
      setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    toast({ title: "Copied", description: "Result copied to clipboard." });
  };

  const handleClear = () => {
    setResult(null);
    setResultOpen(false);
    setSavedFileId(null);
  };

  const selectAction = (action: VideoAction) => {
    setSelectedAction(action);
    setResult(null);
    setSavedFileId(null);
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="absolute inset-2 z-20 flex w-auto flex-col rounded-2xl border border-rose-200/80 bg-gradient-to-b from-rose-50/95 via-pink-50/90 to-fuchsia-50/90 shadow-2xl backdrop-blur-xl dark:border-slate-700 dark:from-slate-900/95 dark:via-slate-900/90 dark:to-slate-800/90 sm:inset-x-auto sm:inset-y-4 sm:right-4 sm:w-[min(92vw,380px)]">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-rose-200/80 bg-white/55 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
        <div>
          <p className="subtitle-2 bg-gradient-to-r from-rose-600 via-pink-600 to-fuchsia-600 bg-clip-text text-transparent">
            AI Video Panel
          </p>
          <p className="caption leading-snug text-slate-600 dark:text-slate-300">
            Select an action and click Run
          </p>
        </div>
        <Button
          onClick={onClose}
          variant="outline"
          className="h-9 rounded-full border-rose-300 bg-white/80 px-3 text-xs text-rose-700 hover:bg-rose-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Close
        </Button>
      </div>

      {/* Status bar */}
      <div className="border-b border-rose-200/80 bg-white/60 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/55">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Status</p>
          <p className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-slate-700 dark:text-rose-300">
            {isLoading ? "Processing..." : isSaving ? "Saving..." : result ? "Result ready" : "Idle"}
          </p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-rose-100 dark:bg-slate-700">
          <div
            className="h-full bg-gradient-to-r from-rose-500 via-pink-500 to-fuchsia-500 transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          {isLoading
            ? "Extracting audio & transcribing with Whisper..."
            : isSaving
              ? "Saving result to your files..."
              : result
                ? "Review the result below. Copy or save it as a new file."
                : "No action run yet."}
        </p>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">

        {/* Quick Actions */}
        <section className="space-y-2 rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50 p-4 shadow-sm dark:border-rose-800/70 dark:from-rose-950/40 dark:to-pink-900/30">
          <div>
            <p className="subtitle-2 text-rose-700 dark:text-rose-300">Quick Actions</p>
            <p className="caption text-rose-600 dark:text-rose-200/80">Powered by Groq Whisper</p>
          </div>
          <div className="space-y-2">
            {QUICK_ACTIONS.map((a) => (
              <Button
                key={a.key}
                type="button"
                variant={selectedAction === a.key ? "default" : "outline"}
                disabled={isBusy}
                onClick={() => selectAction(a.key)}
                className={`h-auto min-h-16 w-full flex-col items-start gap-0.5 rounded-xl border bg-white/90 p-3 text-left shadow-sm dark:bg-slate-800/80 ${
                  selectedAction === a.key
                    ? "border-rose-500 bg-rose-600 text-white dark:border-rose-400 dark:bg-rose-500"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/80"
                }`}
              >
                <span className="block w-full text-sm font-semibold leading-tight">{a.label}</span>
                <span className="block w-full text-[11px] font-normal leading-snug opacity-80">{a.description}</span>
              </Button>
            ))}
          </div>
        </section>

        {/* Translate */}
        <section className="space-y-2 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 p-4 shadow-sm dark:border-amber-800/70 dark:from-amber-950/40 dark:to-yellow-900/30">
          <div>
            <p className="subtitle-2 text-amber-700 dark:text-amber-300">Translate Transcript</p>
            <p className="caption text-amber-600 dark:text-amber-200/80">Transcribe then translate</p>
          </div>
          <select
            value={targetLanguage}
            onChange={(e) => { setTargetLanguage(e.target.value); selectAction("translate"); }}
            disabled={isBusy}
            className="w-full rounded-xl border border-amber-200 bg-white/90 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
          <Button
            type="button"
            disabled={isBusy}
            onClick={() => selectAction("translate")}
            variant={selectedAction === "translate" ? "default" : "outline"}
            className={`w-full rounded-xl text-sm ${
              selectedAction === "translate"
                ? "border-amber-500 bg-amber-500 text-white hover:bg-amber-600"
                : "border-amber-200 text-amber-700 hover:bg-amber-100 dark:border-slate-600 dark:text-amber-300 dark:hover:bg-slate-700"
            }`}
          >
            {selectedAction === "translate" ? `Translate to ${targetLanguage} selected` : `Select: Translate to ${targetLanguage}`}
          </Button>
        </section>

        {/* Ask a Question */}
        <section className="space-y-2 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-4 shadow-sm dark:border-violet-800/70 dark:from-violet-950/40 dark:to-fuchsia-900/30">
          <div>
            <p className="subtitle-2 text-violet-700 dark:text-violet-300">Ask a Question</p>
            <p className="caption text-violet-600 dark:text-violet-200/80">Get answers from the video content</p>
          </div>
          <textarea
            value={question}
            onChange={(e) => { setQuestion(e.target.value); selectAction("ask"); }}
            onFocus={() => selectAction("ask")}
            placeholder="e.g. What were the main decisions made? Who was mentioned?"
            disabled={isBusy}
            rows={3}
            className="w-full resize-none rounded-xl border border-violet-200 bg-white/90 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
          />
        </section>

        {/* View result button */}
        {result && (
          <button
            type="button"
            onClick={() => setResultOpen(true)}
            className="flex w-full items-center justify-between rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50 to-pink-50 px-4 py-3 text-left shadow-sm transition-colors hover:from-rose-100 hover:to-pink-100 dark:border-rose-800/60 dark:from-rose-950/40 dark:to-pink-950/40 dark:hover:from-rose-900/50 dark:hover:to-pink-900/50"
          >
            <div>
              <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Result ready</p>
              <p className="text-[11px] text-rose-500 dark:text-rose-400">Click to open full preview</p>
            </div>
            <span className="text-lg text-rose-500">→</span>
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-rose-200/80 bg-white/65 p-4 dark:border-slate-700 dark:bg-slate-900/55">
        <Button
          type="button"
          onClick={handleRun}
          disabled={isBusy || !selectedAction}
          className="w-full bg-gradient-to-r from-rose-600 to-fuchsia-600 text-white hover:from-rose-500 hover:to-fuchsia-500 disabled:opacity-50"
        >
          {isLoading ? "Processing..." : "Run AI Action"}
        </Button>
      </div>

      {/* Result Dialog */}
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl border border-rose-200 bg-white p-0 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <DialogHeader className="border-b border-rose-100 bg-gradient-to-r from-rose-50 to-pink-50 px-6 py-4 dark:border-slate-700 dark:from-rose-950/50 dark:to-pink-950/50">
            <DialogTitle className="text-lg font-bold text-rose-800 dark:text-rose-200">
              {getResultTitle()}
            </DialogTitle>
            <DialogDescription className="text-xs text-rose-500 dark:text-rose-400">
              Powered by Groq · Whisper large-v3 + Llama 3.3 70B
              {savedFileId && (
                <span className="ml-2 font-medium text-emerald-600 dark:text-emerald-400">
                  · Saved to your files ✓
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {result}
            </pre>
          </div>

          <DialogFooter className="border-t border-slate-100 bg-slate-50 px-6 py-4 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex w-full flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCopy}
                disabled={isSaving}
                className="flex-1 border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Copy
              </Button>
              <Button
                type="button"
                onClick={handleSaveAsFile}
                disabled={isSaving || !!savedFileId}
                className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 disabled:opacity-60"
              >
                {isSaving ? "Saving..." : savedFileId ? "Saved ✓" : "Save as File"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleClear}
                className="border-red-200 text-red-500 hover:bg-red-50 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                Discard
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VideoAiPanel;
