import React from "react";
import Image from "next/image";
import Sort from "@/components/Sort";
import { getFiles, getTotalSpaceUsed } from "@/lib/actions/file.actions";
import FileListClient from "@/components/FileListClient";
import { convertFileSize, getFileTypesParams } from "@/lib/utils";

const TYPE_CONFIG: Record<
  string,
  { icon: string; label: string; sizeKey: string[] }
> = {
  documents: {
    icon: "/assets/icons/file-document.svg",
    label: "Documents",
    sizeKey: ["document"],
  },
  images: {
    icon: "/assets/icons/file-image.svg",
    label: "Images",
    sizeKey: ["image"],
  },
  media: {
    icon: "/assets/icons/file-video.svg",
    label: "Media",
    sizeKey: ["video", "audio"],
  },
  others: {
    icon: "/assets/icons/file-other.svg",
    label: "Others",
    sizeKey: ["other"],
  },
};

const Page = async ({ searchParams, params }: SearchParamProps) => {
  const type = ((await params)?.type as string) || "";
  const searchText = ((await searchParams)?.query as string) || "";
  const sort = ((await searchParams)?.sort as string) || "";
  const types = getFileTypesParams(type) as FileType[];

  const [files, totalSpace] = await Promise.all([
    getFiles({ types, searchText, sort }),
    getTotalSpaceUsed(),
  ]);

  const config = TYPE_CONFIG[type] ?? {
    icon: "/assets/icons/file-other.svg",
    label: type,
    sizeKey: ["other"],
  };

  // Sum sizes for all relevant type keys
  const typeSize = config.sizeKey.reduce((acc: number, key: string) => {
    return acc + ((totalSpace as Record<string, { size: number }>)[key]?.size ?? 0);
  }, 0);

  return (
    <div className="page-container">
      {/* ── Hero strip ── */}
      <div className={`type-hero type-hero--${type}`}>
        <div className="type-hero-inner">
          {/* Left: icon + title + meta */}
          <div className="type-hero-left">
            <div className="type-hero-icon">
              <Image
                src={config.icon}
                alt={config.label}
                width={36}
                height={36}
                className="size-full object-contain themed-ui-icon"
              />
            </div>

            <div>
              <h1 className="h1 capitalize">{type}</h1>
              <div className="type-hero-count">
                <span className={`subtitle-2 type-hero-accent`}>
                  {files.total} {files.total === 1 ? "file" : "files"}
                </span>
                <span className="caption text-light-200">·</span>
                <span className="caption text-light-200">
                  {typeSize > 0 ? convertFileSize(typeSize) : "0 MB"} used
                </span>
              </div>
            </div>
          </div>

          {/* Right: sort control */}
          <div className="sort-container !mt-0">
            <p className="body-1 hidden text-light-200 sm:block">Sort by:</p>
            <Sort />
          </div>
        </div>
      </div>

      {/* ── File grid ── */}
      {files.total > 0 ? (
        <FileListClient files={files.documents} />
      ) : (
        <p className="empty-list">No files uploaded</p>
      )}
    </div>
  );
};

export default Page;
