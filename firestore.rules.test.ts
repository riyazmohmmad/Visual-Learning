/**
 * Security Rules Specification Test Matrix for VisuaLearn Firestore
 * Verifies verified-email Super Admin authorization, RBAC, PII isolation,
 * and adversarial attack payloads.
 */

export interface SecurityTestCase {
  id: string;
  description: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'ALLOW' | 'DENY';
}

export const FIRESTORE_SECURITY_TEST_CASES: SecurityTestCase[] = [
  {
    id: 'T01_UNAUTH_READ',
    description: 'Unauthenticated user cannot read /users/{uid}',
    operation: 'get',
    path: '/users/student_1',
    auth: null,
    expected: 'DENY',
  },
  {
    id: 'T02_CROSS_USER_PII_READ',
    description: 'Student cannot read another user profile',
    operation: 'get',
    path: '/users/student_2',
    auth: { uid: 'student_1', email: 's1@example.com', email_verified: true },
    expected: 'DENY',
  },
  {
    id: 'T03_LIST_USERS_DENIED',
    description: 'Ordinary user cannot list /users collection',
    operation: 'list',
    path: '/users',
    auth: { uid: 'student_1', email: 's1@example.com', email_verified: true },
    expected: 'DENY',
  },
  {
    id: 'T04_OWNER_CREATE_STUDENT',
    description: 'New user can create their own student profile with valid fields',
    operation: 'create',
    path: '/users/student_1',
    auth: { uid: 'student_1', email: 's1@example.com', email_verified: false },
    payload: {
      uid: 'student_1',
      fullName: 'Alice Student',
      email: 's1@example.com',
      role: 'student',
      profileCompleted: true,
      accountStatus: 'active',
    },
    expected: 'ALLOW',
  },
  {
    id: 'T05_SELF_ESCALATE_ADMIN_CREATE',
    description: 'Ordinary user cannot self-register as super_admin',
    operation: 'create',
    path: '/users/attacker_1',
    auth: { uid: 'attacker_1', email: 'attacker@example.com', email_verified: true },
    payload: {
      uid: 'attacker_1',
      fullName: 'Attacker',
      email: 'attacker@example.com',
      role: 'super_admin',
      profileCompleted: true,
      accountStatus: 'active',
    },
    expected: 'DENY',
  },
  {
    id: 'T06_SELF_ESCALATE_ROLE_UPDATE',
    description: 'Student cannot update their own role field to super_admin or teacher',
    operation: 'update',
    path: '/users/student_1',
    auth: { uid: 'student_1', email: 's1@example.com', email_verified: true },
    payload: { role: 'super_admin' },
    expected: 'DENY',
  },
  {
    id: 'T07_OWNER_UPDATE_SAFE_FIELDS',
    description: 'Owner can update allowed profile fields without touching role/uid/createdAt',
    operation: 'update',
    path: '/users/student_1',
    auth: { uid: 'student_1', email: 's1@example.com', email_verified: true },
    payload: { fullName: 'Alice Updated', bio: 'Physics enthusiast' },
    expected: 'ALLOW',
  },
  {
    id: 'T08_PLAINTEXT_PASSWORD_REJECTED',
    description: 'Any document containing password field is rejected by allowlist',
    operation: 'create',
    path: '/users/student_3',
    auth: { uid: 'student_3', email: 's3@example.com', email_verified: true },
    payload: {
      uid: 'student_3',
      fullName: 'Test User',
      email: 's3@example.com',
      role: 'student',
      password: 'plaintextPassword',
      profileCompleted: true,
      accountStatus: 'active',
    },
    expected: 'DENY',
  },
  {
    id: 'T09_ADMIN_REGISTRY_PROTECTED',
    description: 'Non-admin cannot write to /admins/{uid}',
    operation: 'create',
    path: '/admins/attacker_1',
    auth: { uid: 'attacker_1', email: 'attacker@example.com', email_verified: true },
    payload: { uid: 'attacker_1', email: 'attacker@example.com', role: 'super_admin' },
    expected: 'DENY',
  },
  {
    id: 'T10_UNVERIFIED_SUPER_ADMIN_EMAIL_SPOOF',
    description: 'Unverified token matching riyazmohmmad80@gmail.com is denied Super Admin access',
    operation: 'list',
    path: '/users',
    auth: { uid: 'spoof_uid', email: 'riyazmohmmad80@gmail.com', email_verified: false },
    expected: 'DENY',
  },
  {
    id: 'T11_VERIFIED_SUPER_ADMIN_LIST_USERS',
    description: 'Verified riyazmohmmad80@gmail.com can list /users and manage platform records',
    operation: 'list',
    path: '/users',
    auth: { uid: 'super_admin_uid', email: 'riyazmohmmad80@gmail.com', email_verified: true },
    expected: 'ALLOW',
  },
  {
    id: 'T12_VERIFIED_SUPER_ADMIN_PROMOTE_SUB_ADMIN',
    description: 'Verified Super Admin can write sub_admin record in /admins/{targetUid}',
    operation: 'create',
    path: '/admins/sub_admin_1',
    auth: { uid: 'super_admin_uid', email: 'riyazmohmmad80@gmail.com', email_verified: true },
    payload: {
      uid: 'sub_admin_1',
      email: 'subadmin@example.com',
      role: 'sub_admin',
      status: 'active',
      permissions: ['manage_students', 'view_analytics'],
    },
    expected: 'ALLOW',
  },
  {
    id: 'T13_NO_THIRD_PARTY_SUPER_ADMIN',
    description: 'Even Super Admin cannot grant super_admin role to another UID in /admins',
    operation: 'create',
    path: '/admins/other_uid',
    auth: { uid: 'super_admin_uid', email: 'riyazmohmmad80@gmail.com', email_verified: true },
    payload: {
      uid: 'other_uid',
      email: 'other@example.com',
      role: 'super_admin',
    },
    expected: 'DENY',
  },
  {
    id: 'T14_SYSTEM_CONFIG_RESTRICTED_TO_SUPER_ADMIN',
    description: 'Ordinary user cannot write /systemConfig/settings',
    operation: 'update',
    path: '/systemConfig/settings',
    auth: { uid: 'student_1', email: 's1@example.com', email_verified: true },
    payload: { maintenanceMode: true },
    expected: 'DENY',
  },
];
