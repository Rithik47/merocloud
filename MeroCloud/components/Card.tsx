import { Models } from "node-appwrite";
import Link from "next/link";
import Thumbnail from "@/components/Thumbnail";
import { convertFileSize } from "@/lib/utils";
import FormattedDateTime from "@/components/FormattedDateTime";
import ActionDropdown from "@/components/ActionDropdown";
import { Lock } from "lucide-react";

const Card = ({ file }: { file: Models.Document }) => {
  return (
    <div className={`file-card file-card--${file.type}`}>
      <div className="flex justify-between">
        <Link href={`/preview/${file.$id}`} className="relative">
          <Thumbnail
            type={file.type}
            extension={file.extension}
            url={file.url}
            className="!size-20"
            imageClassName="!size-11"
            isEncrypted={!!file.isEncrypted}
          />
        </Link>

        <div className="flex flex-col items-end justify-between">
          <ActionDropdown file={file} />
          <p className="body-1">{convertFileSize(file.size)}</p>
        </div>
      </div>

      <Link href={`/preview/${file.$id}`} className="file-card-details">
        <div className="flex items-center gap-1.5">
          <p className="subtitle-2 line-clamp-1">{file.name}</p>
          {file.isEncrypted && (
            <span
              title="End-to-end encrypted"
              className="flex shrink-0 items-center gap-1 rounded-full bg-green/15 px-1.5 py-0.5 text-[10px] font-semibold text-green dark:bg-green/10"
            >
              <Lock className="size-2.5" />
              E2E
            </span>
          )}
        </div>
        <FormattedDateTime
          date={file.$createdAt}
          className="body-2 text-light-100"
        />
        <p className="caption line-clamp-1 text-light-200">
          By: {file.owner.fullName}
        </p>
      </Link>
    </div>
  );
};
export default Card;
