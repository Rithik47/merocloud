"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Props = {
  fileId: string;
};

type BackgroundRemoveResponse = {
  error?: string;
  file?: {
    $id?: string;
  };
};

const PreviewImageAiButton = ({ fileId }: Props) => {
  const [isLoading, setIsLoading] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const handleRemoveBackground = async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/image/background-remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileId,
          path: pathname,
        }),
      });

      const data = (await response.json()) as BackgroundRemoveResponse;

      if (!response.ok) {
        toast({
          title: "AI edit failed",
          description: data.error || "Unable to remove image background.",
          variant: "destructive",
        });

        return;
      }

      toast({
        title: "AI edit complete",
        description: "Background removed and saved as a new image file.",
      });

      if (data.file?.$id) {
        router.push(`/preview/${data.file.$id}`);
      } else {
        router.refresh();
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unexpected error while running AI background removal.";

      toast({
        title: "AI edit failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleRemoveBackground}
      disabled={isLoading}
      className="modal-submit-button"
    >
      {isLoading ? "Removing..." : "AI Remove Background"}
    </Button>
  );
};

export default PreviewImageAiButton;
