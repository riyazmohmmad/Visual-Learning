import {
  User,
  Subject,
  Chapter,
  Topic,
  Subtopic,
  NoteDocument,
  MaterialItem,
  Quiz,
  QuizSubmission,
  Assignment,
  AssignmentSubmission,
  LearningContent,
  StudentProgress,
  SystemSettings,
  SubAdminPermission,
  UserRole,
  SecuritySetupStatus,
  DoubtItem,
  DoubtReply,
  SimulationItem,
  SimulationProgressItem,
  SmartStudyPlan,
  SmartStudyStep,
  VideoProgressItem,
  MaterialAccessLog,
  StudentAnalyticsData,
  TeacherClassAnalytics,
  AdminAnalyticsData,
  AdminOverviewStats,
  AdminAuditReport,
  AiDetailLevel,
  AiLanguageMode,
  AiChatMessage,
  AiChatSession,
  AiChatSessionSummary,
} from '../types';

const TOKEN_KEY = 'visualearn_auth_token';

let unauthorizedHandler: (() => Promise<boolean>) | null = null;
let firebaseTokenProvider: (() => Promise<string | null>) | null = null;
let pendingRefreshPromise: Promise<boolean> | null = null;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const api = {
  setUnauthorizedHandler(handler: (() => Promise<boolean>) | null) {
    unauthorizedHandler = handler;
  },

  setFirebaseTokenProvider(provider: (() => Promise<string | null>) | null) {
    firebaseTokenProvider = provider;
  },

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },

  removeToken() {
    localStorage.removeItem(TOKEN_KEY);
  },

  async request<T>(endpoint: string, options: RequestInit = {}, allowAuthRetry = true): Promise<T> {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const method = (options.method || 'GET').toUpperCase();
    const isRetryableMethod = method === 'GET' || method === 'HEAD';
    const maxNetworkRetries = isFormData ? 0 : 2;
    const retryDelays = [500, 1200];

    const resolveAuthToken = async (): Promise<string | null> => {
      const storedToken = this.getToken();
      if (storedToken) return storedToken;
      if (firebaseTokenProvider && !endpoint.startsWith('/auth/')) {
        try {
          return await firebaseTokenProvider();
        } catch {
          return null;
        }
      }
      return null;
    };

    const buildHeaders = async () => {
      const token = await resolveAuthToken();
      const headers: Record<string, string> = {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers as Record<string, string>),
      };
      if (token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      return headers;
    };

    let response: Response | null = null;
    for (let attempt = 0; attempt <= maxNetworkRetries; attempt++) {
      try {
        const headers = await buildHeaders();
        response = await fetch(`/api${endpoint}`, {
          ...options,
          headers,
        });

        // Retry transient proxy/gateway errors (e.g., during server wake-up or restart) on safe reads
        if (
          isRetryableMethod &&
          (response.status === 502 || response.status === 503 || response.status === 504) &&
          attempt < maxNetworkRetries
        ) {
          await delay(retryDelays[attempt] ?? 1000);
          continue;
        }
        break;
      } catch {
        if (attempt < maxNetworkRetries) {
          await delay(retryDelays[attempt] ?? 1000);
          continue;
        }
        throw new Error('Unable to connect to the server. Please check your internet connection and try again.');
      }
    }

    if (!response) {
      throw new Error('Unable to connect to the server. Please check your internet connection and try again.');
    }

    // If session token expired or was missing while Firebase Auth is active, silently re-sync once and retry
    if (
      response.status === 401 &&
      allowAuthRetry &&
      unauthorizedHandler &&
      !endpoint.startsWith('/auth/')
    ) {
      if (!pendingRefreshPromise) {
        pendingRefreshPromise = unauthorizedHandler()
          .catch(() => false)
          .finally(() => {
            pendingRefreshPromise = null;
          });
      }
      const recovered = await pendingRefreshPromise;
      if (recovered) {
        return this.request<T>(endpoint, options, false);
      }
    }

    const rawText = await response.text().catch(() => '');
    let data: any = {};
    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = {};
      }
    }

    if (!response.ok) {
      const serverMessage =
        (typeof data?.error === 'string' && data.error.trim()) ||
        (typeof data?.message === 'string' && data.message.trim()) ||
        '';

      const fallbackMessage =
        response.status === 403
          ? 'Access denied (HTTP 403). Verify that you are signed in with the authorized instructor account for this class.'
          : response.status === 401
          ? 'Your session has expired. Please sign in again.'
          : `Request failed with status ${response.status}`;

      const err = new Error(serverMessage || fallbackMessage) as Error & {
        status?: number;
        code?: string;
      };
      err.status = response.status;
      if (typeof data?.code === 'string') {
        err.code = data.code;
      }
      throw err;
    }

    return data as T;
  },

  // Auth APIs
  async register(body: { name: string; email: string; password: string; confirmPassword: string; role: UserRole; institution?: string }) {
    const res = await this.request<{ message: string; token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    this.setToken(res.token);
    return res;
  },

  async login(body: { email: string; password: string; role?: UserRole }) {
    const res = await this.request<{ message: string; token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    this.setToken(res.token);
    return res;
  },

  async getInitialAdminStatus() {
    return this.request<{
      setupAvailable: boolean;
      initialized: boolean;
      iamRequired?: boolean;
      error?: string;
    }>('/auth/initial-admin-status');
  },

  async completeInitialAdminSetup(body: {
    idToken: string;
    fullName: string;
    institution?: string;
  }) {
    const res = await this.request<{ message: string; token: string; user: User }>(
      '/auth/initial-admin-setup',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
    this.setToken(res.token);
    return res;
  },

  async syncFirebaseSession(body: {
    idToken: string;
    fullName?: string;
    role?: UserRole;
    institution?: string;
    avatar?: string;
    phone?: string;
    dateOfBirth?: string;
    gender?: string;
    bio?: string;
    qualification?: string;
    specialization?: string;
    studentId?: string;
    teacherId?: string;
    accountStatus?: 'active' | 'disabled';
  }) {
    const res = await this.request<{ message: string; token: string; user: User }>('/auth/firebase-sync', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    this.setToken(res.token);
    return res;
  },

  async getCurrentUser() {
    return this.request<{ user: User }>('/auth/me');
  },

  async forgotPassword(email: string) {
    return this.request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  // Dashboard APIs
  async getStudentDashboard() {
    return this.request<{
      student: User;
      continueItem: {
        subjectId: string;
        subjectName: string;
        chapterId: string;
        chapterTitle: string;
        subtopicId: string;
        subtopicTitle: string;
        progress: number;
        lastActivity: string;
      } | null;
      subjects: Subject[];
      stats: {
        chaptersCompleted: number;
        subtopicsCompleted: number;
        totalSubtopics: number;
        videosWatched: number;
        notesStudied: number;
        quizzesCompleted: number;
        averageQuizScore: number;
      };
      recentlyAdded: {
        chapters: any[];
        notes: any[];
        quizzes: any[];
      };
    }>('/student/dashboard');
  },

  async getTeacherDashboard() {
    return this.request<{
      teacher: User;
      metrics: {
        totalSubjects: number;
        totalChapters: number;
        totalSubtopics: number;
        totalVideos: number;
        totalNotes: number;
        totalQuizzes: number;
        totalStudents: number;
        passRate: number;
      };
      recentNotes: any[];
      subjects: Subject[];
      chapters: Chapter[];
      subtopics: Subtopic[];
    }>('/teacher/dashboard');
  },

  // Subjects, Chapters, Subtopics
  async getSubjects() {
    return this.request<{ subjects: Subject[] }>('/subjects');
  },

  async getSubject(id: string) {
    return this.request<{ subject: Subject; chapters: Chapter[] }>(`/subjects/${id}`);
  },

  async createSubject(data: {
    name: string;
    code?: string;
    description: string;
    section?: string;
    iconName?: string;
    color?: string;
    thumbnail?: string;
    status?: string;
  }) {
    return this.request<{ message: string; subject: Subject; classCode: string }>('/subjects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateSubject(id: string, data: Partial<Subject>) {
    return this.request<{ message: string; subject: Subject }>(`/subjects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteSubject(id: string) {
    return this.request<{ message: string; deletedCounts?: any }>(`/subjects/${id}`, {
      method: 'DELETE',
    });
  },

  async regenerateClassCode(subjectId: string) {
    return this.request<{ message: string; class_code: string; subject: Subject }>(`/subjects/${subjectId}/regenerate-code`, {
      method: 'POST',
    });
  },

  async getChapter(id: string) {
    return this.request<{ chapter: Chapter; subject: Subject; topics?: Topic[]; subtopics: Subtopic[]; progress: number }>(`/chapters/${id}`);
  },

  async createChapter(data: { subject_id: string; title: string; description: string; order?: number; status?: string }) {
    return this.request<{ message: string; chapter: Chapter }>('/chapters', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateChapter(id: string, data: Partial<Chapter>) {
    return this.request<{ message: string; chapter: Chapter }>(`/chapters/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteChapter(id: string) {
    return this.request<{ message: string; deletedTopics?: number; deletedSubtopics?: number }>(`/chapters/${id}`, {
      method: 'DELETE',
    });
  },

  async reorderChapters(subject_id: string, chapter_orders: { id: string; order: number }[]) {
    return this.request<{ message: string }>('/chapters/reorder', {
      method: 'POST',
      body: JSON.stringify({ subject_id, chapter_orders }),
    });
  },

  // Topic APIs (Requirement #6)
  async createTopic(data: { chapter_id: string; subject_id?: string; title: string; description: string; order?: number; status?: string }) {
    return this.request<{ message: string; topic: Topic }>('/topics', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTopic(id: string, data: Partial<Topic>) {
    return this.request<{ message: string; topic: Topic }>(`/topics/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteTopic(id: string) {
    return this.request<{ message: string; deletedSubtopics?: number }>(`/topics/${id}`, {
      method: 'DELETE',
    });
  },

  async reorderTopics(chapter_id: string, topic_orders: { id: string; order: number }[]) {
    return this.request<{ message: string }>('/topics/reorder', {
      method: 'POST',
      body: JSON.stringify({ chapter_id, topic_orders }),
    });
  },

  // Subtopic APIs (Requirement #7)
  async getSubtopic(id: string) {
    return this.request<{
      subtopic: Subtopic;
      chapter: Chapter;
      subject: Subject;
      content?: LearningContent;
      notes: NoteDocument[];
      quiz?: Quiz;
      progress?: StudentProgress | null;
      navigation: {
        prev: { id: string; title: string; order: number } | null;
        next: { id: string; title: string; order: number } | null;
        total: number;
        current: number;
      };
      serverTime?: string;
    }>(`/subtopics/${id}`);
  },

  async createSubtopic(data: {
    chapter_id: string;
    topic_id?: string;
    title: string;
    description: string;
    learning_objectives: string[];
    estimated_minutes: number;
    order?: number;
    status?: string;
  }) {
    return this.request<{ message: string; subtopic: Subtopic }>('/subtopics', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateSubtopic(id: string, data: Partial<Subtopic>) {
    return this.request<{ message: string; subtopic: Subtopic }>(`/subtopics/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteSubtopic(id: string) {
    return this.request<{ message: string }>(`/subtopics/${id}`, {
      method: 'DELETE',
    });
  },

  async reorderSubtopics(data: { chapter_id?: string; topic_id?: string; subtopic_orders: { id: string; order: number }[] }) {
    return this.request<{ message: string }>('/subtopics/reorder', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Curriculum Tree Hierarchy (Requirement #8)
  async getCurriculum(subjectId: string) {
    return this.request<{
      subject: Subject;
      chapters: {
        id: string;
        subject_id: string;
        title: string;
        description: string;
        order: number;
        status?: string;
        topics: (Topic & {
          subtopics: (Subtopic & {
            notesCount: number;
            materialsCount: number;
            hasQuiz: boolean;
            quizId?: string;
            hasVideo: boolean;
          })[];
        })[];
        unassignedSubtopics?: (Subtopic & {
          notesCount: number;
          materialsCount: number;
          hasQuiz: boolean;
        })[];
        totalSubtopics: number;
      }[];
    }>(`/curriculum/${subjectId}`);
  },

  // Materials APIs (Requirement #9 & #10)
  async getMaterials(params?: { subject_id?: string; chapter_id?: string; topic_id?: string; subtopic_id?: string; type?: string }) {
    const qs = new URLSearchParams(params as Record<string, string> || {}).toString();
    return this.request<{ materials: MaterialItem[] }>(`/materials${qs ? `?${qs}` : ''}`);
  },

  async createMaterial(data: {
    subject_id: string;
    chapter_id?: string;
    topic_id?: string;
    subtopic_id?: string;
    type: 'notes' | 'video' | 'document';
    title: string;
    description?: string;
    file_name?: string;
    file_url?: string;
    file_size?: string;
    pages_content?: any[];
    video_url?: string;
    duration_seconds?: number;
    status?: 'draft' | 'published';
  }) {
    return this.request<{ message: string; material: MaterialItem }>('/materials', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateMaterial(id: string, data: Partial<MaterialItem>) {
    return this.request<{ message: string; material: MaterialItem }>(`/materials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteMaterial(id: string) {
    return this.request<{ message: string }>(`/materials/${id}`, {
      method: 'DELETE',
    });
  },

  async uploadMaterialFile(formData: FormData) {
    return this.request<{ message: string; material: MaterialItem }>('/materials/upload-file', {
      method: 'POST',
      body: formData,
    });
  },

  async uploadNotesFile(formData: FormData) {
    return this.request<{ message: string; note: NoteDocument }>('/notes/upload-file', {
      method: 'POST',
      body: formData,
    });
  },

  async replaceMaterialFile(id: string, formData: FormData) {
    return this.request<{ message: string; material: MaterialItem }>(`/materials/${id}/replace-file`, {
      method: 'PUT',
      body: formData,
    });
  },

  async updateLearningContent(data: {
    subtopic_id: string;
    explanation?: any;
    video?: any;
    animation?: any;
  }) {
    return this.request<{ message: string; content: LearningContent }>('/learning-content', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Notes
  async uploadNotes(data: {
    subject_id: string;
    chapter_id: string;
    subtopic_id: string;
    title: string;
    description: string;
    file_name: string;
    pages_content: any[];
  }) {
    return this.request<{ message: string; note: NoteDocument }>('/notes/upload', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getNote(id: string) {
    return this.request<{ note: NoteDocument; subtopicTitle?: string; chapterTitle?: string; subjectName?: string }>(`/notes/${id}`);
  },

  // Authoritative Server Clock
  async getServerTime() {
    return this.request<{ serverTime: string }>('/time');
  },

  // Quizzes (Scheduling, Timed Attempts & Assessment)
  async getQuizzes(params?: { subject_id?: string; class_id?: string; chapter_id?: string; topic_id?: string; subtopic_id?: string }) {
    const qs = new URLSearchParams(params as Record<string, string> || {}).toString();
    return this.request<{ quizzes: any[]; serverTime?: string }>(`/quizzes${qs ? `?${qs}` : ''}`);
  },

  async getStudentQuizzes() {
    return this.request<{ quizzes: any[]; serverTime?: string }>('/student/quizzes');
  },

  async startQuizAttempt(quizId: string) {
    return this.request<{
      attempt: {
        id: string;
        quiz_id: string;
        student_id: string;
        student_name: string;
        attempt_number: number;
        started_at: string;
        expires_at: string;
        duration_minutes: number;
        status: 'in_progress' | 'submitted' | 'expired';
      };
      quiz: Quiz;
      attemptsUsed: number;
      maxAttempts: number;
      serverTime: string;
    }>(`/quizzes/${quizId}/start`, {
      method: 'POST',
    });
  },

  async createQuiz(data: {
    subtopic_id?: string;
    subject_id?: string;
    chapter_id?: string;
    topic_id?: string;
    class_id?: string;
    title: string;
    description: string;
    passing_score?: number;
    passing_marks?: number;
    marks?: number;
    time_limit?: number;
    max_attempts?: number;
    allow_late_submission?: boolean;
    start_date?: string;
    due_date?: string;
    status?: 'draft' | 'published';
    questions: any[];
  }) {
    return this.request<{ message: string; quiz: Quiz; serverTime?: string }>('/quizzes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateQuiz(id: string, data: Partial<Quiz>) {
    return this.request<{ message: string; quiz: Quiz }>(`/quizzes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteQuiz(id: string) {
    return this.request<{ message: string }>(`/quizzes/${id}`, {
      method: 'DELETE',
    });
  },

  async togglePublishQuiz(id: string) {
    return this.request<{ message: string; status: string; quiz?: Quiz }>(`/quizzes/${id}/publish`, {
      method: 'PATCH',
    });
  },

  async assignQuiz(id: string, class_id: string) {
    return this.request<{ message: string; quiz: Quiz }>(`/quizzes/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ class_id }),
    });
  },

  async getQuizSubmissions(id: string) {
    return this.request<{ submissions: QuizSubmission[] }>(`/quizzes/${id}/submissions`);
  },

  // Assignments (Scheduling, Attachments, File Uploads & Grading)
  async getAssignments(params?: { subject_id?: string; class_id?: string }) {
    const qs = new URLSearchParams(params as Record<string, string> || {}).toString();
    return this.request<{ assignments: any[]; serverTime?: string }>(`/assignments${qs ? `?${qs}` : ''}`);
  },

  async getStudentAssignments() {
    return this.request<{ assignments: any[]; serverTime?: string }>('/student/assignments');
  },

  async uploadAssignmentAttachment(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.request<{ url: string; fileName: string; size: number; formattedSize: string; mimeType: string }>(
      '/uploads/assignment-attachment',
      {
        method: 'POST',
        body: formData,
      }
    );
  },

  async uploadAssignmentSubmissionFile(assignmentId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.request<{ url: string; fileName: string; size: number; formattedSize: string; mimeType: string }>(
      `/assignments/${assignmentId}/upload-submission`,
      {
        method: 'POST',
        body: formData,
      }
    );
  },

  async createAssignment(data: {
    title: string;
    description?: string;
    subject_id: string;
    chapter_id?: string;
    topic_id?: string;
    subtopic_id?: string;
    class_id?: string;
    start_date?: string;
    due_date?: string;
    max_marks?: number;
    allowed_file_types?: string[];
    max_file_size_mb?: number;
    allow_late_submission?: boolean;
    late_penalty_percent?: number;
    attachment_name?: string;
    attachment_url?: string;
    attachment_size?: string;
    status?: 'draft' | 'published';
  }) {
    return this.request<{ message: string; assignment: Assignment; serverTime?: string }>('/assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateAssignment(id: string, data: Partial<Assignment>) {
    return this.request<{ message: string; assignment: Assignment }>(`/assignments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteAssignment(id: string) {
    return this.request<{ message: string }>(`/assignments/${id}`, {
      method: 'DELETE',
    });
  },

  async togglePublishAssignment(id: string) {
    return this.request<{ message: string; status: string; assignment?: Assignment }>(`/assignments/${id}/publish`, {
      method: 'PATCH',
    });
  },

  async getAssignmentSubmissions(id: string) {
    return this.request<{ submissions: AssignmentSubmission[] }>(`/assignments/${id}/submissions`);
  },

  async gradeAssignmentSubmission(id: string, subId: string, data: { marks: number; feedback?: string }) {
    return this.request<{ message: string; submission: AssignmentSubmission }>(`/assignments/${id}/submissions/${subId}/grade`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async submitAssignment(
    id: string,
    data: { submission_text?: string; attachment_name?: string; attachment_url?: string; attachment_size?: string }
  ) {
    return this.request<{ message: string; submission: AssignmentSubmission; serverTime?: string }>(
      `/assignments/${id}/submit`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  },

  // Progress Tracking (Requirement #17 & #18)
  async getTeacherProgress(params?: { subject_id?: string }) {
    const qs = new URLSearchParams(params as Record<string, string> || {}).toString();
    return this.request<{ progressReports: any[] }>(`/teacher/progress${qs ? `?${qs}` : ''}`);
  },

  async getStudentProgress() {
    return this.request<{ overallProgress: number; subjects: any[] }>('/student/progress');
  },

  async submitQuiz(
    quizId: string,
    answers: Record<string, string>,
    options?: { attempt_id?: string; auto_submitted?: boolean }
  ) {
    return this.request<{
      scorePercent: number;
      marksObtained?: number;
      totalMarks?: number;
      passingMarks?: number;
      correctCount: number;
      totalQuestions: number;
      passed: boolean;
      passingScore: number;
      attemptNumber?: number;
      maxAttempts?: number;
      attemptsRemaining?: number;
      autoSubmitted?: boolean;
      isLate?: boolean;
      submittedAt?: string;
      serverTime?: string;
      feedback: {
        questionId: string;
        question: string;
        questionType: string;
        studentAnswer: string;
        correctAnswer: string;
        isCorrect: boolean;
        explanation: string;
      }[];
      recommendations: string[];
    }>(`/quizzes/${quizId}/submit`, {
      method: 'POST',
      body: JSON.stringify({
        answers,
        attempt_id: options?.attempt_id,
        auto_submitted: options?.auto_submitted,
      }),
    });
  },

  // Progress Tracking
  async updateVideoProgress(subtopicId: string, watchedPercent: number, currentTime: number) {
    return this.request<{ message: string; video_progress: number }>('/progress/video', {
      method: 'POST',
      body: JSON.stringify({ subtopic_id: subtopicId, watched_percent: watchedPercent, current_time: currentTime }),
    });
  },

  async recordNotesViewed(subtopicId: string) {
    return this.request<{ message: string }>('/progress/notes', {
      method: 'POST',
      body: JSON.stringify({ subtopic_id: subtopicId }),
    });
  },

  async recordInteractiveExplored(subtopicId: string) {
    return this.request<{ message: string }>('/progress/interactive', {
      method: 'POST',
      body: JSON.stringify({ subtopic_id: subtopicId }),
    });
  },

  // Global Search
  async search(query: string) {
    return this.request<{
      query: string;
      subjects: Subject[];
      chapters: (Chapter & { subjectName?: string })[];
      subtopics: (Subtopic & { chapterTitle?: string; subjectName?: string; subjectId?: string })[];
      notes: (NoteDocument & { subjectName?: string; chapterTitle?: string; subtopicTitle?: string })[];
    }>(`/search?q=${encodeURIComponent(query)}`);
  },

  // Class Enrollment & Verification (Requirements #3, #4, #10, #11)
  async verifyClassCode(code: string) {
    return this.request<{
      valid: boolean;
      alreadyEnrolled: boolean;
      class: {
        id: string;
        name: string;
        code?: string;
        classCode?: string;
        teacherId?: string;
        teacherName: string;
        section: string;
        description: string;
      };
    }>('/classes/verify-code', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  async joinClass(code: string) {
    return this.request<{
      message: string;
      alreadyEnrolled: boolean;
      classId: string;
      enrollmentId?: string;
      subject: {
        id: string;
        name: string;
        code?: string;
        classCode?: string;
        teacherId?: string;
        teacherName: string;
        section?: string;
        description?: string;
      };
    }>('/classes/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  async syncEnrollmentsFromFirestore(payload: {
    enrollments: Array<{
      id?: string;
      studentId: string;
      classId: string;
      teacherId: string;
      classCode?: string;
      className?: string;
      section?: string;
      teacherName?: string;
      studentName?: string;
      studentEmail?: string;
      status: 'active' | 'removed';
      enrolledAt?: string;
    }>;
    classes?: Array<{
      id: string;
      name: string;
      code?: string;
      description?: string;
      teacherId: string;
      teacherName?: string;
      section?: string;
      classCode: string;
      status?: string;
      iconName?: string;
      color?: string;
      thumbnail?: string;
      createdAt?: string;
    }>;
  }) {
    return this.request<{
      synced: boolean;
      addedClasses: number;
      updatedClasses: number;
      addedEnrollments: number;
      activeEnrolledClassIds?: string[];
    }>('/classes/sync-enrollments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async removeStudentFromSubject(subjectId: string, studentId: string) {
    return this.request<{ message: string }>(`/subjects/${subjectId}/enrollments/${studentId}`, {
      method: 'DELETE',
    });
  },

  // Live Class Sessions (Requirement #1, #2, #5, #8, #14, #16)
  async startLiveClass(classId: string, sessionTitle?: string, description?: string) {
    return this.request<{
      message: string;
      live_session: any;
      classId: string;
      sessionId: string;
      roomId: string;
      class: any;
    }>(`/classes/${classId}/live/start`, {
      method: 'POST',
      body: JSON.stringify({ session_title: sessionTitle, description }),
    });
  },

  async endLiveClass(classId: string) {
    return this.request<{ message: string }>(`/classes/${classId}/live/end`, {
      method: 'POST',
    });
  },

  async joinLiveClass(classId: string) {
    return this.request<{
      live_session: any;
      sessionId: string;
      roomId: string;
      class: any;
    }>(`/classes/${classId}/live/join`);
  },

  async scheduleLiveClass(data: {
    class_id: string;
    title: string;
    scheduled_date: string;
    start_time: string;
    end_time?: string;
    description?: string;
  }) {
    return this.request<{ message: string; liveClass: any }>('/classes/schedule-live', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getLiveClasses() {
    return this.request<{ liveClasses: any[] }>('/classes/live/all');
  },

  // ==========================================
  // Admin Management APIs
  // ==========================================
  async getAdminOverview() {
    return this.request<{
      stats: AdminOverviewStats;
      settings: SystemSettings;
      subAdmins: User[];
      recentUsers: User[];
      auditSummary?: AdminAuditReport['summary'] & { healthy: boolean; totalIssues: number };
    }>('/admin/overview');
  },

  async getAdminAudit() {
    return this.request<{ audit: AdminAuditReport }>('/admin/audit');
  },

  async syncFirestoreUsers(payload: {
    users: {
      uid: string;
      fullName?: string;
      email: string;
      role?: string;
      accountStatus?: string;
      institution?: string;
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
      permissions?: string[];
      createdAt?: string;
      updatedAt?: string;
      lastLoginAt?: string;
    }[];
    admins?: {
      uid: string;
      email: string;
      role: string;
      status?: string;
      permissions?: string[];
      createdAt?: string;
      updatedAt?: string;
    }[];
  }) {
    return this.request<{
      message: string;
      syncedCount: number;
      createdCount: number;
      reboundIdsCount: number;
      flaggedCount: number;
      stats: AdminOverviewStats;
    }>('/admin/sync-firestore-users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getAdminUsers(params: { role?: string; status?: string; search?: string } = {}) {
    const query = new URLSearchParams();
    if (params.role) query.set('role', params.role);
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<{ users: User[]; total: number; stats?: AdminOverviewStats }>(`/admin/users${qs}`);
  },

  async createAdminUser(data: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    institution?: string;
    permissions?: SubAdminPermission[];
  }) {
    return this.request<{ message: string; firebaseLimitationNotice?: string; user: User }>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateAdminUser(
    id: string,
    data: {
      name?: string;
      email?: string;
      role?: UserRole;
      institution?: string;
      status?: 'active' | 'disabled';
      permissions?: SubAdminPermission[];
      password?: string;
    }
  ) {
    return this.request<{ message: string; user: User }>(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async toggleUserStatus(id: string, status: 'active' | 'disabled') {
    return this.request<{ message: string; user: User }>(`/admin/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  async deleteAdminUser(id: string) {
    return this.request<{ message: string; firebaseLimitationNotice?: string }>(`/admin/users/${id}`, {
      method: 'DELETE',
    });
  },

  async resetUserPassword(id: string, newPassword: string) {
    return this.request<{ message: string }>(`/admin/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    });
  },

  async getAdminSubjects() {
    return this.request<{
      subjects: (Subject & {
        teacher_name: string;
        teacher_email?: string;
        enrolledStudents: number;
        chaptersCount: number;
        notesCount: number;
        isLiveNow: boolean;
      })[];
    }>('/admin/subjects');
  },

  async createAdminSubject(data: {
    name: string;
    description: string;
    teacher_id?: string;
    section?: string;
    color?: string;
    iconName?: string;
  }) {
    return this.request<{ message: string; subject: Subject }>('/admin/subjects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateAdminSubject(
    id: string,
    data: {
      name?: string;
      description?: string;
      teacher_id?: string;
      section?: string;
      status?: 'active' | 'archived' | 'disabled';
      color?: string;
      iconName?: string;
      class_code?: string;
    }
  ) {
    return this.request<{ message: string; subject: Subject }>(`/admin/subjects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteAdminSubject(id: string) {
    return this.request<{ message: string }>(`/admin/subjects/${id}`, {
      method: 'DELETE',
    });
  },

  async regenerateAdminClassCode(id: string) {
    return this.request<{ message: string; class_code: string }>(`/admin/subjects/${id}/regenerate-code`, {
      method: 'POST',
    });
  },

  async getSubjectEnrollments(subjectId: string) {
    return this.request<{ enrolled: User[]; available: User[] }>(`/admin/subjects/${subjectId}/enrollments`);
  },

  async enrollStudent(subjectId: string, studentId: string) {
    return this.request<{ message: string }>(`/admin/subjects/${subjectId}/enrollments`, {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId }),
    });
  },

  async unenrollStudent(subjectId: string, studentId: string) {
    return this.request<{ message: string }>(`/admin/subjects/${subjectId}/enrollments/${studentId}`, {
      method: 'DELETE',
    });
  },

  async getAdminLiveClasses() {
    return this.request<{ liveClasses: any[] }>('/admin/live-classes');
  },

  async endLiveClassAdmin(id: string) {
    return this.request<{ message: string; liveClass: any }>(`/admin/live-classes/${id}/end`, {
      method: 'POST',
    });
  },

  async deleteLiveClassAdmin(id: string) {
    return this.request<{ message: string }>(`/admin/live-classes/${id}`, {
      method: 'DELETE',
    });
  },

  async getAdminNotes() {
    return this.request<{ notes: (NoteDocument & { subjectName: string; chapterTitle: string })[] }>('/admin/content/notes');
  },

  async deleteAdminNote(id: string) {
    return this.request<{ message: string }>(`/admin/content/notes/${id}`, {
      method: 'DELETE',
    });
  },

  async getAdminQuizzes() {
    return this.request<{ quizzes: (Quiz & { questionsCount: number; subtopicTitle?: string; subjectName?: string })[] }>('/admin/content/quizzes');
  },

  async deleteAdminQuiz(id: string) {
    return this.request<{ message: string }>(`/admin/content/quizzes/${id}`, {
      method: 'DELETE',
    });
  },

  async getAdminSettings() {
    return this.request<{ settings: SystemSettings }>('/admin/settings');
  },

  async updateAdminSettings(settings: Partial<SystemSettings>) {
    return this.request<{ message: string; settings: SystemSettings }>('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  // Authenticated Admin Account & Security Management
  async getAdminAccount() {
    return this.request<{
      id: string;
      name: string;
      email: string;
      role: string;
      pendingNewEmail: string | null;
      hasPendingEmailVerification: boolean;
      passwordChangedAt: string | null;
    }>('/admin/account');
  },

  async requestAdminEmailChange(body: { currentPassword: string; newEmail: string }) {
    return this.request<{ success: boolean; message: string; pendingEmail: string; expiresInMinutes: number }>('/admin/account/request-email-change', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async verifyAdminEmailChange(verificationCode: string) {
    const res = await this.request<{ success: boolean; message: string; email: string; token: string; user: User }>('/admin/account/verify-email-change', {
      method: 'POST',
      body: JSON.stringify({ verificationCode }),
    });
    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  },

  async resendAdminEmailChangeCode() {
    return this.request<{ success: boolean; message: string; pendingEmail: string }>('/admin/account/resend-email-code', {
      method: 'POST',
    });
  },

  async cancelAdminEmailChange() {
    return this.request<{ success: boolean; message: string }>('/admin/account/cancel-email-change', {
      method: 'POST',
    });
  },

  async changeAdminPassword(body: { currentPassword: string; newPassword: string; confirmNewPassword: string }) {
    return this.request<{ success: boolean; message: string; requireRelogin?: boolean }>('/admin/account/change-password', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // First-Time Admin Security Setup
  async getSecuritySetupStatus() {
    return this.request<SecuritySetupStatus>('/admin/security-setup/status');
  },

  async initiateSecuritySetup(body: { newEmail: string; currentPassword: string; newPassword: string; confirmNewPassword: string }) {
    return this.request<{ success: boolean; message: string; pendingEmail: string; expiresInMinutes: number }>('/admin/account/request-email-change', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async resendSecuritySetupCode() {
    return this.request<{ success: boolean; message: string }>('/admin/account/resend-email-code', {
      method: 'POST',
    });
  },

  async completeSecuritySetup(body: { verificationCode: string; currentPassword: string; newPassword: string; confirmNewPassword: string }) {
    return this.request<{ success: boolean; message: string; adminSetupCompleted: boolean }>('/admin/account/verify-email-change', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // User Profile & Settings APIs
  async getProfile() {
    return this.request<{ user: User }>('/profile');
  },

  async updateProfile(data: {
    name?: string;
    phone?: string;
    dateOfBirth?: string;
    gender?: string;
    bio?: string;
    avatar?: string | null;
    qualification?: string;
    specialization?: string;
    institution?: string;
  }) {
    return this.request<{ message: string; user: User }>('/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async requestEmailChange(newEmail: string) {
    return this.request<{ success: boolean; message: string; pendingEmail: string; expiresInMinutes: number }>('/profile/request-email-change', {
      method: 'POST',
      body: JSON.stringify({ newEmail }),
    });
  },

  async verifyEmailChange(verificationCode: string) {
    const res = await this.request<{ success: boolean; message: string; token: string; user: User }>('/profile/verify-email-change', {
      method: 'POST',
      body: JSON.stringify({ verificationCode }),
    });
    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  },

  async resendEmailChangeCode() {
    return this.request<{ success: boolean; message: string; pendingEmail: string }>('/profile/resend-email-code', {
      method: 'POST',
    });
  },

  async cancelEmailChange() {
    return this.request<{ success: boolean; message: string }>('/profile/cancel-email-change', {
      method: 'POST',
    });
  },

  async changePassword(body: { currentPassword: string; newPassword: string; confirmNewPassword: string }) {
    return this.request<{ success: boolean; message: string }>('/profile/change-password', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // Doubts & Academic Inquiries APIs (Requirement #1)
  async getDoubts(params?: { class_id?: string; subject_id?: string; chapter_id?: string; topic_id?: string; status?: string }) {
    const qs = new URLSearchParams((params as Record<string, string>) || {}).toString();
    return this.request<{ doubts: DoubtItem[] }>(`/doubts${qs ? `?${qs}` : ''}`);
  },

  async getDoubt(id: string) {
    return this.request<{ doubt: DoubtItem }>(`/doubts/${id}`);
  },

  async createDoubt(data: {
    subject_id: string;
    chapter_id?: string;
    topic_id?: string;
    subtopic_id?: string;
    title: string;
    description: string;
    attachment_url?: string;
    attachment_name?: string;
  }) {
    return this.request<{ message: string; doubt: DoubtItem }>('/doubts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async replyDoubt(id: string, message: string, attachment?: { url?: string; name?: string }) {
    return this.request<{ message: string; reply: DoubtReply; doubt: DoubtItem }>(`/doubts/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({
        message,
        attachment_url: attachment?.url,
        attachment_name: attachment?.name,
      }),
    });
  },

  async updateDoubtStatus(id: string, status: 'Pending' | 'Answered' | 'Resolved') {
    return this.request<{ message: string; doubt: DoubtItem }>(`/doubts/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  async uploadDoubtAttachment(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.request<{ message: string; file_url: string; file_name: string; file_size: string }>('/doubts/attachment', {
      method: 'POST',
      body: formData,
    });
  },

  async deleteDoubt(id: string) {
    return this.request<{ message: string }>(`/doubts/${id}`, {
      method: 'DELETE',
    });
  },

  async askAiDoubtSolver(payload: {
    question: string;
    subjectName?: string;
    chapterTitle?: string;
    topicTitle?: string;
    detailLevel?: AiDetailLevel;
    language?: AiLanguageMode;
    history?: { role: 'user' | 'assistant'; text: string }[];
  }) {
    return this.request<{
      answer: {
        content: string;
        followUpQuestions: string[];
        modelUsed: string;
      };
    }>('/ai/doubt-solver', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getAiChats() {
    return this.request<{ sessions: AiChatSessionSummary[] }>('/ai/chats');
  },

  async createAiChat(payload?: {
    subject_id?: string;
    subject_name?: string;
    chapter_title?: string;
    topic_title?: string;
    language?: AiLanguageMode;
    detail_level?: AiDetailLevel;
  }) {
    return this.request<{ session: AiChatSession }>('/ai/chats', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  },

  async getAiChat(id: string) {
    return this.request<{ session: AiChatSession }>(`/ai/chats/${id}`);
  },

  async sendAiChatMessage(
    id: string,
    payload: {
      question: string;
      subject_id?: string;
      subject_name?: string;
      chapter_title?: string;
      topic_title?: string;
      detail_level?: AiDetailLevel;
      language?: AiLanguageMode;
    }
  ) {
    return this.request<{
      userMessage: AiChatMessage;
      assistantMessage: AiChatMessage;
      session: AiChatSession;
    }>(`/ai/chats/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async clearAiChatMessages(id: string) {
    return this.request<{ session: AiChatSession }>(`/ai/chats/${id}/messages`, {
      method: 'DELETE',
    });
  },

  async deleteAiChat(id: string) {
    return this.request<{ message: string }>(`/ai/chats/${id}`, {
      method: 'DELETE',
    });
  },

  // ==========================================
  // INTERACTIVE SIMULATIONS APIs (Requirement #1)
  // ==========================================
  async getSimulations(params?: { subject_id?: string; category?: string; search?: string }) {
    const qs = new URLSearchParams((params as Record<string, string>) || {}).toString();
    return this.request<{ simulations: SimulationItem[] }>(`/simulations${qs ? `?${qs}` : ''}`);
  },

  async getSimulation(id: string) {
    return this.request<{ simulation: SimulationItem }>(`/simulations/${id}`);
  },

  async createSimulation(data: Partial<SimulationItem>) {
    return this.request<{ message: string; simulation: SimulationItem }>('/simulations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateSimulation(id: string, data: Partial<SimulationItem>) {
    return this.request<{ message: string; simulation: SimulationItem }>(`/simulations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteSimulation(id: string) {
    return this.request<{ message: string }>(`/simulations/${id}`, {
      method: 'DELETE',
    });
  },

  async recordSimulationProgress(simulationId: string, data: { time_spent_seconds?: number; completed?: boolean; parameters?: any }) {
    return this.request<{ message: string; progress: SimulationProgressItem }>(`/simulations/${simulationId}/progress`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getStudentSimulationProgress() {
    return this.request<{ progress: SimulationProgressItem[] }>('/simulations/student/progress');
  },

  // ==========================================
  // FACULTY NOTES SECURITY APIs (Requirement #2)
  // ==========================================
  async getSecureMaterialAccess(materialId: string) {
    return this.request<{
      message: string;
      material: MaterialItem;
      watermark: { studentName: string; studentId: string; subjectName: string };
      fileUrl: string;
    }>(`/materials/${materialId}/secure-access`);
  },

  async requestMaterialDownloadToken(materialId: string) {
    return this.request<{
      token: string;
      expires_in: number;
      download_url: string;
    }>(`/materials/${materialId}/download-token`, {
      method: 'POST',
    });
  },

  async getMaterialAccessLogs(materialId?: string) {
    const qs = materialId ? `?material_id=${materialId}` : '';
    return this.request<{ logs: MaterialAccessLog[] }>(`/materials/access-logs${qs}`);
  },

  // ==========================================
  // SMART STUDY SYSTEM APIs (Requirement #3)
  // ==========================================
  async getSmartStudyPlans(params?: { status?: string; subject_id?: string }) {
    const qs = new URLSearchParams((params as Record<string, string>) || {}).toString();
    return this.request<{ plans: SmartStudyPlan[] }>(`/smart-study/plans${qs ? `?${qs}` : ''}`);
  },

  async getSmartStudyPlan(id: string) {
    return this.request<{ plan: SmartStudyPlan }>(`/smart-study/plans/${id}`);
  },

  async completeSmartStudyStep(planId: string, stepId: string) {
    return this.request<{ message: string; plan: SmartStudyPlan; allCompleted: boolean }>(`/smart-study/plans/${planId}/steps/${stepId}/complete`, {
      method: 'POST',
    });
  },

  async getTeacherSmartStudyOverview() {
    return this.request<{ plans: SmartStudyPlan[] }>('/teacher/smart-study/overview');
  },

  // ==========================================
  // PROGRESS ANALYTICS APIs (Requirement #4, #5, #6)
  // ==========================================
  async recordVideoProgress(data: {
    material_id: string;
    subtopic_id?: string;
    last_position_seconds: number;
    duration_seconds: number;
    completion_percentage: number;
  }) {
    return this.request<{ message: string; videoProgress: VideoProgressItem; overallCompleted: boolean }>('/analytics/video-progress', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getStudentAnalytics(subjectId?: string) {
    const qs = subjectId ? `?subject_id=${subjectId}` : '';
    return this.request<{ analytics: StudentAnalyticsData }>(`/analytics/student${qs}`);
  },

  async getTeacherClassesAnalytics() {
    return this.request<{ classes: TeacherClassAnalytics[] }>('/analytics/teacher/classes');
  },

  async getTeacherStudentAnalytics(studentId: string) {
    return this.request<{ analytics: StudentAnalyticsData; student: User }>(`/analytics/teacher/student/${studentId}`);
  },

  async getAdminAnalytics() {
    return this.request<{ analytics: AdminAnalyticsData }>('/analytics/admin');
  },
};



