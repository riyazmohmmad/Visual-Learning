import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';

export interface FirestoreClassRecord {
  id: string;
  name: string;
  code?: string;
  description: string;
  teacherId: string;
  teacherName: string;
  section: string;
  classCode: string;
  status: 'active' | 'draft' | 'archived' | 'disabled';
  iconName?: string;
  color?: string;
  thumbnail?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FirestoreEnrollmentRecord {
  id: string;
  studentId: string;
  classId: string;
  teacherId: string;
  classCode: string;
  className: string;
  section?: string;
  teacherName?: string;
  studentName?: string;
  studentEmail?: string;
  enrolledBy?: string;
  status: 'active' | 'removed';
  enrolledAt?: string;
  updatedAt?: string;
}

function toIsoTimestamp(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function isValidEmailFormat(email?: string): boolean {
  if (!email) return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());
}

function isValidFirestoreDocId(id?: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id);
}

export function buildEnrollmentDocId(studentId: string, classId: string): string {
  return `${studentId}_${classId}`;
}

function mapClassDoc(docId: string, data: Record<string, any>): FirestoreClassRecord {
  return {
    id: typeof data.id === 'string' && data.id ? data.id : docId,
    name: String(data.name || ''),
    code: typeof data.code === 'string' ? data.code : undefined,
    description: String(data.description || ''),
    teacherId: String(data.teacherId || ''),
    teacherName: String(data.teacherName || 'Teacher'),
    section: String(data.section || 'B21'),
    classCode: String(data.classCode || '').toUpperCase(),
    status: (data.status as FirestoreClassRecord['status']) || 'active',
    iconName: typeof data.iconName === 'string' ? data.iconName : undefined,
    color: typeof data.color === 'string' ? data.color : undefined,
    thumbnail: typeof data.thumbnail === 'string' ? data.thumbnail : undefined,
    createdAt: toIsoTimestamp(data.createdAt),
    updatedAt: toIsoTimestamp(data.updatedAt),
  };
}

function mapEnrollmentDoc(docId: string, data: Record<string, any>): FirestoreEnrollmentRecord {
  return {
    id: typeof data.id === 'string' && data.id ? data.id : docId,
    studentId: String(data.studentId || ''),
    classId: String(data.classId || ''),
    teacherId: String(data.teacherId || ''),
    classCode: String(data.classCode || '').toUpperCase(),
    className: String(data.className || ''),
    section: typeof data.section === 'string' ? data.section : undefined,
    teacherName: typeof data.teacherName === 'string' ? data.teacherName : undefined,
    studentName: typeof data.studentName === 'string' ? data.studentName : undefined,
    studentEmail: typeof data.studentEmail === 'string' ? data.studentEmail : undefined,
    enrolledBy: typeof data.enrolledBy === 'string' ? data.enrolledBy : undefined,
    status: data.status === 'removed' ? 'removed' : 'active',
    enrolledAt: toIsoTimestamp(data.enrolledAt),
    updatedAt: toIsoTimestamp(data.updatedAt),
  };
}

/**
 * Mirrors a teacher/admin-managed class into Firestore /classes/{classId}
 * without overwriting immutable fields (id, teacherId, createdAt).
 */
export async function upsertFirestoreClass(input: {
  id: string;
  name: string;
  code?: string;
  description?: string;
  teacherId: string;
  teacherName?: string;
  section?: string;
  classCode: string;
  status?: 'active' | 'draft' | 'archived' | 'disabled';
  iconName?: string;
  color?: string;
  thumbnail?: string;
}): Promise<boolean> {
  if (!auth.currentUser) return false;
  if (!isValidFirestoreDocId(input.id) || !isValidFirestoreDocId(input.teacherId)) return false;

  const normalizedClassCode = (input.classCode || '').trim().toUpperCase();
  if (normalizedClassCode.length < 3 || normalizedClassCode.length > 40) return false;

  const classPath = `classes/${input.id}`;
  const classRef = doc(db, 'classes', input.id);

  try {
    const existingSnap = await getDoc(classRef);

    const sharedFields: Record<string, any> = {
      name: (input.name || 'Untitled Class').trim().slice(0, 160),
      description: (input.description || '').trim().slice(0, 2000),
      teacherName: (input.teacherName || 'Teacher').trim().slice(0, 120),
      section: (input.section || 'B21').trim().toUpperCase().slice(0, 32),
      classCode: normalizedClassCode,
      status: input.status || 'active',
      updatedAt: serverTimestamp(),
    };

    if (input.code && input.code.trim()) {
      sharedFields.code = input.code.trim().toUpperCase().slice(0, 32);
    }
    if (input.iconName && input.iconName.trim()) {
      sharedFields.iconName = input.iconName.trim().slice(0, 64);
    }
    if (input.color && input.color.trim()) {
      sharedFields.color = input.color.trim().slice(0, 32);
    }
    if (input.thumbnail && input.thumbnail.trim()) {
      sharedFields.thumbnail = input.thumbnail.trim().slice(0, 512);
    }

    if (existingSnap.exists()) {
      await updateDoc(classRef, sharedFields);
    } else {
      await setDoc(classRef, {
        ...sharedFields,
        id: input.id,
        teacherId: input.teacherId,
        createdAt: serverTimestamp(),
      });
    }
    return true;
  } catch (err) {
    console.warn(`Unable to sync class ${classPath} to Firestore:`, err);
    return false;
  }
}

