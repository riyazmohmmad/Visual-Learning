import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashPassword } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'visualearn_db.json');

export type UserRole = 'student' | 'teacher' | 'admin' | 'super_admin' | 'sub_admin';

export type SubAdminPermission =
  | 'manage_students'
  | 'manage_teachers'
  | 'manage_subjects_classes'
  | 'manage_content'
  | 'manage_live_classes'
  | 'view_analytics';

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  institution?: string;
  status?: 'active' | 'disabled';
  permissions?: SubAdminPermission[];
  created_at: string;
  last_login_at?: string;
  adminSetupCompleted?: boolean;
  temporaryCredentials?: boolean;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  bio?: string;
  avatar?: string;
  qualification?: string;
  specialization?: string;
  studentId?: string;
  teacherId?: string;
  adminId?: string;
  pendingNewEmail?: string;
  emailVerificationCode?: string;
  emailVerificationExpiresAt?: string;
  emailVerified?: boolean;
  passwordChangedAt?: string;
  securitySetupCompletedAt?: string;
}

export interface SystemSettings {
  allowStudentRegistration: boolean;
  allowTeacherRegistration: boolean;
  requireEmailVerification: boolean;
  maintenanceMode: boolean;
  maxSubAdmins: number;
  siteTitle: string;
  securityNotice?: string;
  adminSetupCompleted: boolean;
}

export interface LiveSession {
  id?: string;
  room_id?: string;
  status?: 'scheduled' | 'live_now' | 'ended' | 'cancelled';
  is_active: boolean;
  session_title: string;
  started_at?: string;
  ended_at?: string;
  room_url?: string;
  teacher_id?: string;
  teacher_name?: string;
}

export interface LiveClass {
  id: string;
  class_id: string; // subject_id
  subject_name?: string;
  section?: string;
  teacher_id: string;
  teacher_name: string;
  title: string;
  description: string;
  scheduled_date: string; // YYYY-MM-DD
  start_time: string; // e.g. "10:00 AM"
  end_time: string; // e.g. "11:00 AM"
  status: 'scheduled' | 'starting_soon' | 'live_now' | 'ended' | 'cancelled';
  active_room_id?: string;
  started_at?: string;
  ended_at?: string;
  created_at: string;
}

export interface LiveParticipant {
  id: string;
  live_class_id: string;
  user_id: string;
  user_name: string;
  role: UserRole;
  joined_at: string;
  left_at?: string;
  isMuted?: boolean;
  isCamOff?: boolean;
  hasRaisedHand?: boolean;
  isScreenSharing?: boolean;
}

export interface Subject {
  id: string;
  name: string;
  code?: string; // e.g. CSE101
  description: string;
  teacher_id: string;
  teacher_name?: string;
  section?: string;
  class_code: string;
  status: 'active' | 'archived' | 'disabled' | 'draft' | 'published';
  iconName: string;
  color: string;
  thumbnail: string;
  live_session?: LiveSession;
  created_at: string;
}

export interface Enrollment {
  id: string;
  student_id: string;
  subject_id: string;
  joined_at: string;
}

export function generateClassCode(subjectName: string, section?: string): string {
  const words = subjectName.trim().split(/\s+/);
  let prefix = '';
  if (words.length >= 2) {
    prefix = (words[0][0] + words[1][0]).toUpperCase();
  } else {
    prefix = subjectName.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'C');
  }
  if (!prefix || prefix.length < 2) prefix = 'CS';

  const sec = (section || 'B21').trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'B21';

  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 5; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `${prefix}-${sec}-${rand}`;
}

export interface Chapter {
  id: string;
  subject_id: string;
  title: string;
  description: string;
  order: number;
  thumbnail?: string;
  status?: 'draft' | 'published';
  created_at: string;
}

export interface Topic {
  id: string;
  chapter_id: string;
  subject_id?: string;
  title: string;
  description: string;
  order: number;
  status?: 'draft' | 'published';
  created_at: string;
}

export interface Subtopic {
  id: string;
  chapter_id: string;
  topic_id?: string;
  title: string;
  description: string;
  learning_objectives: string[];
  estimated_minutes: number;
  order: number;
  status?: 'draft' | 'published';
  created_at: string;
}

