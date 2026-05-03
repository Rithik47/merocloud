"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import VideoAiPanel from "@/components/VideoAiPanel";

type Props = {
  fileId: string;
  fileName: string;
  fileUrl: string;
  fileExtension: string;
};

const VideoPreviewWithAi = ({ fileId, fileName, fileUrl, fileExtension }: Props) => {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      {/* Video player */}
      <video
        className="h-auto w-full rounded-xl bg-black"
        controls
        playsInline
      >
        <source src={fileUrl} type={`video/${fileExtension || "mp4"}`} />
        Your browser does not support the video tag.
      </video>

      {/* AI panel toggle */}
      <div className="absolute right-3 top-3">
        <Button
          onClick={() => setIsPanelOpen((prev) => !prev)}
          className="modal-submit-button"
        >
          {isPanelOpen ? "Close AI Panel" : "AI Analyze"}
        </Button>
      </div>

      {/* AI Panel — slide in */}
      <div
        className={`absolute inset-2 z-20 transition-all duration-300 sm:inset-x-auto sm:inset-y-4 sm:right-4 sm:w-[min(92vw,380px)] ${
          isPanelOpen
            ? "pointer-events-auto translate-x-0 translate-y-0 opacity-100"
            : "pointer-events-none translate-y-[108%] opacity-0 sm:translate-x-[108%] sm:translate-y-0"
        }`}
      >
        {isPanelOpen && (
          <VideoAiPanel
            fileId={fileId}
            onClose={() => setIsPanelOpen(false)}
          />
        )}
      </div>
    </div>
  );
};

export default VideoPreviewWithAi;
