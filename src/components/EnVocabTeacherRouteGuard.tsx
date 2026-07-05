"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { isEnVocabTeacherAllowedPath, enVocabPath } from "@/lib/locale-path";

/** 仅「英语教师导航」且非完整导航的用户，限制在英语相关页面 */
export function EnVocabTeacherRouteGuard() {
  const { hasPermission, isAdmin, checking } = useEtrAuth();
  const pathname = usePathname() ?? "/";
  const router = useRouter();

  const restricted =
    !checking &&
    !isAdmin &&
    hasPermission("nav:en_teacher") &&
    !hasPermission("nav:full");

  useEffect(() => {
    if (!restricted) return;
    if (isEnVocabTeacherAllowedPath(pathname)) return;
    router.replace(enVocabPath());
  }, [restricted, pathname, router]);

  return null;
}
