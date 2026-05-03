import Image from "next/image";
import { getTrashedFiles } from "@/lib/actions/file.actions";
import TrashFileList from "@/components/TrashFileList";

const TrashPage = async () => {
  const trashedFiles = await getTrashedFiles();
  const total = trashedFiles?.total ?? 0;

  return (
    <div className="page-container">
      {/* Hero strip */}
      <div className="type-hero type-hero--trash w-full">
        <div className="type-hero-inner">
          <div className="type-hero-left">
            <div className="type-hero-icon">
              <Image
                src="/assets/icons/trash.svg"
                alt="Trash"
                width={36}
                height={36}
                className="size-full object-contain"
              />
            </div>
            <div>
              <h1 className="h1">Trash</h1>
              <div className="type-hero-count">
                <span className="subtitle-2 type-hero-accent">
                  {total} {total === 1 ? "file" : "files"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {total > 0 ? (
        <TrashFileList files={trashedFiles!.documents} />
      ) : (
        <p className="empty-list">Trash is empty</p>
      )}
    </div>
  );
};

export default TrashPage;
