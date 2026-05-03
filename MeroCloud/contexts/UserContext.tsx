"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

interface UserContextValue {
  userId: string;
}

const UserContext = createContext<UserContextValue>({ userId: "" });

export function UserProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: UserContextValue;
}) {
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useCurrentUserId(): string {
  return useContext(UserContext).userId;
}