/**
 * Deletes a class from Firestore ONLY when a teacher or admin explicitly deletes it.
 */
export async function deleteFirestoreClass(classId: string): Promise<void> {
  if (!auth.currentUser || !isValidFirestoreDocId(classId)) return;
  try {
    await deleteDoc(doc(db, 'classes', classId));
  } catch (err) {
    console.warn(`Unable to delete Firestore class classes/${classId}:`, err);
  }
}

/**
 * Looks up an active class by class code in Firestore (resilient fallback if backend restarted).
 */
export async function findFirestoreClassByCode(classCode: string): Promise<FirestoreClassRecord | null> {
  if (!auth.currentUser) return null;
  const normalized = classCode.trim().toUpperCase();
  if (!normalized) return null;

  try {
    const q = query(
      collection(db, 'classes'),
      where('status', '==', 'active'),
      where('classCode', '==', normalized)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const first = snap.docs[0];
    return mapClassDoc(first.id, first.data());
  } catch (err) {
    console.warn('Firestore class code lookup notice:', err);
    return null;
  }
}

/**
 * Permanently persists a student enrollment to Firestore at enrollments/${studentId}_${classId}
 * and verifies persistence with a read-back before returning.
 * NEVER overwrites or removes an existing active enrollment.
 */
export async function confirmAndSaveEnrollmentInFirestore(input: {
  studentId: string;
  classId: string;
  teacherId: string;
  classCode: string;
  className: string;
  section?: string;
  teacherName?: string;
  studentName?: string;
  studentEmail?: string;
  enrolledBy?: string;
}): Promise<{ confirmed: boolean; alreadyExisted: boolean; enrollment?: FirestoreEnrollmentRecord }> {
  if (!auth.currentUser) {
    return { confirmed: false, alreadyExisted: false };
  }
  if (
    !isValidFirestoreDocId(input.studentId) ||
    !isValidFirestoreDocId(input.classId) ||
    !isValidFirestoreDocId(input.teacherId)
  ) {
    return { confirmed: false, alreadyExisted: false };
  }

  const docId = buildEnrollmentDocId(input.studentId, input.classId);
  if (!isValidFirestoreDocId(docId)) {
    return { confirmed: false, alreadyExisted: false };
  }

  const enrollmentPath = `enrollments/${docId}`;
  const enrollmentRef = doc(db, 'enrollments', docId);

  try {
    // 1. Check if enrollment already exists — NEVER delete or overwrite an active record.
    const existingSnap = await getDoc(enrollmentRef);
    if (existingSnap.exists()) {
      const existingData = existingSnap.data();
      if (existingData.status === 'active') {
        return {
          confirmed: true,
          alreadyExisted: true,
          enrollment: mapEnrollmentDoc(existingSnap.id, existingData),
        };
      }
    }

    const payload: Record<string, any> = {
      id: docId,
      studentId: input.studentId,
      classId: input.classId,
      teacherId: input.teacherId,
      classCode: (input.classCode || 'CLASS').trim().toUpperCase().slice(0, 40),
      className: (input.className || 'Class').trim().slice(0, 160),
      status: 'active',
      enrolledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (input.section && input.section.trim()) {
      payload.section = input.section.trim().toUpperCase().slice(0, 32);
    }
    if (input.teacherName && input.teacherName.trim()) {
      payload.teacherName = input.teacherName.trim().slice(0, 120);
    }
    if (input.studentName && input.studentName.trim()) {
      payload.studentName = input.studentName.trim().slice(0, 120);
    }
    if (input.studentEmail && isValidEmailFormat(input.studentEmail)) {
      payload.studentEmail = input.studentEmail.trim().toLowerCase();
    }
    if (input.enrolledBy && isValidFirestoreDocId(input.enrolledBy)) {
      payload.enrolledBy = input.enrolledBy;
    }

    if (existingSnap.exists()) {
      // Only teacher or admin can reactivate a previously removed record via update
      await updateDoc(enrollmentRef, {
        status: 'active',
        className: payload.className,
        classCode: payload.classCode,
        ...(payload.section ? { section: payload.section } : {}),
        ...(payload.teacherName ? { teacherName: payload.teacherName } : {}),
        ...(payload.studentName ? { studentName: payload.studentName } : {}),
        ...(payload.studentEmail ? { studentEmail: payload.studentEmail } : {}),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(enrollmentRef, payload);
    }

    // 2. Confirm persistence by reading back the committed document
    const confirmSnap = await getDoc(enrollmentRef);
    if (!confirmSnap.exists()) {
      return { confirmed: false, alreadyExisted: false };
    }

    return {
      confirmed: true,
      alreadyExisted: false,
      enrollment: mapEnrollmentDoc(confirmSnap.id, confirmSnap.data()),
    };
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, enrollmentPath);
    } catch (wrappedErr) {
      throw wrappedErr;
    }
    return { confirmed: false, alreadyExisted: false };
  }
}

/**
 * Checks Firestore directly for an active enrollment record for (studentUid, classId).
 */
export async function checkStudentEnrollmentInFirestore(
  studentUid: string,
  classId: string
): Promise<FirestoreEnrollmentRecord | null> {
  if (!auth.currentUser || !isValidFirestoreDocId(studentUid) || !isValidFirestoreDocId(classId)) {
    return null;
  }
  const docId = buildEnrollmentDocId(studentUid, classId);
  if (!isValidFirestoreDocId(docId)) return null;

  try {
    const snap = await getDoc(doc(db, 'enrollments', docId));
    if (!snap.exists()) return null;
    const record = mapEnrollmentDoc(snap.id, snap.data());
    return record.status === 'active' ? record : null;
  } catch (err) {
    console.warn('Firestore enrollment lookup notice:', err);
    return null;
  }
}

/**
 * Explicitly deletes an enrollment record from Firestore.
 * MUST ONLY be called by an authorized Teacher (of that class) or Admin/Super Admin
 * during an explicit unenroll action — NEVER automatically.
 */
export async function deleteEnrollmentInFirestore(studentId: string, classId: string): Promise<void> {
  if (!auth.currentUser || !isValidFirestoreDocId(studentId) || !isValidFirestoreDocId(classId)) return;
  const docId = buildEnrollmentDocId(studentId, classId);
  if (!isValidFirestoreDocId(docId)) return;

  try {
    await deleteDoc(doc(db, 'enrollments', docId));
  } catch (err) {
    console.warn(`Unable to delete Firestore enrollment enrollments/${docId}:`, err);
  }
}

/**
 * Fetches a student's active enrollments from Firestore once (non-destructive).
 */
export async function fetchStudentEnrollmentsFromFirestore(
  studentUid: string
): Promise<FirestoreEnrollmentRecord[]> {
  if (!auth.currentUser || auth.currentUser.uid !== studentUid) return [];
  try {
    const q = query(collection(db, 'enrollments'), where('studentId', '==', studentUid));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => mapEnrollmentDoc(d.id, d.data()))
      .filter((e) => e.status === 'active');
  } catch (err) {
    console.warn('Firestore student enrollments fetch notice:', err);
    return [];
  }
}

/**
 * Real-time listener for a student's active enrollments in Firestore.
 * Separates error/offline events from empty snapshots and NEVER deletes local or remote records.
 */
export function subscribeToStudentEnrollments(
  studentUid: string,
  onUpdate: (enrollments: FirestoreEnrollmentRecord[]) => void,
  onError?: (errorMessage: string) => void
): () => void {
  if (!studentUid || !auth.currentUser || auth.currentUser.uid !== studentUid) {
    return () => {};
  }

  const q = query(collection(db, 'enrollments'), where('studentId', '==', studentUid));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const activeEnrollments = snapshot.docs
        .map((d) => mapEnrollmentDoc(d.id, d.data()))
        .filter((e) => e.status === 'active');
      onUpdate(activeEnrollments);
    },
    (err) => {
      console.warn('Student enrollments Firestore listener notice:', err?.message || err);
      onError?.(err?.message || 'Unable to listen to student enrollments.');
    }
  );

  return unsubscribe;
}

