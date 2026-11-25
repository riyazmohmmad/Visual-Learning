# VisuaLearn Firestore Security Specification

## 1. Data Invariants
- **Super Admin Identity (Verified Email, No Custom Claims Required)**:
  - Only an authenticated Firebase user whose cryptographically verified token has `request.auth.token.email_verified == true` AND `request.auth.token.email.lower() == 'riyazmohmmad80@gmail.com'` is recognized as `isSuperAdmin()`.
  - Unverified tokens matching `riyazmohmmad80@gmail.com` (`email_verified != true`) are strictly DENIED Super Admin access.
  - No other user can EVER gain Super Admin privileges by editing their `/users/{uid}` profile, `/admins/{uid}`, or local client state.
- `/users/{userId}`
  - **Ownership & PII Isolation**: `get` allowed only for the document owner (`request.auth.uid == userId`) or verified admins (`isAdmin()`). `list` allowed ONLY for verified admins (`isAdmin()`). Unauthenticated access is strictly denied.
  - **Role Enforcement**: Ordinary client self-registration (`create`) strictly restricts `role` to `'student'` or `'teacher'`, and `accountStatus` to `'active'`. Privileged roles (`'admin'`, `'super_admin'`, `'sub_admin'`) can NEVER be self-assigned by ordinary users.
  - **Super Admin Self-Sync**: Only `isSuperAdmin()` may create or upgrade their own `/users/{uid}` profile with `role == 'super_admin'`.
  - **Immutable Fields**: On `update` by an ordinary owner, `uid`, `email`, `role`, `accountStatus`, `createdAt`, `permissions`, `studentId`, `teacherId`, and `adminId` CANNOT be modified.
  - **Field Constraints**: Strict allowlist via `keys().hasOnly(...)` and `affectedKeys().hasOnly(...)`. Bounded string lengths on `fullName` (1..120), `email` (3..254), `institution` (0..160), `bio` (0..1000), `phone` (0..40), `avatar` (0..700000).
  - **Timestamps**: `createdAt` must equal `request.time` on creation and never change on update. `updatedAt` must equal `request.time` on writes.
  - **No Plain-Text Passwords**: `password` and `password_hash` keys are completely forbidden by the field allowlist.
- `/admins/{userId}`
  - **Read**: Allowed only for owner (`request.auth.uid == userId`) or verified `isAdmin()`.
  - **Write**: Strictly restricted to `isSuperAdmin()` (who may sync their own `super_admin` record or manage `admin`/`sub_admin` records) and verified `isFullAdmin()` (who may manage `admin`/`sub_admin` records only). Ordinary users and sub-admins can NEVER write `/admins/{userId}`. No one can grant `super_admin` to another user.
- `/systemConfig/{configId}`
  - **Read**: `get` allowed only for verified admins (`isAdmin()`); `list` denied.
  - **Write**: `create` and `update` allowed ONLY for `isSuperAdmin()` with strict field schema validation; `delete` strictly denied (`false`).
- `/curriculumVideos/{videoId}` and `/curriculumSimulations/{simulationId}`
  - **Draft Isolation**: Students may ONLY read (`get` / `list`) documents where `status == 'published'`. Draft documents are readable ONLY by the owning teacher (`teacherId == request.auth.uid`) or verified admins (`isAdmin()`).
  - **Write Ownership**: Only active teachers (`isTeacher()` with `request.resource.data.teacherId == request.auth.uid`) or admins (`isAdmin()`) may create documents. Updates and deletes are restricted to the owning teacher (`resource.data.teacherId == request.auth.uid`) or admins.
  - **Immutable Identity**: `id`, `teacherId`, and `createdAt` cannot change after creation; `updatedAt` must equal `request.time`.
  - **Safe URL & Payload Bounds**: `contentUrl` (and optional `thumbnailUrl`) must start with `https://`, `http://`, or `/uploads/` (no `javascript:` or `data:` payloads), bounded to 2048 chars.
- `/videoProgress/{progressId}`
  - **User Isolation**: Each student may only read and write their own watch progress records (`uid == request.auth.uid`), while admins may read/manage for analytics/cleanup.

## 2. Adversarial "Dirty Dozen" Payloads (Must All Be Rejected)
1. **Unauthenticated Read**: `GET /users/uid_123` with `auth == null` -> DENIED.
2. **Cross-User PII Read**: `GET /users/uid_victim` as `uid_attacker` (student) -> DENIED.
3. **Collection Enumeration**: `LIST /users` as `uid_student` -> DENIED.
4. **Role Self-Escalation on Create**: `CREATE /users/uid_attacker` with `role: 'super_admin'` or `'admin'` -> DENIED.
5. **Role Self-Escalation on Update**: `UPDATE /users/uid_student` changing `role` from `'student'` to `'super_admin'`, `'admin'`, or `'teacher'` -> DENIED.
6. **Email Verification Spoof Attack**: `LIST /users` or `WRITE /systemConfig/settings` with `email: 'riyazmohmmad80@gmail.com'` and `email_verified: false` -> DENIED.
7. **Account Status Tampering**: `UPDATE /users/uid_student` changing `accountStatus` from `'disabled'` to `'active'` -> DENIED.
8. **UID Spoofing**: `CREATE /users/uid_other` as `uid_attacker` with `uid: 'uid_other'` -> DENIED.
9. **CreatedAt Forgery**: `CREATE /users/uid_attacker` with backdated `createdAt` != `request.time` -> DENIED.
10. **Password Storage Attempt**: `CREATE /users/uid_attacker` containing `password: 'secret123'` -> DENIED (not in `hasOnly` allowlist).
11. **Oversized Payload DoS**: `UPDATE /users/uid_student` with `bio` > 1000 chars or `fullName` > 120 chars -> DENIED.
12. **Admin Registry Tampering**: `CREATE /admins/uid_attacker` as student, teacher, or sub-admin -> DENIED.
13. **Super Admin Grant to Third Party**: `CREATE /admins/other_uid` with `role: 'super_admin'` -> DENIED.
14. **System Config Tampering by Non-Super-Admin**: `UPDATE /systemConfig/settings` as student, teacher, or sub-admin -> DENIED.
15. **Student Draft Leak**: `GET/LIST /curriculumVideos` with `status == 'draft'` as a student -> DENIED.
16. **Cross-Teacher Hijack & XSS URL**: `UPDATE /curriculumVideos/vid_1` as another teacher OR `contentUrl: 'javascript:alert(1)'` -> DENIED.
