import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError } from '../firebase';

export interface QuizScheduleFirestorePayload {
  id: string;
  subjectId: string;
  chapterId?: string;
  title: string;
  description?: string;
  startAt?: string;
  dueAt?: string;
  durationMinutes: number;
  maxMarks: number;
  passingMarks: number;
  maxAttempts: number;
  allowLateSubmission: boolean;
  status: 'draft' | 'published';
}

export interface AssignmentScheduleFirestorePayload {
  id: string;
  subjectId: string;
  chapterId?: string;
  title: string;
  description?: string;
  startAt?: string;
  dueAt?: string;
  maxMarks: number;
  allowedFileTypes: string[];
  maxFileSizeMb: number;
  allowLateSubmission: boolean;
  latePenaltyPercent: number;
  status: 'draft' | 'published';
}

const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

function sanitizeId(id?: string): string {
  if (!id || !SAFE_ID_REGEX.test(id)) return '';
  return id;
}

/**
 * Synchronizes quiz schedule metadata to Firestore (`quizSchedules/{quizId}`) using serverTimestamp().
 * Gracefully skips if the current session is not backed by Firebase Auth.
 */
export async function syncQuizScheduleToFirestore(
  payload: QuizScheduleFirestorePayload,
  isNew = true
): Promise<void> {
  const uid = auth.currentUser?.uid;
  const cleanId = sanitizeId(payload.id);
  const cleanSubjectId = sanitizeId(payload.subjectId);
  if (!uid || !cleanId || !cleanSubjectId) return;

  const docRef = doc(db, 'quizSchedules', cleanId);
  let exists = !isNew;
  if (!isNew) {
    try {
      const snap = await getDoc(docRef);
      exists = snap.exists();
    } catch {
      exists = false;
    }
  }

  const maxMarks = Math.max(1, Math.min(10000, Math.round(payload.maxMarks || 100)));
  const passingMarks = Math.max(0, Math.min(maxMarks, Math.round(payload.passingMarks || 0)));

  const data: Record<string, any> = {
    id: cleanId,
    teacherId: uid,
    subjectId: cleanSubjectId,
    title: payload.title.trim().slice(0, 200),
    description: (payload.description || '').trim().slice(0, 2000),
    durationMinutes: Math.max(1, Math.min(600, Math.round(payload.durationMinutes || 20))),
    maxMarks,
    passingMarks,
    maxAttempts: Math.max(1, Math.min(100, Math.round(payload.maxAttempts || 1))),
    allowLateSubmission: Boolean(payload.allowLateSubmission),
    status: payload.status === 'draft' ? 'draft' : 'published',
    updatedAt: serverTimestamp(),
  };

  if (payload.chapterId && sanitizeId(payload.chapterId)) {
    data.chapterId = sanitizeId(payload.chapterId);
  }
  if (payload.startAt) data.startAt = payload.startAt.slice(0, 64);
  if (payload.dueAt) data.dueAt = payload.dueAt.slice(0, 64);
  if (!exists) data.createdAt = serverTimestamp();

  try {
    await setDoc(docRef, data, { merge: exists });
  } catch (err) {
    try {
      handleFirestoreError(err, exists ? OperationType.UPDATE : OperationType.CREATE, `quizSchedules/${cleanId}`);
    } catch {
      // Non-blocking sync: backend API remains primary source of truth
    }
  }
}

export async function deleteQuizScheduleFromFirestore(quizId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  const cleanId = sanitizeId(quizId);
  if (!uid || !cleanId) return;
  try {
    await deleteDoc(doc(db, 'quizSchedules', cleanId));
  } catch {
    // Non-blocking cleanup
  }
}

/**
 * Synchronizes assignment schedule metadata to Firestore (`assignmentSchedules/{assignmentId}`) using serverTimestamp().
 */
export async function syncAssignmentScheduleToFirestore(
  payload: AssignmentScheduleFirestorePayload,
  isNew = true
): Promise<void> {
  const uid = auth.currentUser?.uid;
  const cleanId = sanitizeId(payload.id);
  const cleanSubjectId = sanitizeId(payload.subjectId);
  if (!uid || !cleanId || !cleanSubjectId) return;

  const docRef = doc(db, 'assignmentSchedules', cleanId);
  let exists = !isNew;
  if (!isNew) {
    try {
      const snap = await getDoc(docRef);
      exists = snap.exists();
    } catch {
      exists = false;
    }
  }

  const allowedTypes = (payload.allowedFileTypes || []).slice(0, 12).map((t) => t.slice(0, 16));
  const data: Record<string, any> = {
    id: cleanId,
    teacherId: uid,
    subjectId: cleanSubjectId,
    title: payload.title.trim().slice(0, 200),
    description: (payload.description || '').trim().slice(0, 4000),
    maxMarks: Math.max(1, Math.min(10000, Math.round(payload.maxMarks || 100))),
    allowedFileTypes: allowedTypes,
    maxFileSizeMb: Math.max(1, Math.min(25, Math.round(payload.maxFileSizeMb || 10))),
    allowLateSubmission: Boolean(payload.allowLateSubmission),
    latePenaltyPercent: Math.max(0, Math.min(100, Math.round(payload.latePenaltyPercent || 0))),
    status: payload.status === 'draft' ? 'draft' : 'published',
    updatedAt: serverTimestamp(),
  };

  if (payload.chapterId && sanitizeId(payload.chapterId)) {
    data.chapterId = sanitizeId(payload.chapterId);
  }
  if (payload.startAt) data.startAt = payload.startAt.slice(0, 64);
  if (payload.dueAt) data.dueAt = payload.dueAt.slice(0, 64);
  if (!exists) data.createdAt = serverTimestamp();

  try {
    await setDoc(docRef, data, { merge: exists });
  } catch (err) {
    try {
      handleFirestoreError(
        err,
        exists ? OperationType.UPDATE : OperationType.CREATE,
        `assignmentSchedules/${cleanId}`
      );
    } catch {
      // Non-blocking sync
    }
  }
}

export async function deleteAssignmentScheduleFromFirestore(assignmentId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  const cleanId = sanitizeId(assignmentId);
  if (!uid || !cleanId) return;
  try {
    await deleteDoc(doc(db, 'assignmentSchedules', cleanId));
  } catch {
    // Non-blocking cleanup
  }
}
