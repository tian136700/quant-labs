import "server-only";

export { enableEtrAuthDevStore } from "./state";
export type { AuthSessionResolve } from "./state";

export {
  ensureDefaultAdminUser,
  ensureJpVocabTeacherUser,
  ensureJpVocabUser1,
  syncBootstrapUsersFromEnv,
} from "./bootstrap";

export type { AuthResult } from "./session";
export {
  findUserById,
  loginUser,
  registerUser,
  createSessionForUser,
  getSessionUserFromRequest,
  resolveAuthSession,
  getSessionUser,
  logoutSession,
} from "./session";

export type { EtrUserLoginHistoryRow } from "./login_history";
export {
  ensureEtrUserLoginHistorySchema,
  listUserLoginHistory,
  recordUserLoginHistory,
} from "./login_history";

export type { EtrIpGeoCacheRow } from "./ip_geo_cache";
export {
  ensureEtrIpGeoCacheSchema,
  getCachedIpGeo,
  getCachedIpGeoMap,
  resolveIpGeoCached,
} from "./ip_geo_cache";

export type {
  LoginIpGeoBackfillStatus,
  LoginIpGeoBackfillStepResult,
} from "./ip_geo_backfill";
export {
  listDistinctLoginIps,
  getLoginIpGeoBackfillStatus,
  requeueLoginIpGeoBackfill,
  stepLoginIpGeoBackfill,
} from "./ip_geo_backfill";

export {
  listEtrUsers,
  revokeUserSessions,
  setUserDisabled,
  setUserNeverDisable,
  deleteUserByAdmin,
  createUserByAdmin,
  updateUserByAdmin,
  resetUserPasswordByAdmin,
} from "./users";
export type {
  SetUserDisabledResult,
  SetUserNeverDisableResult,
  DeleteUserByAdminResult,
  CreateUserByAdminResult,
  CreateUserByAdminOptions,
  UpdateUserByAdminInput,
  UpdateUserByAdminResult,
  ResetUserPasswordByAdminResult,
} from "./users";

export {
  listJpLessonTeacherLinkMapByUserId,
  listJpLessonTeacherNameMapByUserId,
  setUserJpLessonTeacherLink,
  findJpLessonTeacherUserLink,
  listJpLessonTeacherUserLinkMapByTeacherId,
  ensureJpLessonTeacherUserAccount,
  provisionJpLessonTeacherUser,
  createJpLessonTeacherUserByReview,
  findKoLessonTeacherUserLink,
  listKoLessonTeacherUserLinkMapByTeacherId,
  ensureKoLessonTeacherUserAccount,
  createKoLessonTeacherUserByReview,
} from "./teacher_links";
export type {
  JpLessonTeacherLinkByUser,
  SetUserJpLessonTeacherLinkResult,
  JpLessonTeacherUserLink,
  EnsureJpLessonTeacherUserAccountResult,
  ProvisionJpLessonTeacherUserResult,
  CreateJpLessonTeacherUserByReviewResult,
  KoLessonTeacherUserLink,
  EnsureKoLessonTeacherUserAccountResult,
  CreateKoLessonTeacherUserByReviewResult,
} from "./teacher_links";

export {
  linkUserToEnLessonTeacher,
  findEnLessonTeacherUserLink,
  listEnLessonTeacherUserLinkMapByTeacherId,
  ensureEnLessonTeacherUserAccount,
  createEnLessonTeacherUserByReview,
  setUserEnLessonTeacherLink,
} from "./teacher_links_en";
export type {
  EnLessonTeacherUserLink,
  EnsureEnLessonTeacherUserAccountResult,
  CreateEnLessonTeacherUserByReviewResult,
} from "./teacher_links_en";