export interface LearningContent {
  id: string;
  subtopic_id: string;
  explanation: {
    title: string;
    summary: string;
    keyPoints: string[];
    deepDive: string;
    formulaOrConcept?: string;
  };
  video: {
    title: string;
    video_url: string;
    video_type: 'embedded' | 'uploaded' | 'youtube';
    duration_seconds: number;
    description: string;
    thumbnail?: string;
  };
  animation: {
    title: string;
    animation_type: 'none' | 'mitochondria_atp' | 'newton_second_law' | 'linear_graph' | 'cell_structure' | 'quadratic_parabola' | 'custom_svg';
    interactive_config: any;
    description: string;
    guide_steps: string[];
  };
}

export interface NoteDocument {
  id: string;
  teacher_id: string;
  teacher_name: string;
  subject_id: string;
  chapter_id: string;
  topic_id?: string;
  subtopic_id: string;
  title: string;
  description: string;
  file_name: string;
  file_size: string;
  file_url?: string;
  storage_path?: string;
  pages_count: number;
  pages: {
    pageNumber: number;
    title: string;
    content: string[];
    diagramLabel?: string;
  }[];
  status?: 'draft' | 'published';
  created_at: string;
}

export interface MaterialItem {
  id: string;
  teacher_id: string;
  teacher_name: string;
  subject_id: string;
  chapter_id: string;
  topic_id?: string;
  subtopic_id?: string;
  type: 'notes' | 'video' | 'document';
  title: string;
  description: string;
  file_name?: string;
  file_url?: string;
  file_size?: string;
  storage_path?: string;
  pages_count?: number;
  pages_content?: any[];
  video_url?: string;
  duration_seconds?: number;
  status: 'draft' | 'published';
  created_at: string;
}

export interface DoubtReply {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: 'student' | 'teacher';
  message: string;
  attachment_url?: string;
  attachment_name?: string;
  created_at: string;
}

export interface DoubtItem {
  id: string;
  student_id: string;
  student_name: string;
  student_email?: string;
  student_avatar?: string;
  subject_id: string;
  subject_name: string;
  chapter_id?: string;
  chapter_title?: string;
  topic_id?: string;
  topic_title?: string;
  subtopic_id?: string;
  subtopic_title?: string;
  title: string;
  description: string;
  attachment_url?: string;
  attachment_name?: string;
  status: 'Pending' | 'Answered' | 'Resolved';
  teacher_id?: string;
  teacher_response?: string;
  replies: DoubtReply[];
  created_at: string;
  updated_at: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  question_type: 'multiple_choice' | 'true_false' | 'short_answer';
  options?: string[];
  correct_answer: string;
  explanation: string;
}

export interface Quiz {
  id: string;
  teacher_id?: string;
  teacher_name?: string;
  subject_id?: string;
  chapter_id?: string;
  topic_id?: string;
  subtopic_id?: string;
  class_id?: string;
  title: string;
  description: string;
  passing_score: number;
  passing_marks?: number;
  marks?: number;
  time_limit?: number;
  max_attempts?: number;
  allow_late_submission?: boolean;
  start_date?: string;
  due_date?: string;
  status?: 'draft' | 'published';
  questions: QuizQuestion[];
  created_at?: string;
  updated_at?: string;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  student_id: string;
  student_name: string;
  attempt_number: number;
  started_at: string;
  expires_at: string;
  duration_minutes: number;
  status: 'in_progress' | 'submitted' | 'expired';
  submitted_at?: string;
  auto_submitted?: boolean;
}

export interface QuizSubmission {
  id: string;
  quiz_id: string;
  attempt_id?: string;
  attempt_number?: number;
  student_id: string;
  student_name: string;
  subject_id?: string;
  class_id?: string;
  score: number;
  marks_obtained?: number;
  total_marks: number;
  passed: boolean;
  is_late?: boolean;
  auto_submitted?: boolean;
  started_at?: string;
  answers: Record<string, any>;
  submitted_at: string;
}

