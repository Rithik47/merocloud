import Image from "next/image";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Models } from "node-appwrite";

import ActionDropdown from "@/components/ActionDropdown";
import { Chart } from "@/components/Chart";
import { FormattedDateTime } from "@/components/FormattedDateTime";
import { Thumbnail } from "@/components/Thumbnail";
import { Separator } from "@/components/ui/separator";
import { getFiles, getTotalSpaceUsed } from "@/lib/actions/file.actions";
import { convertFileSize, getUsageSummary } from "@/lib/utils";

const Dashboard = async () => {
  // Parallel requests
  const [files, totalSpace] = await Promise.all([
    getFiles({ types: [], limit: 10 }),
    getTotalSpaceUsed(),
  ]);

  // Get usage summary
  const usageSummary = getUsageSummary(totalSpace);

  return (
    <div className="dashboard-container">
      <section>
        <Chart used={totalSpace.used} />

        {/* Uploaded file type summaries */}
        <ul className="dashboard-summary-list">
          {usageSummary.map((summary) => (
            <Link
              href={summary.url}
              key={summary.title}
              className={`dashboard-summary-card summary-card-${summary.title.toLowerCase()}`}
            >
              <div className="space-y-4">
                <div className="flex justify-between gap-3">
                  <div className="summary-type-icon">
                    <Image
                      src={summary.icon}
                      width={44}
                      height={44}
                      alt={`${summary.title} icon`}
                      className="summary-type-icon-image"
                    />
                  </div>
                  <h4 className="summary-type-size">
                    {convertFileSize(summary.size) || 0}
                  </h4>
                </div>

                <h5 className="summary-type-title">{summary.title}</h5>
                <Separator className="bg-light-400 dark:bg-white/10" />
                <FormattedDateTime
                  date={summary.latestDate}
                  className="text-center"
                />
              </div>
            </Link>
          ))}
        </ul>
      </section>

      {/* Recent files uploaded */}
      <section className="dashboard-recent-files">
        <h2 className="h3 xl:h2 text-light-100">Recent files uploaded</h2>
        {files.documents.length > 0 ? (
          <ul className="mt-5 flex flex-col gap-5">
            {files.documents.map((file: Models.Document) => (
              <li key={file.$id} className="flex items-center gap-3">
                <Link
                  href={`/preview/${file.$id}`}
                  className="flex flex-1 items-center gap-3"
                >
                  <Thumbnail
                    type={file.type}
                    extension={file.extension}
                    url={file.url}
                    isEncrypted={!!file.isEncrypted}
                  />

                  <div className="recent-file-details">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <p className="recent-file-name">{file.name}</p>
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
                        className="caption"
                      />
                    </div>
                  </div>
                </Link>
                <ActionDropdown file={file} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-list">No files uploaded</p>
        )}
      </section>
    </div>
  );
};

export default Dashboard;
