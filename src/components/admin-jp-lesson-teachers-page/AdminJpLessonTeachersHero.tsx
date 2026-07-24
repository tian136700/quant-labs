"use client";

import type { Locale } from "@/i18n/messages";
import type { LessonTeacherSubject } from "@/lib/locale-path";
import { adminPath, adminRbacPath, adminToolCodesPath, adminTrendsPath, adminUsersPath, enLessonPath, jpLessonPath } from "@/lib/locale-path";

export type AdminJpLessonTeachersHeroProps = { locale: Locale; teacherSubject: LessonTeacherSubject; navTitle: string };

export function AdminJpLessonTeachersHero({ locale, teacherSubject, navTitle }: AdminJpLessonTeachersHeroProps) {
  return (
<div className="page-hero">
        <h1>{navTitle}</h1>
        <p className="sub">
          {teacherSubject === "en"
            ? locale === "zh"
              ? "维护英语新课的上课老师列表与评价；英语老师不创建系统登录账号，也不纳入「今日有课自动启用」。"
              : "Manage English lesson teachers and reviews. No system login accounts; excluded from daily class-day auto-enable."
            : teacherSubject === "ko"
              ? locale === "zh"
                ? "维护韩语课的上课老师列表与评价；可创建登录账号。开课前 30 分钟自动启用（手动日程老师名须与此一致）；抽完最后一个字母后 20 分钟自动禁用。"
                : "Manage Korean teachers and reviews. Create login accounts here. Auto-enable 30min before class (manual schedule name must match); disable 20min after last letter."
            : locale === "zh"
              ? "维护日语新课的上课老师列表；仅管理员可在新课页面看到并分配。"
              : "Manage lesson teachers for JP lessons. Only admins can assign them."}
        </p>
        <p className="hint">
          <a href={adminPath(locale)}>{locale === "zh" ? "← 返回后台管理" : "← Back to admin"}</a>
          {teacherSubject !== "ko" ? (
            <>
              {" · "}
              <a href={teacherSubject === "en" ? enLessonPath() : jpLessonPath()}>
                {teacherSubject === "en"
                  ? locale === "zh"
                    ? "英语新课"
                    : "English lessons"
                  : locale === "zh"
                    ? "日语新课"
                    : "JP lessons"}
              </a>
            </>
          ) : null}
          {" · "}
          <a href={adminUsersPath(locale)}>{locale === "zh" ? "用户管理" : "Users"}</a>
          {" · "}
          <a href={adminTrendsPath(locale)}>{locale === "zh" ? "趋势抓取" : "Trends"}</a>
          {" · "}
          <a href={adminRbacPath(locale)}>{locale === "zh" ? "角色权限" : "Roles"}</a>
          {" · "}
          <a href={adminToolCodesPath(locale)}>{locale === "zh" ? "工具发码" : "Tool codes"}</a>
        </p>
      </div>
  );
}
