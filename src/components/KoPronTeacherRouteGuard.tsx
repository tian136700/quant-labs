"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { isKoPronTeacherAllowedPath, koPronPath } from "@/lib/locale-path";

/** 仅「韩语教师导航」且非完整导航的用户，限制在韩语相关页面 */
export function KoPronTeacherRouteGuard() {
  const { hasPermission, isAdmin, checking } = useEtrAuth();
  const pathname = usePathname() ?? "/";
  const router = useRouter();

  const restricted =
    !checking &&
    !isAdmin &&
    hasPermission("nav:ko_teacher") &&
    !hasPermission("nav:full");

  useEffect(() => {
    if (!restricted) return;
    if (isKoPronTeacherAllowedPath(pathname)) return;
    router.replace(koPronPath());
  }, [restricted, pathname, router]);

  return null;
}
