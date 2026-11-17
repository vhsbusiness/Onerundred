"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

const storageKey = (userId: string) => "last-project:" + userId;

export function RememberProject({ userId, path }: { userId: string; path: string }) {
  useEffect(() => {
    try { localStorage.setItem(storageKey(userId), path); } catch { /* Optional on this device. */ }
  }, [userId, path]);
  return null;
}

export function ProjectDirectory({ userId, projects, browse, children }: {
  userId: string; projects: string[]; browse: boolean; children: ReactNode;
}) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!browse) {
      try {
        const path = localStorage.getItem(storageKey(userId));
        if (path && projects.includes(path)) { router.replace(path); return; }
      } catch { /* Fall back to the directory. */ }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- validate the saved project against this account's current list.
    setShow(true);
  }, [userId, projects, browse, router]);
  return browse || show ? children : null;
}