export interface Assignment {
  id: string;
  teacher_id: string;
  teacher_name: string;
  subject_id: string;
  chapter_id?: string;
  topic_id?: string;
  subtopic_id?: string;
  class_id?: string;
  title: string;
  description: string;
  start_date?: string;
  due_date?: string;
  max_marks: number;
  allowed_file_types?: string[];
  max_file_size_mb?: number;
  allow_late_submission?: boolean;
  late_penalty_percent?: number;
  attachment_name?: string;
  attachment_url?: string;
  attachment_size?: string;
  status: 'draft' | 'published';
  created_at: string;
  updated_at?: string;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  student_name: string;
  submission_text?: string;
  attachment_url?: string;
  attachment_name?: string;
  attachment_size?: string;
  submitted_at: string;
  is_late?: boolean;
  late_by_minutes?: number;
  late_penalty_percent?: number;
  status: 'submitted' | 'graded';
  marks?: number;
  feedback?: string;
  graded_at?: string;
  graded_by?: string;
}

export interface StudentProgress {
  id: string;
  student_id: string;
  subject_id: string;
  chapter_id: string;
  topic_id?: string;
  subtopic_id: string;
  video_progress: number; // 0 to 100
  video_last_seconds: number;
  notes_viewed: boolean;
  interactive_explored: boolean;
  quiz_score?: number;
  quiz_total?: number;
  quiz_passed?: boolean;
  completed: boolean;
  last_activity_at: string;
}

export interface SimulationItem {
  id: string;
  title: string;
  description: string;
  type: 'physics_projectile' | 'physics_pendulum' | 'physics_motion' | 'coordinate_grapher' | 'cellular_automata' | 'ecosystem_population';
  category: 'Physics' | 'Mathematics' | 'Biology / Scientific';
  subject_id?: string;
  chapter_id?: string;
  topic_id?: string;
  subtopic_id?: string;
  created_by?: string;
  instructions: string;
  default_config: Record<string, any>;
  created_at: string;
}

export interface SimulationProgressItem {
  id: string;
  student_id: string;
  simulation_id: string;
  subject_id?: string;
  time_spent_seconds: number;
  runs_count: number;
  completed: boolean;
  last_parameters?: Record<string, any>;
  last_activity_at: string;
}

export interface SmartStudyStep {
  id: string;
  step_number: number;
  type: 'subtopic_review' | 'notes_reading' | 'video_watch' | 'simulation_explore' | 'practice_review' | 'quiz_retry';
  title: string;
  description: string;
  resource_id?: string;
  resource_type?: 'subtopic' | 'material' | 'simulation' | 'quiz';
  resource_title?: string;
  resource_meta?: Record<string, any>;
  completed: boolean;
  completed_at?: string;
}