/**
 * Real-time listener for a teacher's classes and their active student enrollments in Firestore.
 */
export function subscribeToTeacherEnrollmentsAndClasses(
  teacherUid: string,
  onUpdate: (payload: {
    enrollments: FirestoreEnrollmentRecord[];
    classes: FirestoreClassRecord[];
  }) => void,
  onError?: (errorMessage: string) => void
): () => void {
  if (!teacherUid || !auth.currentUser || auth.currentUser.uid !== teacherUid) {
    return () => {};
  }

  let latestEnrollments: FirestoreEnrollmentRecord[] = [];
  let latestClasses: FirestoreClassRecord[] = [];
  let enrollmentsReady = false;
  let classesReady = false;

  const emitIfReady = () => {
    if (enrollmentsReady || classesReady) {
      onUpdate({
        enrollments: latestEnrollments,
        classes: latestClasses,
      });
    }
  };

  const unsubEnrollments = onSnapshot(
    query(collection(db, 'enrollments'), where('teacherId', '==', teacherUid)),
    (snap) => {
      enrollmentsReady = true;
      latestEnrollments = snap.docs
        .map((d) => mapEnrollmentDoc(d.id, d.data()))
        .filter((e) => e.status === 'active');
      emitIfReady();
    },
    (err) => {
      console.warn('Teacher enrollments Firestore listener notice:', err?.message || err);
      onError?.(err?.message || 'Unable to listen to teacher enrollments.');
    }
  );

  const unsubClasses = onSnapshot(
    query(collection(db, 'classes'), where('teacherId', '==', teacherUid)),
    (snap) => {
      classesReady = true;
      latestClasses = snap.docs.map((d) => mapClassDoc(d.id, d.data()));
      emitIfReady();
    },
    (err) => {
      console.warn('Teacher classes Firestore listener notice:', err?.message || err);
      onError?.(err?.message || 'Unable to listen to teacher classes.');
    }
  );

  return () => {
    unsubEnrollments();
    unsubClasses();
  };
}

