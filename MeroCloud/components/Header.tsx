import React from "react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Search from "@/components/Search";
import FileUploader from "@/components/FileUploader";
import { signOutUser } from "@/lib/actions/user.actions";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import { getNotifications } from "@/lib/actions/notification.actions";

const Header = async ({
  userId,
  accountId,
}: {
  userId: string;
  accountId: string;
}) => {
  const notifications = await getNotifications();

  return (
    <header className="header">
      <Search />
      <div className="header-wrapper">
        <ThemeToggle />
        <NotificationBell notifications={notifications} userId={userId} />
        <FileUploader ownerId={userId} accountId={accountId} />
        <form
          action={async () => {
            "use server";

            await signOutUser();
          }}
        >
          <Button type="submit" className="sign-out-button">
            <Image
              src="/assets/icons/logout.svg"
              alt="logo"
              width={24}
              height={24}
              className="w-6"
            />
          </Button>
        </form>
      </div>
    </header>
  );
};
export default Header;
