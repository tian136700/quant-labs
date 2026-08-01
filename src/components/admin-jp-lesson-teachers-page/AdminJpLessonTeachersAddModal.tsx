"use client";

import { type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Locale } from "@/i18n/messages";
import {
  LESSON_MINUTE_OPTIONS,
  defaultLessonMinutesWhenRateSet,
  formatLessonMinuteOptionLabel,
} from "@/components/admin-jp-lesson-teachers-page/admin-jp-lesson-teachers-page-helpers";

export type AdminJpLessonTeachersAddModalProps = {
  open: boolean;
  mounted: boolean;
  locale: Locale;
  saving: boolean;
  newName: string;
  newHourlyRate: string;
  newLessonMinutes: string;
  newTencentMeetingId: string;
  addNameInputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onNameChange: (v: string) => void;
  onHourlyRateChange: (v: string) => void;
  onLessonMinutesChange: (v: string) => void;
  onTencentMeetingIdChange: (v: string) => void;
  onSubmit: () => void;
  /** 仅英语老师展示腾讯会议号 */
  showTencentMeeting?: boolean;
};

export function AdminJpLessonTeachersAddModal(props: AdminJpLessonTeachersAddModalProps) {
  const {
    open, mounted, locale, saving, newName, newHourlyRate, newLessonMinutes,
    newTencentMeetingId, addNameInputRef, onClose, onNameChange, onHourlyRateChange,
    onLessonMinutesChange, onTencentMeetingIdChange, onSubmit,
    showTencentMeeting = false,
  } = props;
  if (!mounted || !open) return null;
  return createPortal(
<div
              className="jp-lesson-teacher-overlay"
              role="presentation"
              onClick={onClose}
            >
              <div
                className="jp-lesson-teacher-modal admin-jpl-add-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-jpl-add-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="jp-lesson-teacher-header">
                  <div>
                    <h2 id="admin-jpl-add-title">
                      {locale === "zh" ? "添加老师" : "Add teacher"}
                    </h2>
                    <p className="jp-lesson-teacher-modal-lesson">
                      {locale === "zh"
                        ? "新增老师后可在列表中「一键创建用户」；也可在评价弹窗中勾选创建账号。"
                        : "After adding, use “Create user” in the list, or create from the review modal."}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="jp-lesson-teacher-close"
                    aria-label={locale === "zh" ? "关闭" : "Close"}
                    disabled={saving}
                    onClick={onClose}
                  >
                    ×
                  </button>
                </div>

                <form
                  className="admin-jpl-add-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    onSubmit();
                  }}
                >
                  <label className="admin-user-add-field">
                    <span>{locale === "zh" ? "名称" : "Name"}</span>
                    <input
                      ref={addNameInputRef}
                      type="text"
                      value={newName}
                      disabled={saving}
                      placeholder={locale === "zh" ? "例如：周老师" : "e.g. Teacher Zhou"}
                      onChange={(e) => onNameChange(e.target.value)}
                    />
                  </label>
                  <label className="admin-user-add-field">
                    <span>{locale === "zh" ? "课时费（RMB/小时）" : "Rate (RMB/h)"}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newHourlyRate}
                      disabled={saving}
                      placeholder={locale === "zh" ? "选填" : "Optional"}
                      onChange={(e) => {
                        const next = e.target.value;
                        onHourlyRateChange(next);
                        onLessonMinutesChange(
                          defaultLessonMinutesWhenRateSet(next, newLessonMinutes)
                        );
                      }}
                    />
                  </label>
                  <label className="admin-user-add-field">
                    <span>{locale === "zh" ? "单次课时长" : "Lesson duration"}</span>
                    <select
                      value={newLessonMinutes}
                      disabled={saving}
                      onChange={(e) => onLessonMinutesChange(e.target.value)}
                    >
                      <option value="">{locale === "zh" ? "选填" : "Optional"}</option>
                      {LESSON_MINUTE_OPTIONS.map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {formatLessonMinuteOptionLabel(minutes, locale)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {showTencentMeeting ? (
                    <label className="admin-user-add-field">
                      <span>
                        {locale === "zh" ? "腾讯会议号" : "Tencent Meeting ID"}
                      </span>
                      <input
                        type="text"
                        value={newTencentMeetingId}
                        disabled={saving}
                        placeholder={
                          locale === "zh" ? "例如：849-255-3123" : "e.g. 849-255-3123"
                        }
                        onChange={(e) => onTencentMeetingIdChange(e.target.value)}
                      />
                    </label>
                  ) : null}
                  <p className="hint admin-user-add-hint">
                    {locale === "zh"
                      ? "老师列表支持「一键创建用户」（拼音用户名 + 易记密码）；评价弹窗中也可勾选创建。"
                      : "Use “Create user” on the teacher list (pinyin username + memorable password), or create from review."}
                  </p>
                  <div className="etr-form-actions etr-form-actions--inline">
                    <button
                      type="button"
                      className="btn-rsi-filter"
                      disabled={saving}
                      onClick={onClose}
                    >
                      {locale === "zh" ? "取消" : "Cancel"}
                    </button>
                    <button
                      type="submit"
                      className="btn-rsi-filter btn-rsi-filter--primary"
                      disabled={saving || !newName.trim()}
                    >
                      {saving
                        ? locale === "zh"
                          ? "提交中…"
                          : "Saving…"
                        : locale === "zh"
                          ? "添加"
                          : "Add"}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
    document.body
  );
}
