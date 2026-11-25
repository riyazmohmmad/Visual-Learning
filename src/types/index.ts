export type UserRole = 'student' | 'teacher' | 'admin' | 'super_admin' | 'sub_admin';

export type SubAdminPermission =
  | 'manage_students'
  | 'manage_teachers'
  | 'manage_subjects_classes'
  | 'manage_content'
  | 'manage_live_classes'
  | 'view_analytics';

export interface StudentClassMembership {
  id: string;
  name: string;
  section?: string;
  class_code: string;
  teacher_name?: string;
  joined_at: string;
}

export interface TeacherClassSummary {
  id: string;
  name: string;
  section?: string;
  class_code: string;
  enrolledStudents: number;
}

export interface User {
  id: string;
  uid?: string;
  name: string;
  fullName?: string;
  email: string;
  role: UserRole;
  institution?: string;
  status?: 'active' | 'disabled';
  accountStatus?: 'active' | 'disabled';
  profileCompleted?: boolean;
  permissions?: SubAdminPermission[];
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
  created_at?: string;
  createdAt?: string;
  updatedAt?: string;
  last_login_at?: string;
  identitySource?: 'firebase' | 'backend';
  // Admin-enriched student fields
  enrollmentsCount?: number;
  enrolledClasses?: StudentClassMembership[];
  enrollmentStatus?: 'Enrolled' | 'Not Enrolled';
  // Admin-enriched teacher fields
  teachingClassesCount?: number;
  teachingClasses?: TeacherClassSummary[];
  enrolledStudentsCount?: number;
}

export interface AdminOverviewStats {
  totalUsers: number;
  totalStudents: number;
  totalTeachers: number;
  totalSuperAdmins: number;
  totalAdmins?: number;
  totalSubAdmins: number;
  maxSubAdmins: number;
  subAdminsAvailable: number;
  activeUsers: number;
  activeAccounts?: number;
  disabledUsers: number;
  suspendedAccounts?: number;
  totalSubjects: number;
  totalClasses?: number;
  totalEnrolledStudents?: number;
  unassignedStudents?: number;
  totalEnrollments: number;
  totalNotes: number;
  totalQuizzes: number;
  activeLiveSessions: number;
  scheduledLiveClasses: number;
}

export interface FirestoreDirectoryAnomaly {
  collection: 'users' | 'admins';
  docId: string;
  email: string;
  rawRole: string;
  reason: string;
}

