"use client";

import { Button } from "@/components/ui/button";

type Props = {
  selectedActionKey: string | null;
  onSelectAction: (actionKey: string) => void;
  disabled?: boolean;
};

type EffectOption = {
  key: string;
  label: string;
  description: string;
};

const filterOptions: EffectOption[] = [
  { key: "filter_grayscale", label: "Grayscale", description: "Clean monochrome" },
  { key: "filter_contrast", label: "Contrast", description: "Punchier tones" },
  { key: "filter_sharpen", label: "Sharpen", description: "Crisper details" },
  { key: "filter_blur", label: "Blur", description: "Soft focus" },
];

const rotateOptions: EffectOption[] = [
  { key: "rotate_left", label: "Left 90°", description: "Rotate counter-clockwise" },
  { key: "rotate_right", label: "Right 90°", description: "Rotate clockwise" },
  { key: "rotate_180", label: "180°", description: "Turn upside down" },
];

const flipOptions: EffectOption[] = [
  { key: "flip_horizontal", label: "Horizontal", description: "Mirror left to right" },
  { key: "flip_vertical", label: "Vertical", description: "Mirror top to bottom" },
];

const smartCropOptions: EffectOption[] = [
  { key: "smart_crop_auto", label: "Auto Focus", description: "Centers the main subject" },
  { key: "smart_crop_face", label: "Face Crop", description: "Perfect for profile photos" },
  { key: "smart_crop_person", label: "Object: Person", description: "Focus around person" },
  { key: "smart_crop_car", label: "Object: Car", description: "Focus around vehicles" },
];

const aiEnhanceOptions: EffectOption[] = [
  { key: "auto_enhance", label: "Auto Enhance", description: "AI retouch + contrast + sharpen" },
  { key: "ai_upscale", label: "AI Upscale", description: "Increase resolution up to 16MP" },
];

const PreviewImageEffectTools = ({ selectedActionKey, onSelectAction, disabled }: Props) => {
  const renderActionGrid = (
    options: EffectOption[],
    columnsClassName: string,
    activeClassName: string,
  ) => (
    <div className={`grid gap-2 ${columnsClassName}`}>
      {options.map((option) => (
        <Button
          key={option.key}
          type="button"
          onClick={() => onSelectAction(option.key)}
          disabled={disabled}
          variant={selectedActionKey === option.key ? "default" : "outline"}
          className={`h-auto min-h-20 flex-col items-start rounded-xl border bg-white/90 p-3 text-left shadow-sm dark:bg-slate-800/80 ${
            selectedActionKey === option.key
              ? activeClassName
              : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/80"
          }`}
        >
          <span className="block w-full text-sm font-semibold leading-tight">
            {option.label}
          </span>
          <span className="block w-full text-[11px] font-normal leading-snug opacity-85">
            {option.description}
          </span>
        </Button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-4 shadow-sm dark:border-violet-800/70 dark:from-violet-950/40 dark:to-fuchsia-900/30">
        <div>
          <p className="subtitle-2 text-violet-700 dark:text-violet-300">Smart Crop</p>
          <p className="caption text-violet-600 dark:text-violet-200/80">Subject-aware framing options</p>
        </div>
        {renderActionGrid(
          smartCropOptions,
          "grid-cols-2",
          "border-violet-500 bg-violet-600 text-white dark:border-violet-400 dark:bg-violet-500",
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-sm dark:border-emerald-800/70 dark:from-emerald-950/40 dark:to-teal-900/30">
        <div>
          <p className="subtitle-2 text-emerald-700 dark:text-emerald-300">AI Enhance</p>
          <p className="caption text-emerald-600 dark:text-emerald-200/80">One-click quality improvements</p>
        </div>
        {renderActionGrid(
          aiEnhanceOptions,
          "grid-cols-2",
          "border-emerald-500 bg-emerald-600 text-white dark:border-emerald-400 dark:bg-emerald-500",
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-sky-50 p-4 shadow-sm dark:border-cyan-800/70 dark:from-cyan-950/40 dark:to-sky-900/30">
        <div className="flex items-center justify-between">
          <div>
            <p className="subtitle-2 text-cyan-700 dark:text-cyan-300">Filters</p>
            <p className="caption text-cyan-600 dark:text-cyan-200/80">Quick image looks</p>
          </div>
        </div>
        {renderActionGrid(
          filterOptions,
          "grid-cols-2",
          "border-cyan-500 bg-cyan-600 text-white dark:border-cyan-400 dark:bg-cyan-500",
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-sky-50 p-4 shadow-sm dark:border-indigo-800/70 dark:from-indigo-950/40 dark:to-sky-900/30">
        <div>
          <p className="subtitle-2 text-indigo-700 dark:text-indigo-300">Rotate</p>
          <p className="caption text-indigo-600 dark:text-indigo-200/80">Reorient the image</p>
        </div>
        {renderActionGrid(
          rotateOptions,
          "grid-cols-2 sm:grid-cols-3",
          "border-indigo-500 bg-indigo-600 text-white dark:border-indigo-400 dark:bg-indigo-500",
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 p-4 shadow-sm dark:border-amber-800/70 dark:from-amber-950/40 dark:to-yellow-900/30">
        <div>
          <p className="subtitle-2 text-amber-700 dark:text-amber-300">Flip</p>
          <p className="caption text-amber-600 dark:text-amber-200/80">Mirror the image</p>
        </div>
        {renderActionGrid(
          flipOptions,
          "grid-cols-2",
          "border-amber-500 bg-amber-500 text-white dark:border-amber-400 dark:bg-amber-500",
        )}
      </section>
    </div>
  );
};

export default PreviewImageEffectTools;
