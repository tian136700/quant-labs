"use client";

import type { Dispatch, FormEvent, SetStateAction } from "react";
import { AdminUserBindTeacherModal } from "@/components/AdminUserBindTeacherModal";
import { AdminUserEditModal } from "@/components/AdminUserEditModal";
import { AdminUsersAddUserModal } from "@/components/admin-users-page/AdminUsersAddUserModal";
import { AdminUsersTemplatesModal } from "@/components/admin-users-page/AdminUsersTemplatesModal";
import type { Locale } from "@/i18n/messages";
import { rememberAdminUserPassword } from "@/lib/admin-user-credentials";
import type { LoginLinkTemplate } from "@/lib/types";
import type { AdminJpLessonTeacherOption, AdminUserEditRow } from "@/components/AdminUserEditModal";
import type { UserRow } from "@/components/admin-users-page/admin-users-page-helpers";
import type { RbacTeacherModules } from "@/lib/rbac";

export type AdminUsersPageModalsProps = {
  locale: Locale;
  editingUser: UserRow | null;
  bindingUser: UserRow | null;
  teachers: AdminJpLessonTeacherOption[];
  teachersLoading: boolean;
  addUserOpen: boolean;
  mounted: boolean;
  creating: boolean;
  newUsername: string;
  newPassword: string;
  newTeacherModules: RbacTeacherModules;
  newTeacherId: number | null;
  addUserModalError: string;
  addUserDisplayedErrors: Record<string, string>;
  templatesOpen: boolean;
  templates: LoginLinkTemplate[];
  templatesLoading: boolean;
  templateSaving: boolean;
  selectedTemplateId: number | null;
  newTemplateName: string;
  newTemplateBody: string;
  editingTemplateId: number | null;
  editTemplateName: string;
  editTemplateBody: string;
  setEditingUser: (v: UserRow | null) => void;
  applyUserUpdate: (updated: AdminUserEditRow) => void;
  loadTeachers: () => void;
  handleUserSaveFailed: (userId: number, snapshot: AdminUserEditRow, message: string) => void;
  setBindingUser: (v: UserRow | null) => void;
  persistUsers: (next: UserRow[]) => void;
  setUsers: Dispatch<SetStateAction<UserRow[]>>;
  setStatus: (v: string) => void;
  setStatusErr: (v: boolean) => void;
  closeAddUserModal: () => void;
  setNewUsername: (v: string) => void;
  setNewPassword: (v: string) => void;
  setNewTeacherModules: (v: RbacTeacherModules) => void;
  setNewTeacherId: (v: number | null) => void;
  setAddUserModalError: (v: string) => void;
  createUser: (e: FormEvent) => void;
  setTemplatesOpen: (v: boolean) => void;
  setSelectedTemplateId: (v: number | null) => void;
  setNewTemplateName: (v: string) => void;
  setNewTemplateBody: (v: string) => void;
  setEditTemplateName: (v: string) => void;
  setEditTemplateBody: (v: string) => void;
  createTemplate: () => void;
  startEditTemplate: (t: LoginLinkTemplate) => void;
  saveEditTemplate: () => void;
  cancelEditTemplate: () => void;
  deleteTemplate: (t: LoginLinkTemplate) => void;
};

