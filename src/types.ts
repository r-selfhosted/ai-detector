export interface ReviewRequestBody {
  repo_url: string;
  comment_id?: string;
  comment_permalink?: string;
  comment_body?: string;
  comment_claimed_no_ai?: boolean;
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
  category: 'source' | 'documentation' | 'config';
  bytes: number;
  priority: number;
  content: string;
  truncated: boolean;
}

export interface SampleSummary {
  sampled_file_count: number;
  sampled_source_file_count: number;
  reviewable_file_count: number;
  reviewable_source_file_count: number;
  docs_only_sample: boolean;
  sampled_files: string[];
}

export interface ReviewSuccess {
  confidence: number;
  risk_level: 'low' | 'moderate' | 'high';
  review_recommendation: 'skip' | 'review_optional' | 'review_recommended' | 'review_high_priority';
  ai_assistance_likelihood: number;
  disclosed_ai_use: boolean | 'unknown';
  disclosure_evidence: string[];
  findings: string[];
  limitations: string[];
  metadata_signals: MetadataSignals;
  sample_summary: SampleSummary;
  discord_summary: string;
  disclosure: string;
  repo_url: string;
  comment_id?: string;
  comment_permalink?: string;
  comment_body?: string;
  comment_claimed_no_ai?: boolean;
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
  sampleRepository: (repoPath: string) => Promise<RepositorySample>;
  assessWithModel: (input: ModelAssessmentInput) => Promise<ModelAssessment>;
}

export interface RepositorySample {
  files: SampledFile[];
  summary: SampleSummary;
}

export interface ModelAssessmentInput {
  repoUrl: string;
  context: Omit<ReviewRequestBody, 'repo_url'>;
  metadata: MetadataSignals;
  sample: RepositorySample;
}

export interface ModelAssessment {
  confidence: number;
  risk_level: 'low' | 'moderate' | 'high';
  review_recommendation: 'skip' | 'review_optional' | 'review_recommended' | 'review_high_priority';
  ai_assistance_likelihood: number;
  disclosed_ai_use: boolean | 'unknown';
  disclosure_evidence: string[];
  findings: string[];
  limitations: string[];
}