export interface SmartStudyPlan {
  id: string;
  student_id: string;
  student_name: string;
  subject_id: string;
  subject_name: string;
  chapter_id?: string;
  chapter_title?: string;
  topic_id?: string;
  topic_title?: string;
  subtopic_id?: string;
  subtopic_title?: string;
  triggered_by_quiz_id?: string;
  triggered_by_quiz_title?: string;
  trigger_score: number;
  trigger_reason: string;
  status: 'not_started' | 'in_progress' | 'completed';
  steps: SmartStudyStep[];
  progress_percentage: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface VideoProgressItem {
  id: string;
  student_id: string;
  material_id: string;
  subtopic_id?: string;
  subject_id?: string;
  last_position_seconds: number;
  duration_seconds: number;
  completion_percentage: number;
  completed: boolean;
  updated_at: string;
}

export interface MaterialAccessLog {
  id: string;
  material_id: string;
  material_title: string;
  user_id: string;
  user_name: string;
  user_role: string;
  action: 'view' | 'download';
  ip?: string;
  timestamp: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  followUpQuestions?: string[];
  modelUsed?: string;
  detailLevel?: 'concise' | 'balanced' | 'detailed';
  language?: 'auto' | 'english' | 'hinglish';
  createdAt: string;
}

export interface AiChatSession {
  id: string;
  user_id: string;
  title: string;
  subject_id?: string;
  subject_name?: string;
  chapter_title?: string;
  topic_title?: string;
  language: 'auto' | 'english' | 'hinglish';
  detail_level: 'concise' | 'balanced' | 'detailed';
  messages: AiChatMessage[];
  created_at: string;
  updated_at: string;
}

export interface DatabaseSchema {
  users: User[];
  subjects: Subject[];
  chapters: Chapter[];
  topics: Topic[];
  subtopics: Subtopic[];
  learningContents: LearningContent[];
  notes: NoteDocument[];
  materials: MaterialItem[];
  quizzes: Quiz[];
  quizAttempts?: QuizAttempt[];
  quizSubmissions: QuizSubmission[];
  assignments: Assignment[];
  assignmentSubmissions: AssignmentSubmission[];
  progress: StudentProgress[];
  enrollments: Enrollment[];
  liveClasses: LiveClass[];
  liveParticipants: LiveParticipant[];
  doubts?: DoubtItem[];
  simulations?: SimulationItem[];
  simulationProgress?: SimulationProgressItem[];
  smartStudyPlans?: SmartStudyPlan[];
  videoProgress?: VideoProgressItem[];
  materialAccessLogs?: MaterialAccessLog[];
  aiChatSessions?: AiChatSession[];
  settings?: SystemSettings;
}

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function getDefaultSimulations(): SimulationItem[] {
  return [];
}

const DEFAULT_SETTINGS: SystemSettings = {
  allowStudentRegistration: true,
  allowTeacherRegistration: true,
  requireEmailVerification: false,
  maintenanceMode: false,
  maxSubAdmins: 4,
  siteTitle: 'VisuaLearn Platform',
  securityNotice: 'Protected by Firebase Authentication & Role-Based Access Control',
  adminSetupCompleted: true,
};

const SUPER_ADMIN_EMAIL = 'riyazmohmmad80@gmail.com';

// Confirmed legacy demo account IDs and emails generated by old seed code.
// Genuine registered users and riyazmohmmad80@gmail.com are NEVER matched here.
const CONFIRMED_DEMO_USER_IDS = new Set([
  'usr_teacher_1',
  'usr_teacher_rahul',
  'usr_student_1',
  'usr_student_new',
  'usr_super_admin',
  'usr_sub_admin_1',
]);

const CONFIRMED_DEMO_EMAILS = new Set([
  'teacher@visualearn.edu',
  'rahul.sharma@visualearn.edu',
  'student@visualearn.edu',
  'newstudent@visualearn.edu',
  'superadmin@visualearn.edu',
  'subadmin1@visualearn.edu',
]);

const CONFIRMED_DEMO_SUBJECT_IDS = new Set([
  'subj_bio',
  'subj_physics',
  'subj_math',
  'subj_cloud_sec',
]);

const CONFIRMED_DEMO_CHAPTER_IDS = new Set([
  'chap_bio_cell',
  'chap_phys_motion',
  'chap_math_algebra',
  'chap_cs_iam',
  'chap_cs_network',
]);

const CONFIRMED_DEMO_TOPIC_IDS = new Set([
  'top_bio_cell_structure',
  'top_bio_organelles',
  'top_phys_kinematics',
  'top_phys_newtons_laws',
  'top_math_linear',
  'top_cs_rbac',
  'top_cs_vpc',
  'top_cs_firewalls',
]);

const CONFIRMED_DEMO_SUBTOPIC_IDS = new Set([
  'sub_bio_intro',
  'sub_bio_structure',
  'sub_bio_membrane',
  'sub_bio_nucleus',
  'sub_bio_mito',
  'sub_bio_ribo',
  'sub_phys_force',
  'sub_phys_motion',
  'sub_phys_newton1',
  'sub_phys_newton2',
  'sub_phys_newton3',
  'sub_phys_friction',
  'sub_math_vars',
  'sub_math_linear',
  'sub_math_quad',
  'sub_math_funcs',
  'sub_cs_least_privilege',
  'sub_cs_network_firewalls',
  'sub_cs_vpc_subnets',
  'sub_cs_sg_firewalls',
]);

const CONFIRMED_DEMO_NOTE_IDS = new Set([
  'note_mito_chen',
  'note_newton2_chen',
  'note_linear_chen',
  'note_cs_least_privilege',
]);

const CONFIRMED_DEMO_MATERIAL_IDS = new Set([
  'mat_bio_notes_1',
  'mat_cs_video_1',
]);

const CONFIRMED_DEMO_QUIZ_IDS = new Set([
  'quiz_bio_mito',
  'quiz_phys_newton2',
  'quiz_math_linear',
  'quiz_cs_least_privilege',
  'quiz_sub_cs_iam_roles',
]);

const CONFIRMED_DEMO_ASSIGNMENT_IDS = new Set([
  'asg_cs_iam_policy',
  'asg_bio_cell_report',
]);

const CONFIRMED_DEMO_DOUBT_IDS = new Set([
  'dbt_bio_1',
  'dbt_cs_1',
]);

function isConfirmedDemoUser(u: any): boolean {
  if (!u || typeof u !== 'object') return false;
  const email = String(u.email || '').trim().toLowerCase();
  if (email === SUPER_ADMIN_EMAIL) return false;
  if (CONFIRMED_DEMO_USER_IDS.has(String(u.id || ''))) return true;
  if (CONFIRMED_DEMO_EMAILS.has(email)) return true;
  if (email.endsWith('@visualearn.edu')) return true;
  return false;
}

/**
 * Surgically removes ONLY confirmed legacy auto-generated demo records
 * while preserving genuine registered users, riyazmohmmad80@gmail.com,
 * and any real teacher/student-created content.
 */
function purgeConfirmedDemoData(parsed: any): DatabaseSchema {
  const rawUsers = Array.isArray(parsed.users) ? parsed.users : [];
  const demoUserIds = new Set<string>(CONFIRMED_DEMO_USER_IDS);
  rawUsers.forEach((u: any) => {
    if (isConfirmedDemoUser(u) && u.id) {
      demoUserIds.add(String(u.id));
    }
  });

  const users: User[] = rawUsers
    .filter((u: any) => !isConfirmedDemoUser(u))
    .map((u: any) => {
      const normalizedEmail = String(u.email || '').trim().toLowerCase();
      const copy = { ...u, status: u.status || 'active' };
      // Never silently reclassify an anomalous super_admin record into 'student'.
      // Authorization checks in auth.ts & adminDataIntegrity.ts reject unauthorized
      // super_admin claims and surface them in the Safe Data Integrity Audit.
      if (copy.role === 'super_admin' && normalizedEmail !== SUPER_ADMIN_EMAIL) {
        copy.adminSetupCompleted = false;
      }
      if (copy.role === 'super_admin' && normalizedEmail === SUPER_ADMIN_EMAIL) {
        copy.adminSetupCompleted = true;
        copy.temporaryCredentials = false;
      }
      return copy;
    });

  const rawSubjects = Array.isArray(parsed.subjects) ? parsed.subjects : [];
  const demoSubjectIds = new Set<string>(CONFIRMED_DEMO_SUBJECT_IDS);
  rawSubjects.forEach((s: any) => {
    if (s && (CONFIRMED_DEMO_SUBJECT_IDS.has(s.id) || demoUserIds.has(s.teacher_id))) {
      demoSubjectIds.add(String(s.id));
    }
  });
  const subjects: Subject[] = rawSubjects
    .filter((s: any) => s && !demoSubjectIds.has(s.id))
    .map((s: any) => ({
      ...s,
      status: s.status || 'active',
      class_code: s.class_code || generateClassCode(s.name || 'CLASS', s.section || 'A1'),
    }));

  const rawChapters = Array.isArray(parsed.chapters) ? parsed.chapters : [];
  const demoChapterIds = new Set<string>(CONFIRMED_DEMO_CHAPTER_IDS);
  rawChapters.forEach((c: any) => {
    if (c && (CONFIRMED_DEMO_CHAPTER_IDS.has(c.id) || demoSubjectIds.has(c.subject_id))) {
      demoChapterIds.add(String(c.id));
    }
  });
  const chapters: Chapter[] = rawChapters.filter((c: any) => c && !demoChapterIds.has(c.id));

  const rawTopics = Array.isArray(parsed.topics) ? parsed.topics : [];
  const demoTopicIds = new Set<string>(CONFIRMED_DEMO_TOPIC_IDS);
  rawTopics.forEach((t: any) => {
    if (
      t &&
      (CONFIRMED_DEMO_TOPIC_IDS.has(t.id) ||
        demoSubjectIds.has(t.subject_id) ||
        demoChapterIds.has(t.chapter_id))
    ) {
      demoTopicIds.add(String(t.id));
    }
  });
  const topics: Topic[] = rawTopics.filter((t: any) => t && !demoTopicIds.has(t.id));

  const rawSubtopics = Array.isArray(parsed.subtopics) ? parsed.subtopics : [];
  const demoSubtopicIds = new Set<string>(CONFIRMED_DEMO_SUBTOPIC_IDS);
  rawSubtopics.forEach((st: any) => {
    if (
      st &&
      (CONFIRMED_DEMO_SUBTOPIC_IDS.has(st.id) ||
        demoChapterIds.has(st.chapter_id) ||
        (st.topic_id && demoTopicIds.has(st.topic_id)))
    ) {
      demoSubtopicIds.add(String(st.id));
    }
  });
  const subtopics: Subtopic[] = rawSubtopics.filter((st: any) => st && !demoSubtopicIds.has(st.id));

  const learningContents: LearningContent[] = (Array.isArray(parsed.learningContents)
    ? parsed.learningContents
    : []
  ).filter((lc: any) => lc && !demoSubtopicIds.has(lc.subtopic_id));

  const notes: NoteDocument[] = (Array.isArray(parsed.notes) ? parsed.notes : []).filter(
    (n: any) =>
      n &&
      !CONFIRMED_DEMO_NOTE_IDS.has(n.id) &&
      !demoUserIds.has(n.teacher_id) &&
      !demoSubjectIds.has(n.subject_id) &&
      !demoChapterIds.has(n.chapter_id) &&
      !demoSubtopicIds.has(n.subtopic_id)
  );

  const materials: MaterialItem[] = (Array.isArray(parsed.materials) ? parsed.materials : []).filter(
    (m: any) =>
      m &&
      !CONFIRMED_DEMO_MATERIAL_IDS.has(m.id) &&
      !demoUserIds.has(m.teacher_id) &&
      !demoSubjectIds.has(m.subject_id) &&
      !demoChapterIds.has(m.chapter_id)
  );

  const rawQuizzes = Array.isArray(parsed.quizzes) ? parsed.quizzes : [];
  const demoQuizIds = new Set<string>(CONFIRMED_DEMO_QUIZ_IDS);
  rawQuizzes.forEach((q: any) => {
    if (
      q &&
      (CONFIRMED_DEMO_QUIZ_IDS.has(q.id) ||
        demoSubjectIds.has(q.subject_id) ||
        demoChapterIds.has(q.chapter_id) ||
        demoSubtopicIds.has(q.subtopic_id) ||
        demoUserIds.has(q.teacher_id))
    ) {
      demoQuizIds.add(String(q.id));
    }
  });
  const quizzes: Quiz[] = rawQuizzes.filter((q: any) => q && !demoQuizIds.has(q.id));

  const quizSubmissions: QuizSubmission[] = (Array.isArray(parsed.quizSubmissions)
    ? parsed.quizSubmissions
    : []
  ).filter(
    (qs: any) =>
      qs &&
      !demoUserIds.has(qs.student_id) &&
      !demoQuizIds.has(qs.quiz_id) &&
      !demoSubjectIds.has(qs.subject_id) &&
      !demoSubjectIds.has(qs.class_id)
  );

  const rawAssignments = Array.isArray(parsed.assignments) ? parsed.assignments : [];
  const demoAssignmentIds = new Set<string>(CONFIRMED_DEMO_ASSIGNMENT_IDS);
  rawAssignments.forEach((a: any) => {
    if (
      a &&
      (CONFIRMED_DEMO_ASSIGNMENT_IDS.has(a.id) ||
        demoUserIds.has(a.teacher_id) ||
        demoSubjectIds.has(a.subject_id) ||
        demoSubjectIds.has(a.class_id))
    ) {
      demoAssignmentIds.add(String(a.id));
    }
  });
  const assignments: Assignment[] = rawAssignments.filter((a: any) => a && !demoAssignmentIds.has(a.id));

  const assignmentSubmissions: AssignmentSubmission[] = (Array.isArray(parsed.assignmentSubmissions)
    ? parsed.assignmentSubmissions
    : []
  ).filter(
    (as: any) =>
      as && !demoUserIds.has(as.student_id) && !demoAssignmentIds.has(as.assignment_id)
  );

  const progress: StudentProgress[] = (Array.isArray(parsed.progress) ? parsed.progress : []).filter(
    (p: any) =>
      p &&
      !demoUserIds.has(p.student_id) &&
      !demoSubjectIds.has(p.subject_id) &&
      !demoChapterIds.has(p.chapter_id) &&
      !demoSubtopicIds.has(p.subtopic_id)
  );

  const enrollments: Enrollment[] = (Array.isArray(parsed.enrollments) ? parsed.enrollments : []).filter(
    (e: any) => e && !demoUserIds.has(e.student_id) && !demoSubjectIds.has(e.subject_id)
  );

  const rawLiveClasses = Array.isArray(parsed.liveClasses) ? parsed.liveClasses : [];
  const demoLiveClassIds = new Set<string>();
  rawLiveClasses.forEach((lc: any) => {
    if (
      lc &&
      (demoUserIds.has(lc.teacher_id) ||
        demoSubjectIds.has(lc.subject_id) ||
        demoSubjectIds.has(lc.class_id))
    ) {
      demoLiveClassIds.add(String(lc.id));
    }
  });
  const liveClasses: LiveClass[] = rawLiveClasses.filter((lc: any) => lc && !demoLiveClassIds.has(lc.id));

  const liveParticipants: LiveParticipant[] = (Array.isArray(parsed.liveParticipants)
    ? parsed.liveParticipants
    : []
  ).filter((lp: any) => lp && !demoUserIds.has(lp.user_id) && !demoLiveClassIds.has(lp.live_class_id));

  const doubts: DoubtItem[] = (Array.isArray(parsed.doubts) ? parsed.doubts : []).filter(
    (d: any) =>
      d &&
      !CONFIRMED_DEMO_DOUBT_IDS.has(d.id) &&
      !demoUserIds.has(d.student_id) &&
      !demoUserIds.has(d.teacher_id) &&
      !demoSubjectIds.has(d.subject_id)
  );

  const simulations: SimulationItem[] = (Array.isArray(parsed.simulations) ? parsed.simulations : []).filter(
    (sim: any) =>
      sim &&
      !demoUserIds.has(sim.teacher_id) &&
      !demoSubjectIds.has(sim.subject_id) &&
      !demoChapterIds.has(sim.chapter_id)
  );

  const simulationProgress: SimulationProgressItem[] = (Array.isArray(parsed.simulationProgress)
    ? parsed.simulationProgress
    : []
  ).filter((sp: any) => sp && !demoUserIds.has(sp.student_id) && !demoSubjectIds.has(sp.subject_id));

  const smartStudyPlans: SmartStudyPlan[] = (Array.isArray(parsed.smartStudyPlans)
    ? parsed.smartStudyPlans
    : []
  ).filter((ssp: any) => ssp && !demoUserIds.has(ssp.student_id) && !demoSubjectIds.has(ssp.subject_id));

  const videoProgress: VideoProgressItem[] = (Array.isArray(parsed.videoProgress)
    ? parsed.videoProgress
    : []
  ).filter((vp: any) => vp && !demoUserIds.has(vp.student_id) && !demoSubjectIds.has(vp.subject_id));

  const materialAccessLogs: MaterialAccessLog[] = (Array.isArray(parsed.materialAccessLogs)
    ? parsed.materialAccessLogs
    : []
  ).filter((mal: any) => mal && !demoUserIds.has(mal.user_id) && !CONFIRMED_DEMO_MATERIAL_IDS.has(mal.material_id));

  const aiChatSessions: AiChatSession[] = (Array.isArray(parsed.aiChatSessions)
    ? parsed.aiChatSessions
    : []
  ).filter((cs: any) => cs && !demoUserIds.has(cs.student_id) && !demoSubjectIds.has(cs.subject_id));

  const settings: SystemSettings = {
    ...DEFAULT_SETTINGS,
    ...(parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {}),
    adminSetupCompleted: true,
  };

  const quizAttempts: QuizAttempt[] = (Array.isArray(parsed.quizAttempts)
    ? parsed.quizAttempts
    : []
  ).filter((qa: any) => qa && !demoUserIds.has(qa.student_id));

  return {
    users,
    subjects,
    chapters,
    topics,
    subtopics,
    learningContents,
    notes,
    materials,
    quizzes,
    quizAttempts,
    quizSubmissions,
    assignments,
    assignmentSubmissions,
    progress,
    enrollments,
    liveClasses,
    liveParticipants,
    doubts,
    simulations,
    simulationProgress,
    smartStudyPlans,
    videoProgress,
    materialAccessLogs,
    aiChatSessions,
    settings,
  };
}

// Clean, completely empty initial database (no auto-generated demo users or sample content)
function getInitialData(): DatabaseSchema {
  return {
    users: [],
    subjects: [],
    chapters: [],
    topics: [],
    subtopics: [],
    learningContents: [],
    notes: [],
    materials: [],
    quizzes: [],
    quizAttempts: [],
    quizSubmissions: [],
    assignments: [],
    assignmentSubmissions: [],
    progress: [],
    enrollments: [],
    liveClasses: [],
    liveParticipants: [],
    doubts: [],
    simulations: [],
    simulationProgress: [],
    smartStudyPlans: [],
    videoProgress: [],
    materialAccessLogs: [],
    aiChatSessions: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const cleaned = purgeConfirmedDemoData(parsed);
          this.save(cleaned);
          return cleaned;
        }
      }
    } catch (err) {
      console.warn('Failed reading db file, initializing clean empty database:', err);
    }
    const initial = getInitialData();
    this.save(initial);
    return initial;
  }

  private save(dataToSave?: DatabaseSchema) {
    const toSave = dataToSave || this.data;
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(toSave, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed saving database:', err);
    }
  }

  public persist() {
    this.save();
  }

  public get users() { return this.data.users; }
  public get subjects() { return this.data.subjects; }
  public get chapters() { return this.data.chapters; }
  public get topics() { this.data.topics = this.data.topics || []; return this.data.topics; }
  public get subtopics() { return this.data.subtopics; }
  public get learningContents() { return this.data.learningContents; }
  public get notes() { return this.data.notes; }
  public get materials() { this.data.materials = this.data.materials || []; return this.data.materials; }
  public get quizzes() { return this.data.quizzes; }
  public get quizAttempts() { this.data.quizAttempts = this.data.quizAttempts || []; return this.data.quizAttempts; }
  public get quizSubmissions() { this.data.quizSubmissions = this.data.quizSubmissions || []; return this.data.quizSubmissions; }
  public get assignments() { this.data.assignments = this.data.assignments || []; return this.data.assignments; }
  public get assignmentSubmissions() { this.data.assignmentSubmissions = this.data.assignmentSubmissions || []; return this.data.assignmentSubmissions; }
  public get progress() { return this.data.progress; }
  public get enrollments() { return this.data.enrollments; }
  public get liveClasses() { return this.data.liveClasses; }
  public get liveParticipants() { return this.data.liveParticipants; }
  public get doubts() { this.data.doubts = this.data.doubts || []; return this.data.doubts; }
  public get simulations() { this.data.simulations = this.data.simulations || []; return this.data.simulations; }
  public get simulationProgress() { this.data.simulationProgress = this.data.simulationProgress || []; return this.data.simulationProgress; }
  public get smartStudyPlans() { this.data.smartStudyPlans = this.data.smartStudyPlans || []; return this.data.smartStudyPlans; }
  public get videoProgress() { this.data.videoProgress = this.data.videoProgress || []; return this.data.videoProgress; }
  public get materialAccessLogs() { this.data.materialAccessLogs = this.data.materialAccessLogs || []; return this.data.materialAccessLogs; }
  public get aiChatSessions() { this.data.aiChatSessions = this.data.aiChatSessions || []; return this.data.aiChatSessions; }
  public get settings(): SystemSettings {
    if (!this.data.settings) {
      this.data.settings = {
        allowStudentRegistration: true,
        allowTeacherRegistration: true,
        requireEmailVerification: false,
        maintenanceMode: false,
        maxSubAdmins: 4,
        siteTitle: 'VisualLearn STEM Platform',
        securityNotice: 'Protected by Enterprise IAM & Role-Based Access Control',
        adminSetupCompleted: true,
      };
    }
    this.data.settings.adminSetupCompleted = true;
    return this.data.settings!;
  }
  public updateSettings(updates: Partial<SystemSettings>): SystemSettings {
    this.data.settings = { ...this.settings, ...updates };
    this.persist();
    return this.data.settings;
  }
}

export const db = new Database();

export function isStudentEnrolled(studentId: string, subjectId: string): boolean {
  return db.enrollments.some((e) => e.student_id === studentId && e.subject_id === subjectId);
}
