"use client";

import type { RbacTeacherModules } from "@/lib/rbac";

type Props = {
  value: RbacTeacherModules;
  onChange: (next: RbacTeacherModules) => void;
  locale: "zh" | "en";
  disabled?: boolean;
  /** 用于表单 field class 前缀：admin-user-edit / admin-user-add */
  fieldClassPrefix?: "admin-user-edit" | "admin-user-add";
};

export function AdminUserTeacherModulesField({
  value,
  onChange,
  locale,
  disabled = false,
  fieldClassPrefix = "admin-user-edit",
}: Props) {
  const fieldClass = `${fieldClassPrefix}-field`;
  const toggle = (key: keyof RbacTeacherModules) => {
    onChange({ ...value, [key]: !value[key] });
  };

  return (
    <fieldset className={fieldClass} disabled={disabled}>
      <legend>
        {locale === "zh" ? "老师身份（可多选）" : "Teacher roles (multi-select)"}
      </legend>
      <div className="admin-user-teacher-modules">
        <label className="admin-user-teacher-module">
          <input
            type="checkbox"
            checked={value.jp}
            disabled={disabled}
            onChange={() => toggle("jp")}
          />
          <span>{locale === "zh" ? "日语老师" : "Japanese teacher"}</span>
        </label>
        <label className="admin-user-teacher-module">
          <input
            type="checkbox"
            checked={value.en}
            disabled={disabled}
            onChange={() => toggle("en")}
          />
          <span>{locale === "zh" ? "英语老师" : "English teacher"}</span>
        </label>
        <label className="admin-user-teacher-module">
          <input
            type="checkbox"
            checked={value.ko}
            disabled={disabled}
            onChange={() => toggle("ko")}
          />
          <span>{locale === "zh" ? "韩语老师" : "Korean teacher"}</span>
        </label>
      </div>
      <span className={`${fieldClass}-hint`}>
        {locale === "zh"
          ? "可同时勾选，例如「日语老师 + 韩语老师」。都不勾选则为普通用户。"
          : "You can select more than one (e.g. JP + KO teacher). None = regular user."}
      </span>
      <style jsx>{`
        .admin-user-teacher-modules {
          display: flex;
          flex-wrap: wrap;
          gap: 0.55rem 1rem;
          margin-top: 0.35rem;
        }
        .admin-user-teacher-module {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.92rem;
          cursor: pointer;
          user-select: none;
        }
        .admin-user-teacher-module input {
          width: 1rem;
          height: 1rem;
          accent-color: #c45c26;
        }
        fieldset.${fieldClass} {
          border: none;
          margin: 0;
          padding: 0;
          min-width: 0;
        }
        fieldset.${fieldClass} legend {
          padding: 0;
          font-size: 0.85rem;
          font-weight: 600;
        }
      `}</style>
    </fieldset>
  );
}
