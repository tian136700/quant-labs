"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import {
  isPathAllowedForSubjectTeachers,
  isSubjectTeacherNavRestricted,
  subjectTeacherHomePath,
} from "@/lib/subject-teacher-route-guard";

/**
 * 科目老师路由笼：多科目身份取「允许路径并集」。
 * 禁止再用三个互斥 Guard 叠跑——日语+韩语老师打开日语教案查看会被韩语 Guard 踢到 /ko-pron。
 */
export function SubjectTeacherRouteGuard() {
  const { hasPermission, isAdmin, checking } = useEtrAuth();
  const pathname = usePathname() ?? "/";
  const router = useRouter();

  const flags = {
    jp: hasPermission("nav:jp_teacher"),
    en: hasPermission("nav:en_teacher"),
    ko: hasPermission("nav:ko_teacher"),
  };
  const restricted =
    !checking &&
    !isAdmin &&
    isSubjectTeacherNavRestricted(flags, hasPermission("nav:full"));

  useEffect(() => {
    if (!restricted) return;
    if (isPathAllowedForSubjectTeachers(pathname, flags)) return;
    router.replace(subjectTeacherHomePath(flags));
  }, [restricted, pathname, router, flags.jp, flags.en, flags.ko]);

  return null;
}
