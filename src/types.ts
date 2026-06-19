export interface ReviewRequestBody {
  repo_url: string;
  comment_id?: string;
  comment_permalink?: string;
  author?: string;
}

export interface MetadataSignals {
  commit_count: number;
  contributor_count: number;
  activity_span_minutes: number | null;
  first_commit_at: string | null;
  last_commit_at: string | null;
  generic_commit_messages: boolean;
  generic_commit_message_count: number;
  single_session_clustering: boolean;
  few_giant_commits: boolean;
  recent_commit_count: number;
}

export interface SampledFile {
  path: string;
  language: string;
  bytes: number;
  priority: number;
  content: string;
  truncated: boolean;
}

export interface ReviewSuccess {
  confidence: number;
  findings: string[];
  metadata_signals: MetadataSignals;
  disclosure: string;
  repo_url: string;
  comment_id?: string;
  comment_permalink?: string;
  author?: string;
}

export interface ReviewError {
  error: string;
  detail: string;
  repo_url?: string;
  comment_id?: string;
}

export interface Dependencies {
  cloneRepository: (repoUrl: string) => Promise<string>;
  cleanupRepository: (path: string) => Promise<void>;
  analyzeMetadata: (repoPath: string) => Promise<MetadataSignals>;
  sampleRepository: (repoPath: string) => Promise<SampledFile[]>;
  assessWithModel: (input: ModelAssessmentInput) => Promise<ModelAssessment>;
}

export interface ModelAssessmentInput {
  repoUrl: string;
  context: Omit<ReviewRequestBody, 'repo_url'>;
  metadata: MetadataSignals;
  sampledFiles: SampledFile[];
}

export interface ModelAssessment {
  confidence: number;
  findings: string[];
}
