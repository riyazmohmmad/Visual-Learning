import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError } from '../firebase';
import { api } from './api';

export type CurriculumMediaStatus = 'draft' | 'published';

export const SIMULATION_CATEGORIES = [
  'Networking',
  'Cybersecurity',
  'Cryptography',
  'Cloud Architecture',
  'Operating Systems',
  'Data Structures & Algorithms',
  'Computer Science',
  'Physics',
  'Mathematics',
  'Biology',
  'Chemistry',
  'Electronics & Digital Logic',
  'General',
] as const;

export interface CurriculumVideo {
  id: string;
  teacherId: string;
  subjectId: string;
  chapterId: string;
  topicId: string;
  title: string;
  description: string;
  contentUrl: string;
  thumbnailUrl?: string;
  sourceType?: 'url' | 'youtube' | 'upload';
  fileName?: string;
  durationSeconds?: number;
  status: CurriculumMediaStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface CurriculumSimulation {
  id: string;
  teacherId: string;
  subjectId: string;
  chapterId: string;
  topicId: string;
  title: string;
  description: string;
  category?: string;
  contentUrl: string;
  thumbnailUrl?: string;
  sourceType?: 'url' | 'upload';
  fileName?: string;
  instructions?: string;
  status: CurriculumMediaStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface StudentVideoProgressRecord {
  id: string;
  uid: string;
  videoId: string;
  subjectId: string;
  topicId: string;
  watchedSeconds: number;
  durationSeconds?: number;
  completionPercent: number;
  completed: boolean;
  updatedAt?: string;
}

export interface CurriculumVideoInput {
  id?: string;
  subjectId: string;
  chapterId: string;
  topicId: string;
  title: string;
  description: string;
  contentUrl: string;
  thumbnailUrl?: string;
  sourceType?: 'url' | 'youtube' | 'upload';
  fileName?: string;
  durationSeconds?: number;
  status: CurriculumMediaStatus;
}

export interface CurriculumSimulationInput {
  id?: string;
  subjectId: string;
  chapterId: string;
  topicId: string;
  title: string;
  description: string;
  category?: string;
  contentUrl: string;
  thumbnailUrl?: string;
  sourceType?: 'url' | 'upload';
  fileName?: string;
  instructions?: string;
  status: CurriculumMediaStatus;
}

export interface UploadedMediaResponse {
  url: string;
  fileName: string;
  size: number;
  formattedSize: string;
  mimeType: string;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

function generateDocId(prefix: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${randomPart}`;
}

function timestampToIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as any).toDate === 'function') {
    return (value as any).toDate().toISOString();
  }
  if (typeof value === 'string') return value;
  return undefined;
}

export function extractYouTubeId(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{6,20}$/.test(v)) return v;
      const parts = parsed.pathname.split('/').filter(Boolean);
      if ((parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') && parts[1]) {
        return parts[1];
      }
    }
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace(/^\//, '').split('/')[0];
      if (id && /^[a-zA-Z0-9_-]{6,20}$/.test(id)) return id;
    }
  } catch {
    return null;
  }
  return null;
}

export function getYouTubeEmbedUrl(rawUrl?: string): string | null {
  const id = extractYouTubeId(rawUrl);
  return id ? `https://www.youtube.com/embed/${id}?rel=0` : null;
}

export function getYouTubeThumbnailUrl(rawUrl?: string): string | null {
  const id = extractYouTubeId(rawUrl);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

export function isValidMediaUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return false;
  if (trimmed.startsWith('/uploads/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isLegacyDemoVideoUrl(url?: string): boolean {
  if (!url) return true;
  const lower = url.trim().toLowerCase();
  return !lower || lower.includes('bigbuckbunny.mp4');
}

function mapVideoDoc(id: string, data: Record<string, any>): CurriculumVideo {
  return {
    id,
    teacherId: String(data.teacherId || ''),
    subjectId: String(data.subjectId || ''),
    chapterId: String(data.chapterId || ''),
    topicId: String(data.topicId || ''),
    title: String(data.title || ''),
    description: String(data.description || ''),
    contentUrl: String(data.contentUrl || ''),
    thumbnailUrl: data.thumbnailUrl ? String(data.thumbnailUrl) : undefined,
    sourceType: data.sourceType,
    fileName: data.fileName ? String(data.fileName) : undefined,
    durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : undefined,
    status: data.status === 'published' ? 'published' : 'draft',
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

function mapSimulationDoc(id: string, data: Record<string, any>): CurriculumSimulation {
  return {
    id,
    teacherId: String(data.teacherId || ''),
    subjectId: String(data.subjectId || ''),
    chapterId: String(data.chapterId || ''),
    topicId: String(data.topicId || ''),
    title: String(data.title || ''),
    description: String(data.description || ''),
    category: data.category ? String(data.category) : undefined,
    contentUrl: String(data.contentUrl || ''),
    thumbnailUrl: data.thumbnailUrl ? String(data.thumbnailUrl) : undefined,
    sourceType: data.sourceType,
    fileName: data.fileName ? String(data.fileName) : undefined,
    instructions: data.instructions ? String(data.instructions) : undefined,
    status: data.status === 'published' ? 'published' : 'draft',
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

function sortByNewest<T extends { createdAt?: string; updatedAt?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return timeB - timeA;
  });
}

// =========================================================================
// AUTHENTICATED FILE UPLOADS WITH REAL PROGRESS (Express disk storage)
// =========================================================================

export function uploadTeacherMediaFile(
  kind: 'video' | 'simulation' | 'thumbnail',
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadedMediaResponse> {
  return new Promise((resolve, reject) => {
    const token = api.getToken();
    if (!token) {
      reject(new Error('Your session token is unavailable. Please sign in again to upload files.'));
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/uploads/${kind}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const pct = Math.min(99, Math.round((event.loaded / event.total) * 100));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && parsed.url) {
          if (onProgress) onProgress(100);
          resolve(parsed as UploadedMediaResponse);
        } else {
          reject(new Error(parsed.error || `Upload failed with status ${xhr.status}`));
        }
      } catch {
        reject(new Error('Invalid response received from upload server.'));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error occurred while uploading the file.'));
    };

    xhr.send(formData);
  });
}

// =========================================================================
// CURRICULUM VIDEOS (Cloud Firestore: /curriculumVideos/{videoId})
// =========================================================================

export function validateCurriculumVideoInput(input: CurriculumVideoInput): string | null {
  if (!input.title.trim()) return 'Video title is required.';
  if (input.title.trim().length > 200) return 'Video title must be 200 characters or fewer.';
  if (input.description.trim().length > 2000) return 'Description must be 2000 characters or fewer.';
  if (!input.subjectId || !VALID_ID_REGEX.test(input.subjectId)) return 'Please select a valid subject.';
  if (!input.chapterId || !VALID_ID_REGEX.test(input.chapterId)) return 'Please select a valid chapter.';
  if (!input.topicId || !VALID_ID_REGEX.test(input.topicId)) return 'Please select a valid topic or subtopic.';
  if (!isValidMediaUrl(input.contentUrl)) {
    return 'Please provide a valid HTTPS/HTTP video URL (or YouTube link) or upload a video file.';
  }
  if (input.thumbnailUrl && input.thumbnailUrl.trim() && !isValidMediaUrl(input.thumbnailUrl)) {
    return 'Thumbnail URL must be a valid HTTPS/HTTP image URL or uploaded image.';
  }
  return null;
}

export async function listTeacherVideos(teacherUid: string, subjectId?: string): Promise<CurriculumVideo[]> {
  if (!teacherUid) return [];
  const path = 'curriculumVideos';
  try {
    const q = query(collection(db, path), where('teacherId', '==', teacherUid));
    const snap = await getDocs(q);
    let items = snap.docs.map((d) => mapVideoDoc(d.id, d.data()));
    if (subjectId) {
      items = items.filter((v) => v.subjectId === subjectId);
    }
    return sortByNewest(items);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function listPublishedVideosForTopic(
  subjectId: string,
  chapterId: string,
  topicIds: string[],
  includeTeacherUid?: string
): Promise<CurriculumVideo[]> {
  const validTopicIds = new Set(topicIds.filter(Boolean));
  if (!subjectId || !chapterId || validTopicIds.size === 0) return [];
  const path = 'curriculumVideos';

  try {
    const publishedQuery = query(
      collection(db, path),
      where('status', '==', 'published'),
      where('subjectId', '==', subjectId)
    );
    const pubSnap = await getDocs(publishedQuery);
    const merged = new Map<string, CurriculumVideo>();

    pubSnap.docs.forEach((d) => {
      const item = mapVideoDoc(d.id, d.data());
      if (item.chapterId === chapterId && validTopicIds.has(item.topicId)) {
        merged.set(item.id, item);
      }
    });

    // If a teacher is previewing their own topic, also include their drafts for this exact topic
    if (includeTeacherUid) {
      const teacherQuery = query(collection(db, path), where('teacherId', '==', includeTeacherUid));
      const teacherSnap = await getDocs(teacherQuery);
      teacherSnap.docs.forEach((d) => {
        const item = mapVideoDoc(d.id, d.data());
        if (
          item.subjectId === subjectId &&
          item.chapterId === chapterId &&
          validTopicIds.has(item.topicId)
        ) {
          merged.set(item.id, item);
        }
      });
    }

    return sortByNewest(Array.from(merged.values()));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function listPublishedVideosForSubjects(
  subjectIds: string[]
): Promise<CurriculumVideo[]> {
  const allowedSubjects = new Set(subjectIds.filter(Boolean));
  if (allowedSubjects.size === 0) return [];
  const path = 'curriculumVideos';

  try {
    const q = query(collection(db, path), where('status', '==', 'published'));
    const snap = await getDocs(q);
    const items = snap.docs
      .map((d) => mapVideoDoc(d.id, d.data()))
      .filter((v) => allowedSubjects.has(v.subjectId));
    return sortByNewest(items);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveCurriculumVideo(input: CurriculumVideoInput): Promise<CurriculumVideo> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('You must be signed in to save curriculum videos.');
  }

  const validationError = validateCurriculumVideoInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const isUpdate = Boolean(input.id);
  const videoId = input.id || generateDocId('vid');
  const docPath = `curriculumVideos/${videoId}`;
  const docRef = doc(db, 'curriculumVideos', videoId);

  const trimmedUrl = input.contentUrl.trim();
  const detectedSourceType: 'url' | 'youtube' | 'upload' =
    input.sourceType ||
    (trimmedUrl.startsWith('/uploads/')
      ? 'upload'
      : extractYouTubeId(trimmedUrl)
        ? 'youtube'
        : 'url');

  const resolvedThumb =
    input.thumbnailUrl?.trim() ||
    (detectedSourceType === 'youtube' ? getYouTubeThumbnailUrl(trimmedUrl) || '' : '');

  try {
    if (isUpdate) {
      const updatePayload: Record<string, any> = {
        subjectId: input.subjectId.trim(),
        chapterId: input.chapterId.trim(),
        topicId: input.topicId.trim(),
        title: input.title.trim().slice(0, 200),
        description: input.description.trim().slice(0, 2000),
        contentUrl: trimmedUrl.slice(0, 2048),
        thumbnailUrl: resolvedThumb.slice(0, 2048),
        sourceType: detectedSourceType,
        status: input.status,
        updatedAt: serverTimestamp(),
      };
      if (input.fileName !== undefined) {
        updatePayload.fileName = input.fileName.trim().slice(0, 255);
      }
      if (typeof input.durationSeconds === 'number' && input.durationSeconds >= 0) {
        updatePayload.durationSeconds = Math.min(86400, Math.round(input.durationSeconds));
      }

      await updateDoc(docRef, updatePayload);
      const updatedSnap = await getDoc(docRef);
      return mapVideoDoc(videoId, updatedSnap.data() || updatePayload);
    }

    const createPayload: Record<string, any> = {
      id: videoId,
      teacherId: currentUser.uid,
      subjectId: input.subjectId.trim(),
      chapterId: input.chapterId.trim(),
      topicId: input.topicId.trim(),
      title: input.title.trim().slice(0, 200),
      description: input.description.trim().slice(0, 2000),
      contentUrl: trimmedUrl.slice(0, 2048),
      thumbnailUrl: resolvedThumb.slice(0, 2048),
      sourceType: detectedSourceType,
      status: input.status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (input.fileName?.trim()) {
      createPayload.fileName = input.fileName.trim().slice(0, 255);
    }
    if (typeof input.durationSeconds === 'number' && input.durationSeconds >= 0) {
      createPayload.durationSeconds = Math.min(86400, Math.round(input.durationSeconds));
    }

    await setDoc(docRef, createPayload);
    const createdSnap = await getDoc(docRef);
    return mapVideoDoc(videoId, createdSnap.data() || createPayload);
  } catch (error) {
    handleFirestoreError(error, isUpdate ? OperationType.UPDATE : OperationType.CREATE, docPath);
  }
}

export async function updateCurriculumVideoStatus(
  videoId: string,
  status: CurriculumMediaStatus
): Promise<void> {
  const docPath = `curriculumVideos/${videoId}`;
  try {
    await updateDoc(doc(db, 'curriculumVideos', videoId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function deleteCurriculumVideo(videoId: string): Promise<void> {
  const docPath = `curriculumVideos/${videoId}`;
  try {
    await deleteDoc(doc(db, 'curriculumVideos', videoId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// =========================================================================
// CURRICULUM SIMULATIONS (Cloud Firestore: /curriculumSimulations/{simId})
// =========================================================================

export function validateCurriculumSimulationInput(input: CurriculumSimulationInput): string | null {
  if (!input.title.trim()) return 'Simulation title is required.';
  if (input.title.trim().length > 200) return 'Simulation title must be 200 characters or fewer.';
  if (!input.description.trim()) return 'Simulation description is required.';
  if (input.description.trim().length > 2000) return 'Description must be 2000 characters or fewer.';
  if (!input.subjectId || !VALID_ID_REGEX.test(input.subjectId)) return 'Please select a valid subject.';
  if (!input.chapterId || !VALID_ID_REGEX.test(input.chapterId)) return 'Please select a valid chapter.';
  if (!input.topicId || !VALID_ID_REGEX.test(input.topicId)) return 'Please select a valid topic or subtopic.';
  if (!isValidMediaUrl(input.contentUrl)) {
    return 'Please enter a valid HTTPS/HTTP simulation URL or upload an interactive HTML/SVG simulation file.';
  }
  if (input.thumbnailUrl && input.thumbnailUrl.trim() && !isValidMediaUrl(input.thumbnailUrl)) {
    return 'Thumbnail URL must be a valid HTTPS/HTTP image URL or uploaded image.';
  }
  if (input.instructions && input.instructions.trim().length > 2000) {
    return 'Instructions must be 2000 characters or fewer.';
  }
  return null;
}

export async function listTeacherSimulations(
  teacherUid: string,
  subjectId?: string
): Promise<CurriculumSimulation[]> {
  if (!teacherUid) return [];
  const path = 'curriculumSimulations';
  try {
    const q = query(collection(db, path), where('teacherId', '==', teacherUid));
    const snap = await getDocs(q);
    let items = snap.docs.map((d) => mapSimulationDoc(d.id, d.data()));
    if (subjectId) {
      items = items.filter((s) => s.subjectId === subjectId);
    }
    return sortByNewest(items);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function listPublishedSimulationsForTopic(
  subjectId: string,
  chapterId: string,
  topicIds: string[],
  includeTeacherUid?: string
): Promise<CurriculumSimulation[]> {
  const validTopicIds = new Set(topicIds.filter(Boolean));
  if (!subjectId || !chapterId || validTopicIds.size === 0) return [];
  const path = 'curriculumSimulations';

  try {
    const publishedQuery = query(
      collection(db, path),
      where('status', '==', 'published'),
      where('subjectId', '==', subjectId)
    );
    const pubSnap = await getDocs(publishedQuery);
    const merged = new Map<string, CurriculumSimulation>();

    pubSnap.docs.forEach((d) => {
      const item = mapSimulationDoc(d.id, d.data());
      if (item.chapterId === chapterId && validTopicIds.has(item.topicId)) {
        merged.set(item.id, item);
      }
    });

    if (includeTeacherUid) {
      const teacherQuery = query(collection(db, path), where('teacherId', '==', includeTeacherUid));
      const teacherSnap = await getDocs(teacherQuery);
      teacherSnap.docs.forEach((d) => {
        const item = mapSimulationDoc(d.id, d.data());
        if (
          item.subjectId === subjectId &&
          item.chapterId === chapterId &&
          validTopicIds.has(item.topicId)
        ) {
          merged.set(item.id, item);
        }
      });
    }

    return sortByNewest(Array.from(merged.values()));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function listPublishedSimulationsForSubjects(
  subjectIds: string[]
): Promise<CurriculumSimulation[]> {
  const allowedSubjects = new Set(subjectIds.filter(Boolean));
  if (allowedSubjects.size === 0) return [];
  const path = 'curriculumSimulations';

  try {
    // Query only published simulations (aligned with Firestore security rules) and filter strictly to enrolled subjects
    const q = query(collection(db, path), where('status', '==', 'published'));
    const snap = await getDocs(q);
    const items = snap.docs
      .map((d) => mapSimulationDoc(d.id, d.data()))
      .filter((s) => allowedSubjects.has(s.subjectId));
    return sortByNewest(items);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveCurriculumSimulation(
  input: CurriculumSimulationInput
): Promise<CurriculumSimulation> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('You must be signed in to save simulations.');
  }

  const validationError = validateCurriculumSimulationInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const isUpdate = Boolean(input.id);
  const simulationId = input.id || generateDocId('sim');
  const docPath = `curriculumSimulations/${simulationId}`;
  const docRef = doc(db, 'curriculumSimulations', simulationId);

  const trimmedUrl = input.contentUrl.trim();
  const detectedSourceType: 'url' | 'upload' =
    input.sourceType || (trimmedUrl.startsWith('/uploads/') ? 'upload' : 'url');

  try {
    if (isUpdate) {
      const updatePayload: Record<string, any> = {
        subjectId: input.subjectId.trim(),
        chapterId: input.chapterId.trim(),
        topicId: input.topicId.trim(),
        title: input.title.trim().slice(0, 200),
        description: input.description.trim().slice(0, 2000),
        category: (input.category || 'General').trim().slice(0, 100),
        contentUrl: trimmedUrl.slice(0, 2048),
        thumbnailUrl: (input.thumbnailUrl || '').trim().slice(0, 2048),
        sourceType: detectedSourceType,
        instructions: (input.instructions || '').trim().slice(0, 2000),
        status: input.status,
        updatedAt: serverTimestamp(),
      };
      if (input.fileName !== undefined) {
        updatePayload.fileName = input.fileName.trim().slice(0, 255);
      }

      await updateDoc(docRef, updatePayload);
      const updatedSnap = await getDoc(docRef);
      return mapSimulationDoc(simulationId, updatedSnap.data() || updatePayload);
    }

    const createPayload: Record<string, any> = {
      id: simulationId,
      teacherId: currentUser.uid,
      subjectId: input.subjectId.trim(),
      chapterId: input.chapterId.trim(),
      topicId: input.topicId.trim(),
      title: input.title.trim().slice(0, 200),
      description: input.description.trim().slice(0, 2000),
      category: (input.category || 'General').trim().slice(0, 100),
      contentUrl: trimmedUrl.slice(0, 2048),
      thumbnailUrl: (input.thumbnailUrl || '').trim().slice(0, 2048),
      sourceType: detectedSourceType,
      instructions: (input.instructions || '').trim().slice(0, 2000),
      status: input.status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (input.fileName?.trim()) {
      createPayload.fileName = input.fileName.trim().slice(0, 255);
    }

    await setDoc(docRef, createPayload);
    const createdSnap = await getDoc(docRef);
    return mapSimulationDoc(simulationId, createdSnap.data() || createPayload);
  } catch (error) {
    handleFirestoreError(error, isUpdate ? OperationType.UPDATE : OperationType.CREATE, docPath);
  }
}

export async function updateCurriculumSimulationStatus(
  simulationId: string,
  status: CurriculumMediaStatus
): Promise<void> {
  const docPath = `curriculumSimulations/${simulationId}`;
  try {
    await updateDoc(doc(db, 'curriculumSimulations', simulationId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function deleteCurriculumSimulation(simulationId: string): Promise<void> {
  const docPath = `curriculumSimulations/${simulationId}`;
  try {
    await deleteDoc(doc(db, 'curriculumSimulations', simulationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// =========================================================================
// STUDENT VIDEO WATCH PROGRESS (Cloud Firestore: /videoProgress/{uid}_{videoId})
// =========================================================================

export async function getStudentVideoProgress(
  uid: string,
  videoId: string
): Promise<StudentVideoProgressRecord | null> {
  if (!uid || !videoId) return null;
  const progressId = `${uid}_${videoId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const docPath = `videoProgress/${progressId}`;
  try {
    const snap = await getDoc(doc(db, 'videoProgress', progressId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      id: snap.id,
      uid: String(data.uid || uid),
      videoId: String(data.videoId || videoId),
      subjectId: String(data.subjectId || ''),
      topicId: String(data.topicId || ''),
      watchedSeconds: Number(data.watchedSeconds || 0),
      durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : undefined,
      completionPercent: Number(data.completionPercent || 0),
      completed: Boolean(data.completed),
      updatedAt: timestampToIso(data.updatedAt),
    };
  } catch (error) {
    console.warn('Unable to load video progress from Firestore:', error);
    return null;
  }
}

export async function saveStudentVideoProgress(params: {
  videoId: string;
  subjectId: string;
  topicId: string;
  watchedSeconds: number;
  durationSeconds?: number;
  completionPercent: number;
}): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !params.videoId || !params.subjectId || !params.topicId) return;

  const progressId = `${currentUser.uid}_${params.videoId}`
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  const docPath = `videoProgress/${progressId}`;
  const safePercent = Math.max(0, Math.min(100, Math.round(params.completionPercent)));
  const safeWatched = Math.max(0, Math.min(86400, Math.round(params.watchedSeconds)));

  try {
    const payload: Record<string, any> = {
      id: progressId,
      uid: currentUser.uid,
      videoId: params.videoId,
      subjectId: params.subjectId,
      topicId: params.topicId,
      watchedSeconds: safeWatched,
      completionPercent: safePercent,
      completed: safePercent >= 85,
      updatedAt: serverTimestamp(),
    };
    if (typeof params.durationSeconds === 'number' && params.durationSeconds > 0) {
      payload.durationSeconds = Math.min(86400, Math.round(params.durationSeconds));
    }

    await setDoc(doc(db, 'videoProgress', progressId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}
