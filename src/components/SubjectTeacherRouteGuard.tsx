"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { isVocabRefSharePath } from "@/lib/locale-path";
import {
  isPathAllowedForSubjectTeachers,
  isSubjectTeacherNavRestricted,
  subjectTeacherHomePath,
} from "@/lib/subject-teacher-route-guard";

/**
 * 科目老师路由笼：多科目身份取「允许路径并集」。
 * 须等 authProbeDone（服务端会话探测结束）再跳转，避免微信本地缓存用户误踢。
 * 教案查看页由 AppShell 不挂本组件；此处再挡一层。
 */
export function SubjectTeacherRouteGuard() {
  const { hasPermission, isAdmin, checking, authProbeDone } = useEtrAuth();
  const pathname = usePathname() ?? "/";
  const router = useRouter();

  const flags = {
    jp: hasPermission("nav:jp_teacher"),
    en: hasPermission("nav:en_teacher"),
    ko: hasPermission("nav:ko_teacher"),
  };
  const restricted =
    authProbeDone &&
    !checking &&
    !isAdmin &&
    isSubjectTeacherNavRestricted(flags, hasPermission("nav:full"));

  useEffect(() => {
    if (!restricted) return;
    if (isVocabRefSharePath(pathname)) return;
    if (isPathAllowedForSubjectTeachers(pathname, flags)) return;
    router.replace(subjectTeacherHomePath(flags));
  }, [restricted, pathname, router, flags.jp, flags.en, flags.ko]);

  return null;
}
