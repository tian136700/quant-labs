"use client";

import { createPortal } from "react-dom";
import type { Locale } from "@/i18n/messages";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import type { LoginLinkTemplate } from "@/lib/types";

export type AdminUsersTemplatesModalProps = {
  open: boolean;
  mounted: boolean;
  locale: Locale;
  templates: LoginLinkTemplate[];
  templatesLoading: boolean;
  templateSaving: boolean;
  selectedTemplateId: number | null;
  newTemplateName: string;
  newTemplateBody: string;
  editingTemplateId: number | null;
  editTemplateName: string;
  editTemplateBody: string;
  onClose: () => void;
  onSelectedTemplateIdChange: (id: number | null) => void;
  onNewTemplateNameChange: (value: string) => void;
  onNewTemplateBodyChange: (value: string) => void;
  onEditTemplateNameChange: (value: string) => void;
  onEditTemplateBodyChange: (value: string) => void;
  onCreateTemplate: () => void;
  onStartEditTemplate: (template: LoginLinkTemplate) => void;
  onSaveEditTemplate: () => void;
  onCancelEditTemplate: () => void;
  onDeleteTemplate: (template: LoginLinkTemplate) => void;
};

export function AdminUsersTemplatesModal({
  open,
  mounted,
  locale,
  templates,
  templatesLoading,
  templateSaving,
  selectedTemplateId,
  newTemplateName,
  newTemplateBody,
  editingTemplateId,
  editTemplateName,
  editTemplateBody,
  onClose,
  onSelectedTemplateIdChange,
  onNewTemplateNameChange,
  onNewTemplateBodyChange,
  onEditTemplateNameChange,
  onEditTemplateBodyChange,
  onCreateTemplate,
  onStartEditTemplate,
  onSaveEditTemplate,
  onCancelEditTemplate,
  onDeleteTemplate,
}: AdminUsersTemplatesModalProps) {
  if (!mounted || !open) return null;

  const close = () => {
    onClose();
    onCancelEditTemplate();
  };

  return createPortal(
    <div
      className="admin-users-modal-overlay"
      onMouseDown={(e) => closeModalOnBackdropMouseDown(e, close)}
    >
      <div
        className="admin-users-modal admin-users-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-users-templates-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="admin-users-modal-header">
          <div>
            <h2 id="admin-users-templates-title" className="admin-users-modal-title">
              {locale === "zh" ? "登录链接文字模板" : "Login link templates"}
            </h2>
            <p className="admin-users-modal-subtitle">
              {locale === "zh"
                ? "这里管理模板；列表操作里「带模板复制」会使用当前选用模板。"
                : "Manage templates here. 'Copy with template' uses the active template."}
            </p>
          </div>
          <button
            type="button"
            className="admin-users-modal-close"
            aria-label={locale === "zh" ? "关闭" : "Close"}
            onClick={close}
          >
            ×
          </button>
        </div>

        <div className="admin-users-modal-body admin-users-templates-body">
          <p className="hint admin-login-link-templates-hint" style={{ marginTop: 0 }}>
            {locale === "zh"
              ? "复制登录链接时可选择「仅链接」或「带模板复制」。每次生成都会作废该用户此前的登录链接与已登录状态。链接路径会带上用户名（如 /sign-in/用户名/助记词）。正文会放在链接前面；也可写 {login_url} / {username} 指定位置。"
              : "Copy plain URL or copy with template text. Each new link invalidates previous links/sessions. URLs include the username (/sign-in/username/slug). Use {login_url} / {username} placeholders."}
          </p>

          {templates.length > 0 ? (
            <label className="admin-login-link-template-select">
              <span>{locale === "zh" ? "当前选用模板" : "Active template"}</span>
              <select
                value={selectedTemplateId ?? ""}
                disabled={templatesLoading || templateSaving}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  onSelectedTemplateIdChange(Number.isInteger(id) && id > 0 ? id : null);
                }}
              >
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {templatesLoading ? (
            <p className="hint">{locale === "zh" ? "加载模板…" : "Loading templates…"}</p>
          ) : templates.length === 0 ? (
            <p className="hint">
              {locale === "zh" ? "暂无模板，可在下方添加。" : "No templates yet. Add one below."}
            </p>
          ) : (
            <div className="admin-login-link-templates-list">
              {templates.map((template) => (
                <div key={template.id} className="admin-login-link-template-card">
                  {editingTemplateId === template.id ? (
                    <>
                      <label className="admin-login-link-template-field">
                        <span>{locale === "zh" ? "名称" : "Name"}</span>
                        <input
                          type="text"
                          value={editTemplateName}
                          disabled={templateSaving}
                          onChange={(e) => onEditTemplateNameChange(e.target.value)}
                        />
                      </label>
                      <label className="admin-login-link-template-field">
                        <span>{locale === "zh" ? "正文" : "Body"}</span>
                        <textarea
                          rows={4}
                          value={editTemplateBody}
                          disabled={templateSaving}
                          onChange={(e) => onEditTemplateBodyChange(e.target.value)}
                        />
                      </label>
                      <div className="admin-login-link-template-actions">
                        <button
                          type="button"
                          className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
                          disabled={
                            templateSaving ||
                            !editTemplateName.trim() ||
                            !editTemplateBody.trim()
                          }
                          onClick={() => void onSaveEditTemplate()}
                        >
                          {templateSaving
                            ? locale === "zh"
                              ? "保存中…"
                              : "Saving…"
                            : locale === "zh"
                              ? "保存"
                              : "Save"}
                        </button>
                        <button
                          type="button"
                          className="btn-rsi-filter btn-rsi-filter--compact"
                          disabled={templateSaving}
                          onClick={onCancelEditTemplate}
                        >
                          {locale === "zh" ? "取消" : "Cancel"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="admin-login-link-template-head">
                        <strong>{template.name}</strong>
                        <div className="admin-login-link-template-actions">
                          <button
                            type="button"
                            className="btn-rsi-filter btn-rsi-filter--compact admin-user-btn"
                            disabled={templateSaving}
                            onClick={() => onStartEditTemplate(template)}
                          >
                            {locale === "zh" ? "编辑" : "Edit"}
                          </button>
                          <button
                            type="button"
                            className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--danger admin-user-btn"
                            disabled={templateSaving}
                            onClick={() => void onDeleteTemplate(template)}
                          >
                            {locale === "zh" ? "删除" : "Delete"}
                          </button>
                        </div>
                      </div>
                      <pre className="admin-login-link-template-body">{template.body}</pre>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="admin-login-link-template-add">
            <h3 className="admin-login-link-template-add-title">
              {locale === "zh" ? "添加模板" : "Add template"}
            </h3>
            <label className="admin-login-link-template-field">
              <span>{locale === "zh" ? "名称" : "Name"}</span>
              <input
                type="text"
                value={newTemplateName}
                disabled={templateSaving}
                placeholder={locale === "zh" ? "例如：日语课提醒" : "e.g. Japanese class reminder"}
                onChange={(e) => onNewTemplateNameChange(e.target.value)}
              />
            </label>
            <label className="admin-login-link-template-field">
              <span>{locale === "zh" ? "正文" : "Body"}</span>
              <textarea
                rows={4}
                value={newTemplateBody}
                disabled={templateSaving}
                placeholder={
                  locale === "zh"
                    ? "例如：老师请在上课前十几二十分钟，抽查前 20 个单词。"
                    : "e.g. Please review the first 20 words 15–20 minutes before class."
                }
                onChange={(e) => onNewTemplateBodyChange(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary"
              disabled={templateSaving || !newTemplateName.trim() || !newTemplateBody.trim()}
              onClick={() => void onCreateTemplate()}
            >
              {templateSaving
                ? locale === "zh"
                  ? "添加中…"
                  : "Adding…"
                : locale === "zh"
                  ? "添加模板"
                  : "Add template"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
