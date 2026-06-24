"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { isJpVocabTeacherAllowedPath, jpVocabPath } from "@/lib/locale-path";

/** 仅「日语教师导航」且非完整导航的用户，限制在日语相关页面 */
export function JpVocabTeacherRouteGuard() {
  const { hasPermission, isAdmin, checking } = useEtrAuth();
  const pathname = usePathname() ?? "/";
  const router = useRouter();

  const restricted =
    !checking &&
    !isAdmin &&
    hasPermission("nav:jp_teacher") &&
    !hasPermission("nav:full");

  useEffect(() => {
    if (!restricted) return;
    if (isJpVocabTeacherAllowedPath(pathname)) return;
    router.replace(jpVocabPath());
  }, [restricted, pathname, router]);

  return null;
}
