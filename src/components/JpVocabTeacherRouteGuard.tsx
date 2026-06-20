"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { isJpVocabTeacherAllowedPath, jpVocabPath } from "@/lib/locale-path";

/** 日语模块老师只能访问 jp-vocab / jp-review / about，其他页面重定向回单词页 */
export function JpVocabTeacherRouteGuard() {
  const { isJpVocabTeacher, checking } = useEtrAuth();
  const pathname = usePathname() ?? "/";
  const router = useRouter();

  useEffect(() => {
    if (checking || !isJpVocabTeacher) return;
    if (isJpVocabTeacherAllowedPath(pathname)) return;
    router.replace(jpVocabPath());
  }, [checking, isJpVocabTeacher, pathname, router]);

  return null;
}
