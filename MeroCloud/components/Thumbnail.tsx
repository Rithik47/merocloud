import React from "react";
import Image from "next/image";
import { cn, getFileIcon } from "@/lib/utils";
import { Lock } from "lucide-react";

interface Props {
  type: string;
  extension: string;
  url?: string;
  imageClassName?: string;
  className?: string;
  isEncrypted?: boolean;
}

export const Thumbnail = ({
  type,
  extension,
  url = "",
  imageClassName,
  className,
  isEncrypted = false,
}: Props) => {
  const isImage = type === "image" && extension !== "svg";

  return (
    <figure className={cn("thumbnail relative", className)}>
      <Image
        src={isImage && !isEncrypted ? url : getFileIcon(extension, type)}
        alt="thumbnail"
        width={100}
        height={100}
        className={cn(
          "size-8 object-contain",
          imageClassName,
          isImage && !isEncrypted && "thumbnail-image",
        )}
      />

      {isEncrypted && (
        <span className="lock-badge">
          <Lock className="size-2.5 text-white" />
        </span>
      )}
    </figure>
  );
};
export default Thumbnail;