export interface AdminAuditReport {
  generatedAt: string;
  healthy: boolean;
  totalIssues: number;
  summary: {
    syntheticOrTestCount: number;
    duplicateEmailCount: number;
    invalidOrMissingRoleCount: number;
    orphanedEnrollmentsCount: number;
    unlinkedClassTeachersCount: number;
    backendOnlyUsersCount: number;
  };
  syntheticOrTestRecords: {
    id: string;
    name: string;
    email: string;
    role: string;
    reason: string;
  }[];
  duplicateEmailRecords: {
    email: string;
    keptId: string;
    duplicateId: string;
    duplicateRole: string;
    reason: string;
  }[];
  invalidOrMissingRoleRecords: {
    id: string;
    name: string;
    email: string;
    rawRole: string;
    reason: string;
  }[];
  orphanedEnrollments: {
    enrollmentId: string;
    studentId: string;
    subjectId: string;
    reason: string;
  }[];
  unlinkedClassTeachers: {
    subjectId: string;
    subjectName: string;
    teacherId: string;
    teacherName?: string;
    reason: string;
  }[];
  backendOnlyRecords: {
    id: string;
    name: string;
    email: string;
    role: string;
    reason: string;
  }[];
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

export interface SecuritySetupStatus {
  adminSetupCompleted: boolean;
  temporaryCredentials: boolean;
  currentEmail: string;
  pendingNewEmail?: string | null;
  emailVerificationPending: boolean;
  emailVerified: boolean;
  passwordChanged: boolean;
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
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'starting_soon' | 'live_now' | 'ended' | 'cancelled';
  active_room_id?: string;
  started_at?: string;
  ended_at?: string;
  created_at: string;
}

export interface LiveParticipant {
  id?: string;
  live_class_id?: string;
  user_id?: string;
  user_name?: string;
  userId: string;
  userName: string;
  role: 'teacher' | 'student';
  joined_at: string;
  left_at?: string;
  isMuted?: boolean;
  isCamOff?: boolean;
  hasRaisedHand?: boolean;
  isScreenSharing?: boolean;
}

export interface LiveChatMessage {
  id: string;
  live_class_id: string;
  user_id: string;
  user_name: string;
  role: 'teacher' | 'student';
  message: string;
  timestamp: string;
}

export interface Subject {
  id: string;
  name: string;
  code?: string;
  description: string;
  teacher_id?: string;
  teacher_name?: string;
  section?: string;
  class_code?: string;
  status?: 'active' | 'archived' | 'disabled' | 'draft' | 'published';
  iconName: string;
  color: string;
  thumbnail: string;
  totalChapters?: number;
  totalTopics?: number;
  totalSubtopics?: number;
  totalNotes?: number;
  totalVideos?: number;
  totalQuizzes?: number;
  totalAssignments?: number;
  progress?: number;
  totalStudents?: number;
  enrolledStudentCount?: number;
  enrolledStudents?: {
    id: string;
    name: string;
    email: string;
    institution?: string;
    joined_at: string;
  }[];
  recentActivity?: {
    id: string;
    type: 'chapter' | 'note' | 'video' | 'quiz' | 'assignment';
    title: string;
    subtitle: string;
    created_at: string;
  }[];
  live_session?: LiveSession;
  created_at?: string;
}

export interface Enrollment {
  id: string;
  student_id: string;
  subject_id: string;
  joined_at: string;
}

export interface Topic {
  id: string;
  chapter_id: string;
  subject_id?: string;
  title: string;
  description: string;
  order: number;
  subtopics?: Subtopic[];
  status?: 'draft' | 'published';
  created_at?: string;
}

export interface Chapter {
  id: string;
  subject_id: string;
  title: string;
  description: string;
  order: number;
  thumbnail?: string;
  topics?: Topic[];
  subtopics?: Subtopic[];
  progress?: number;
  status?: 'draft' | 'published';
  created_at?: string;
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
  notes?: any;
  video?: any;
  quiz?: any;
  hasVideo?: boolean;
  hasAnimation?: boolean;
  hasNotes?: boolean;
  hasQuiz?: boolean;
  completed?: boolean;
  videoProgress?: number;
  quizScore?: number;
  quizPassed?: boolean;
  status?: 'draft' | 'published';
  created_at?: string;
}

export interface ExplanationContent {
  title: string;
  summary: string;
  keyPoints: string[];
  deepDive: string;
  formulaOrConcept?: string;
}

export interface VideoContent {
  title: string;
  video_url: string;
  video_type: 'embedded' | 'uploaded' | 'youtube';
  duration_seconds: number;
  description: string;
  thumbnail?: string;
}

export interface AnimationContent {
  title: string;
  animation_type: 'none' | 'mitochondria_atp' | 'newton_second_law' | 'linear_graph' | 'cell_structure' | 'quadratic_parabola' | 'custom_svg';
  interactive_config: any;
  description: string;
  guide_steps: string[];
}

export interface LearningContent {
  id: string;
  subtopic_id: string;
  explanation: ExplanationContent;
  video: VideoContent;
  animation: AnimationContent;
}

export interface NotePage {
  pageNumber: number;
  title: string;
  content: string[];
  diagramLabel?: string;
}

export interface NoteDocument {
  id: string;
  teacher_id: string;
  teacher_name: string;
  subject_id: string;
  chapter_id: string;
  subtopic_id: string;
  title: string;
  description: string;
  file_name: string;
  file_size: string;
  file_url?: string;
  storage_path?: string;
  pages_count: number;
  pages: NotePage[];
  created_at: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  question_type: 'multiple_choice' | 'true_false' | 'short_answer';
  options?: string[];
  correct_answer: string;
  explanation: string;
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
  subtopic_id: string;
  video_progress: number;
  video_last_seconds: number;
  notes_viewed: boolean;
  interactive_explored: boolean;
  quiz_score?: number;
  quiz_total?: number;
  quiz_passed?: boolean;
  completed: boolean;
  last_activity_at: string;
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

export interface StudentAnalyticsData {
  overall_progress: number;
  subjects_progress: {
    subject_id: string;
    subject_name: string;
    progress: number;
    completed_subtopics: number;
    total_subtopics: number;
    chapter_count: number;
  }[];
  chapters_mastery: {
    chapter_id: string;
    chapter_title: string;
    subject_id: string;
    subject_name: string;
    mastery_percentage: number;
    status: 'Needs Attention' | 'Developing' | 'Good Progress' | 'Mastered';
    subtopics_completed: number;
    total_subtopics: number;
    avg_quiz_score: number;
  }[];
  video_analytics: {
    videos_completed: number;
    total_videos: number;
    overall_completion_percentage: number;
    total_watch_time_seconds: number;
    recent_videos: {
      material_id: string;
      title: string;
      subject_name: string;
      last_position_seconds: number;
      duration_seconds: number;
      completion_percentage: number;
      completed: boolean;
    }[];
  };
  quiz_analytics: {
    average_score: number;
    highest_score: number;
    lowest_score: number;
    total_attempts: number;
    passed_attempts: number;
    recent_quizzes: {
      quiz_id: string;
      quiz_title: string;
      subject_name: string;
      score: number;
      passed: boolean;
      submitted_at: string;
    }[];
  };
  assignment_analytics: {
    total_assignments: number;
    submitted: number;
    graded: number;
    average_marks: number;
  };
  learning_analytics: {
    notes_viewed: number;
    simulations_completed: number;
    study_plans_completed: number;
    active_study_plans: number;
    mastered_topics: string[];
    weak_topics: string[];
  };
}

export interface TeacherClassAnalytics {
  subject_id: string;
  subject_name: string;
  section: string;
  total_students: number;
  average_progress: number;
  average_quiz_score: number;
  assignment_completion_rate: number;
  video_completion_rate: number;
  simulations_completed_count: number;
  chapter_mastery: {
    chapter_id: string;
    chapter_title: string;
    mastery: number;
    status: string;
  }[];
  weak_topics: {
    topic_title: string;
    students_struggling_count: number;
    avg_score: number;
  }[];
  students: {
    student_id: string;
    student_name: string;
    student_email: string;
    progress: number;
    avg_quiz_score: number;
    assignments_submitted: number;
    videos_completed: number;
    simulations_completed: number;
    has_active_smart_study: boolean;
  }[];
}

export interface AdminAnalyticsData {
  total_students: number;
  active_students: number;
  total_teachers: number;
  total_classes: number;
  total_simulations: number;
  total_materials: number;
  average_progress: number;
  average_quiz_score: number;
  video_completion_rate: number;
  assignment_completion_rate: number;
  difficult_chapters: {
    chapter_title: string;
    subject_name: string;
    avg_quiz_score: number;
  }[];
  difficult_topics: {
    topic_title: string;
    subject_name: string;
    avg_quiz_score: number;
  }[];
}

export type AiDetailLevel = 'concise' | 'balanced' | 'detailed';
export type AiLanguageMode = 'auto' | 'english' | 'hinglish';

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  followUpQuestions?: string[];
  modelUsed?: string;
  detailLevel?: AiDetailLevel;
  language?: AiLanguageMode;
  createdAt: string;
}

export interface AiChatSessionSummary {
  id: string;
  title: string;
  subject_id?: string;
  subject_name?: string;
  chapter_title?: string;
  topic_title?: string;
  language: AiLanguageMode;
  detail_level: AiDetailLevel;
  messageCount: number;
  lastMessagePreview: string;
  created_at: string;
  updated_at: string;
}

export interface AiChatSession {
  id: string;
  user_id: string;
  title: string;
  subject_id?: string;
  subject_name?: string;
  chapter_title?: string;
  topic_title?: string;
  language: AiLanguageMode;
  detail_level: AiDetailLevel;
  messages: AiChatMessage[];
  created_at: string;
  updated_at: string;
}
