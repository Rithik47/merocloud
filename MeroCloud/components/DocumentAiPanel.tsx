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

type Action =
  | "summarize"
  | "improve"
  | "key_points"
  | "translate"
  | "ask"
  | "rewrite_tone";

type ApiResponse = {
  error?: string;
  status?: string;
  result?: string;
  savedFile?: { $id?: string } | null;
};

type Props = {
  fileId: string;
  onClose: () => void;
  disabled?: boolean;
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

const TONE_OPTIONS: { key: DocumentTone; label: string; description: string }[] = [
  { key: "formal",      label: "Formal",      description: "Professional & business-ready" },
  { key: "casual",      label: "Casual",       description: "Friendly & conversational"    },
  { key: "technical",   label: "Technical",    description: "Precise domain terminology"   },
  { key: "simplified",  label: "Simplified",   description: "Plain language, no jargon"    },
];

const QUICK_ACTIONS: { key: Action; label: string; description: string }[] = [
  { key: "summarize",  label: "Summarize",        description: "Key points in bullet form"          },
  { key: "improve",    label: "Improve Writing",  description: "Fix grammar & clarity"              },
  { key: "key_points", label: "Extract Key Points", description: "Facts, dates, names & action items" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DocumentAiPanel = ({ fileId, onClose, disabled = false }: Props) => {
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [question, setQuestion]             = useState("");
  const [targetLanguage, setTargetLanguage] = useState("French");
  const [selectedTone, setSelectedTone]     = useState<DocumentTone>("formal");
  const [isLoading, setIsLoading]           = useState(false);
  const [result, setResult]                 = useState<string | null>(null);
  const [resultOpen, setResultOpen]         = useState(false);
  const [savedFileId, setSavedFileId]       = useState<string | null>(null);
  const [isSaving, setIsSaving]             = useState(false);
  const [progress, setProgress]             = useState(0);

  const getResultTitle = () => {
    switch (selectedAction) {
      case "summarize":    return "Document Summary";
      case "improve":      return "Improved Writing";
      case "key_points":   return "Key Points";
      case "translate":    return `Translation → ${targetLanguage}`;
      case "ask":          return "Answer";
      case "rewrite_tone": return `Rewritten: ${selectedTone.charAt(0).toUpperCase() + selectedTone.slice(1)} Tone`;
      default:             return "AI Result";
    }
  };

  const pathname = usePathname();
  const router   = useRouter();
  const { toast } = useToast();

  const isBusy = isLoading || isSaving || disabled;

  // ── progress bar helpers ────────────────────────────────────────────────
  let progressTimer: ReturnType<typeof setInterval> | null = null;

  const beginProgress = () => {
    setProgress(5);
    progressTimer = setInterval(() => {
      setProgress((p) => (p >= 90 ? p : p + 5));
    }, 300);
  };

  const finishProgress = () => {
    if (progressTimer) clearInterval(progressTimer);
    setProgress(100);
    setTimeout(() => setProgress(0), 300);
  };

  // ── run the selected action ─────────────────────────────────────────────
  const handleRun = async () => {
    if (!selectedAction) {
      toast({ title: "Select an action", description: "Choose an AI action from the panel.", variant: "destructive" });
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
      action:  selectedAction,
      fileId,
      path:    pathname,
    };

    if (selectedAction === "translate")    body.targetLanguage = targetLanguage;
    if (selectedAction === "ask")          body.question       = question.trim();
    if (selectedAction === "rewrite_tone") body.tone           = selectedTone;

    try {
      const response = await fetch("/api/ai/document", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.result) {
        toast({
          title:       "AI action failed",
          description: data.error || "Unable to process the document.",
          variant:     "destructive",
        });
        return;
      }

      setResult(data.result);
      setResultOpen(true);
      toast({ title: "Done", description: "AI finished processing your document." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      finishProgress();
      setIsLoading(false);
    }
  };

  // ── save result as a new file ───────────────────────────────────────────
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

    if (selectedAction === "translate")    body.targetLanguage = targetLanguage;
    if (selectedAction === "ask")          body.question       = question.trim();
    if (selectedAction === "rewrite_tone") body.tone           = selectedTone;

    try {
      const response = await fetch("/api/ai/document", {
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

  // ── copy result to clipboard ─────────────────────────────────────────────
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

  // ── action button helper ────────────────────────────────────────────────
  const ActionButton = ({
    action,
    label,
    description,
    activeClass,
  }: {
    action: Action;
    label: string;
    description: string;
    activeClass: string;
  }) => (
    <Button
      type="button"
      variant={selectedAction === action ? "default" : "outline"}
      disabled={isBusy}
      onClick={() => { setSelectedAction(action); setResult(null); setSavedFileId(null); }}
      className={`h-auto min-h-16 w-full flex-col items-start gap-0.5 rounded-xl border bg-white/90 p-3 text-left shadow-sm dark:bg-slate-800/80 ${
        selectedAction === action
          ? activeClass
          : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/80"
      }`}
    >
      <span className="block w-full text-sm font-semibold leading-tight">{label}</span>
      <span className="block w-full text-[11px] font-normal leading-snug opacity-80">{description}</span>
    </Button>
  );

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div className="absolute inset-2 z-20 flex w-auto flex-col rounded-2xl border border-indigo-200/80 bg-gradient-to-b from-indigo-50/95 via-purple-50/90 to-violet-50/90 shadow-2xl backdrop-blur-xl dark:border-slate-700 dark:from-slate-900/95 dark:via-slate-900/90 dark:to-slate-800/90 sm:inset-x-auto sm:inset-y-4 sm:right-4 sm:w-[min(92vw,380px)]">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-indigo-200/80 bg-white/55 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
        <div>
          <p className="subtitle-2 bg-gradient-to-r from-indigo-700 via-purple-600 to-violet-600 bg-clip-text text-transparent">
            AI Document Panel
          </p>
          <p className="caption leading-snug text-slate-600 dark:text-slate-300">
            Select an action and click Run
          </p>
        </div>
        <Button
          onClick={onClose}
          variant="outline"
          className="h-9 rounded-full border-indigo-300 bg-white/80 px-3 text-xs text-indigo-700 hover:bg-indigo-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Close
        </Button>
      </div>

      {/* Status bar */}
      <div className="border-b border-indigo-200/80 bg-white/60 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/55">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Status</p>
          <p className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-slate-700 dark:text-indigo-300">
            {isLoading ? "Running..." : isSaving ? "Saving..." : result ? "Result ready" : "Idle"}
          </p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-indigo-100 dark:bg-slate-700">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-500 transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          {isLoading
            ? "Gemini is processing your document..."
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
        <section className="space-y-2 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-sm dark:border-emerald-800/70 dark:from-emerald-950/40 dark:to-teal-900/30">
          <div>
            <p className="subtitle-2 text-emerald-700 dark:text-emerald-300">Quick Actions</p>
            <p className="caption text-emerald-600 dark:text-emerald-200/80">One-click document analysis</p>
          </div>
          <div className="space-y-2">
            {QUICK_ACTIONS.map((a) => (
              <ActionButton
                key={a.key}
                action={a.key}
                label={a.label}
                description={a.description}
                activeClass="border-emerald-500 bg-emerald-600 text-white dark:border-emerald-400 dark:bg-emerald-500"
              />
            ))}
          </div>
        </section>

        {/* Rewrite Tone */}
        <section className="space-y-2 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-cyan-50 p-4 shadow-sm dark:border-sky-800/70 dark:from-sky-950/40 dark:to-cyan-900/30">
          <div>
            <p className="subtitle-2 text-sky-700 dark:text-sky-300">Rewrite Tone</p>
            <p className="caption text-sky-600 dark:text-sky-200/80">Rewrite in a different style</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {TONE_OPTIONS.map((t) => (
              <Button
                key={t.key}
                type="button"
                variant={selectedAction === "rewrite_tone" && selectedTone === t.key ? "default" : "outline"}
                disabled={isBusy}
                onClick={() => { setSelectedAction("rewrite_tone"); setSelectedTone(t.key); setResult(null); setSavedFileId(null); }}
                className={`h-auto min-h-16 flex-col items-start gap-0.5 rounded-xl border bg-white/90 p-3 text-left shadow-sm dark:bg-slate-800/80 ${
                  selectedAction === "rewrite_tone" && selectedTone === t.key
                    ? "border-sky-500 bg-sky-600 text-white dark:border-sky-400 dark:bg-sky-500"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/80"
                }`}
              >
                <span className="block w-full text-sm font-semibold leading-tight">{t.label}</span>
                <span className="block w-full text-[11px] font-normal leading-snug opacity-80">{t.description}</span>
              </Button>
            ))}
          </div>
        </section>

        {/* Translate */}
        <section className="space-y-2 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 p-4 shadow-sm dark:border-amber-800/70 dark:from-amber-950/40 dark:to-yellow-900/30">
          <div>
            <p className="subtitle-2 text-amber-700 dark:text-amber-300">Translate</p>
            <p className="caption text-amber-600 dark:text-amber-200/80">Convert to another language</p>
          </div>
          <select
            value={targetLanguage}
            onChange={(e) => { setTargetLanguage(e.target.value); setSelectedAction("translate"); setResult(null); setSavedFileId(null); }}
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
            onClick={() => { setSelectedAction("translate"); setResult(null); setSavedFileId(null); }}
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
            <p className="caption text-violet-600 dark:text-violet-200/80">Get answers from your document</p>
          </div>
          <textarea
            value={question}
            onChange={(e) => { setQuestion(e.target.value); setSelectedAction("ask"); setResult(null); setSavedFileId(null); }}
            onFocus={() => setSelectedAction("ask")}
            placeholder="e.g. What are the key deadlines? Who are the main parties involved?"
            disabled={isBusy}
            rows={3}
            className="w-full resize-none rounded-xl border border-violet-200 bg-white/90 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
          />
        </section>

        {/* View result button — shown after AI completes */}
        {result && (
          <button
            type="button"
            onClick={() => setResultOpen(true)}
            className="flex w-full items-center justify-between rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 px-4 py-3 text-left shadow-sm transition-colors hover:from-indigo-100 hover:to-purple-100 dark:border-indigo-800/60 dark:from-indigo-950/40 dark:to-purple-950/40 dark:hover:from-indigo-900/50 dark:hover:to-purple-900/50"
          >
            <div>
              <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                Result ready
              </p>
              <p className="text-[11px] text-indigo-500 dark:text-indigo-400">
                Click to open full preview
              </p>
            </div>
            <span className="text-lg text-indigo-500">→</span>
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="space-y-2 border-t border-indigo-200/80 bg-white/65 p-4 dark:border-slate-700 dark:bg-slate-900/55">
        <Button
          type="button"
          onClick={handleRun}
          disabled={isBusy || !selectedAction}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50"
        >
          {isLoading ? "Running..." : "Run AI Action"}
        </Button>
      </div>

      {/* Result Dialog */}
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl border border-indigo-200 bg-white p-0 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          {/* Header */}
          <DialogHeader className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 dark:border-slate-700 dark:from-indigo-950/50 dark:to-purple-950/50">
            <DialogTitle className="text-lg font-bold text-indigo-800 dark:text-indigo-200">
              {getResultTitle()}
            </DialogTitle>
            <DialogDescription className="text-xs text-indigo-500 dark:text-indigo-400">
              Powered by Groq · Llama 3.3 70B
              {savedFileId && (
                <span className="ml-2 font-medium text-emerald-600 dark:text-emerald-400">
                  · Saved to your files ✓
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Result body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {result}
            </pre>
          </div>

          {/* Footer actions */}
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

export default DocumentAiPanel;