export function AdminUsersPageModals(props: AdminUsersPageModalsProps) {
  const {
    locale,
    editingUser,
    bindingUser,
    teachers,
    teachersLoading,
    addUserOpen,
    mounted,
    creating,
    newUsername,
    newPassword,
    newTeacherModules,
    newTeacherId,
    addUserModalError,
    addUserDisplayedErrors,
    templatesOpen,
    templates,
    templatesLoading,
    templateSaving,
    selectedTemplateId,
    newTemplateName,
    newTemplateBody,
    editingTemplateId,
    editTemplateName,
    editTemplateBody,
    setEditingUser,
    applyUserUpdate,
    loadTeachers,
    handleUserSaveFailed,
    setBindingUser,
    persistUsers,
    setUsers,
    setStatus,
    setStatusErr,
    closeAddUserModal,
    setNewUsername,
    setNewPassword,
    setNewTeacherModules,
    setNewTeacherId,
    setAddUserModalError,
    createUser,
    setTemplatesOpen,
    setSelectedTemplateId,
    setNewTemplateName,
    setNewTemplateBody,
    setEditTemplateName,
    setEditTemplateBody,
    createTemplate,
    startEditTemplate,
    saveEditTemplate,
    cancelEditTemplate,
    deleteTemplate,
  } = props;

  return (
    <>
<AdminUserEditModal
        open={editingUser != null}
        user={editingUser}
        locale={locale}
        teachers={teachers}
        teachersLoading={teachersLoading}
        onClose={() => setEditingUser(null)}
        onSaved={(updated) => {
          setEditingUser(null);
          applyUserUpdate(updated);
          void loadTeachers();
        }}
        onSaveFailed={handleUserSaveFailed}
        onCredentialsStored={rememberAdminUserPassword}
      />

      <AdminUserBindTeacherModal
        open={bindingUser != null}
        user={bindingUser}
        locale={locale}
        teachers={teachers}
        teachersLoading={teachersLoading}
        onClose={() => setBindingUser(null)}
        onBound={(bound) => {
          setUsers((prev) => {
            const next = prev.map((item) =>
              item.id === bound.id
                ? {
                    ...item,
                    jp_lesson_teacher_id: bound.jp_lesson_teacher_id,
                    jp_lesson_teacher_name: bound.jp_lesson_teacher_name,
                  }
                : item.jp_lesson_teacher_id != null &&
                    bound.jp_lesson_teacher_id != null &&
                    item.jp_lesson_teacher_id === bound.jp_lesson_teacher_id &&
                    item.id !== bound.id
                  ? {
                      ...item,
                      jp_lesson_teacher_id: null,
                      jp_lesson_teacher_name: null,
                    }
                  : item
            );
            persistUsers(next);
            return next;
          });
          setStatus(
            locale === "zh"
              ? `已更新老师绑定：${bound.jp_lesson_teacher_name || "—"}`
              : `Teacher binding updated: ${bound.jp_lesson_teacher_name || "—"}`
          );
          setStatusErr(false);
          void loadTeachers();
        }}
      />

      <AdminUsersAddUserModal
        open={addUserOpen}
        mounted={mounted}
        locale={locale}
        creating={creating}
        newUsername={newUsername}
        newPassword={newPassword}
        newTeacherModules={newTeacherModules}
        newTeacherId={newTeacherId}
        teachers={teachers}
        teachersLoading={teachersLoading}
        addUserModalError={addUserModalError}
        addUserDisplayedErrors={addUserDisplayedErrors}
        onClose={closeAddUserModal}
        onUsernameChange={setNewUsername}
        onPasswordChange={setNewPassword}
        onTeacherModulesChange={setNewTeacherModules}
        onTeacherIdChange={setNewTeacherId}
        onClearModalError={() => setAddUserModalError("")}
        onSubmit={createUser}
      />

      <AdminUsersTemplatesModal
        open={templatesOpen}
        mounted={mounted}
        locale={locale}
        templates={templates}
        templatesLoading={templatesLoading}
        templateSaving={templateSaving}
        selectedTemplateId={selectedTemplateId}
        newTemplateName={newTemplateName}
        newTemplateBody={newTemplateBody}
        editingTemplateId={editingTemplateId}
        editTemplateName={editTemplateName}
        editTemplateBody={editTemplateBody}
        onClose={() => setTemplatesOpen(false)}
        onSelectedTemplateIdChange={setSelectedTemplateId}
        onNewTemplateNameChange={setNewTemplateName}
        onNewTemplateBodyChange={setNewTemplateBody}
        onEditTemplateNameChange={setEditTemplateName}
        onEditTemplateBodyChange={setEditTemplateBody}
        onCreateTemplate={createTemplate}
        onStartEditTemplate={startEditTemplate}
        onSaveEditTemplate={saveEditTemplate}
        onCancelEditTemplate={cancelEditTemplate}
        onDeleteTemplate={deleteTemplate}
      />
    </>
  );
}
