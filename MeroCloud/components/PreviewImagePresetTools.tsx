"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";

type Props = {
  selectedActionKey: string | null;
  onSelectAction: (actionKey: string) => void;
  disabled?: boolean;
  fileUrl: string;
};

type PresetOption = {
  value: string;
  label: string;
  width: number;
  height: number;
  mode: "crop" | "resize";
};

const presetOptions: PresetOption[] = [
  {
    value: "crop_square",
    label: "Crop 1:1 (Square)",
    width: 1080,
    height: 1080,
    mode: "crop",
  },
  {
    value: "crop_portrait",
    label: "Crop 4:5 (Portrait)",
    width: 1080,
    height: 1350,
    mode: "crop",
  },
  {
    value: "crop_landscape",
    label: "Crop 16:9 (Landscape)",
    width: 1600,
    height: 900,
    mode: "crop",
  },
  {
    value: "resize_web",
    label: "Resize Web (1600px)",
    width: 1600,
    height: 1000,
    mode: "resize",
  },
  {
    value: "resize_mobile",
    label: "Resize Mobile (1080px)",
    width: 1080,
    height: 1350,
    mode: "resize",
  },
  {
    value: "resize_hd",
    label: "Resize HD (1920px)",
    width: 1920,
    height: 1080,
    mode: "resize",
  },
];

const getAspectClass = (preset: PresetOption) => {
  if (preset.value === "crop_square") return "aspect-square";
  if (preset.value === "crop_portrait") return "aspect-[4/5]";
  if (preset.value === "crop_landscape") return "aspect-video";
  if (preset.value === "resize_mobile") return "aspect-[4/5]";
  if (preset.value === "resize_hd") return "aspect-video";

  return "aspect-[16/10]";
};

const PreviewImagePresetTools = ({
  selectedActionKey,
  onSelectAction,
  disabled,
  fileUrl,
}: Props) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3 overflow-x-auto pb-1">
        {presetOptions.map((preset) => (
          <Button
            key={preset.value}
            type="button"
            onClick={() => onSelectAction(preset.value)}
            disabled={disabled}
            variant="outline"
            className={`w-28 shrink-0 rounded-md border p-1 text-left transition sm:w-32 ${
              selectedActionKey === preset.value
                ? "border-cyan-500 bg-cyan-100/70 dark:border-cyan-400 dark:bg-cyan-900/40"
                : "border-light-400 bg-white dark:border-slate-700 dark:bg-slate-800/80"
            }`}
          >
            <div
              className={`${getAspectClass(preset)} relative overflow-hidden rounded-sm bg-light-300 dark:bg-slate-700`}
            >
              <Image
                src={fileUrl}
                alt={preset.label}
                fill
                sizes="112px"
                className="size-full object-cover"
              />
            </div>
            <p className="mt-1 line-clamp-2 block text-[11px] font-semibold leading-snug text-light-100 dark:text-slate-100">
              {preset.label}
            </p>
            <p className="block text-[10px] leading-snug text-light-200 dark:text-slate-300">
              {preset.mode === "crop" ? "Crop" : "Resize"} • {preset.width}x{preset.height}
            </p>
          </Button>
        ))}
      </div>
    </div>
  );
};

export default PreviewImagePresetTools;