/**
 * Real-time listener for Super Admin / Admin portals to reconcile all Firestore classes & enrollments.
 */
export function subscribeToAdminEnrollmentsAndClasses(
  onUpdate: (payload: {
    enrollments: FirestoreEnrollmentRecord[];
    classes: FirestoreClassRecord[];
  }) => void,
  onError?: (errorMessage: string) => void
): () => void {
  if (!auth.currentUser) return () => {};

  let latestEnrollments: FirestoreEnrollmentRecord[] = [];
  let latestClasses: FirestoreClassRecord[] = [];
  let enrollmentsReady = false;
  let classesReady = false;

  const emitIfReady = () => {
    if (enrollmentsReady || classesReady) {
      onUpdate({
        enrollments: latestEnrollments,
        classes: latestClasses,
      });
    }
  };

  const unsubEnrollments = onSnapshot(
    collection(db, 'enrollments'),
    (snap) => {
      enrollmentsReady = true;
      latestEnrollments = snap.docs
        .map((d) => mapEnrollmentDoc(d.id, d.data()))
        .filter((e) => e.status === 'active');
      emitIfReady();
    },
    (err) => {
      console.warn('Admin enrollments Firestore listener notice:', err?.message || err);
      onError?.(err?.message || 'Unable to listen to enrollments.');
    }
  );

  const unsubClasses = onSnapshot(
    collection(db, 'classes'),
    (snap) => {
      classesReady = true;
      latestClasses = snap.docs.map((d) => mapClassDoc(d.id, d.data()));
      emitIfReady();
    },
    (err) => {
      console.warn('Admin classes Firestore listener notice:', err?.message || err);
      onError?.(err?.message || 'Unable to listen to classes.');
    }
  );

  return () => {
    unsubEnrollments();
    unsubClasses();
  };
}
