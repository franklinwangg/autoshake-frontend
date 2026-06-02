export const HANDSHAKE_DOMAIN = "handshake.com";
export const HANDSHAKE_BASE_URL = "https://app.joinhandshake.com";
export const HANDSHAKE_JOBS_URL = "https://app.joinhandshake.com/stu/jobs";

export const IsLoginUrl = (url: string): boolean =>
	/login|sso|shibboleth|duosecurity|saml/i.test(url);

export const IsJobsPageUrl = (url: string): boolean =>
	url.includes("joinhandshake.com") &&
	(url.includes("/job-search") || url.includes("/stu/jobs"));

// export const API_BASE_URL = "https://autoshake-production.up.railway.app";
export const API_BASE_URL = "https://localhost:8000";

export const API_ENDPOINTS = {
	// Auth
	SIGNUP:  "/auth/signup",
	LOGIN:   "/auth/login",
	LOGOUT:  "/auth/logout",

	// User
	GET_PROFILE:    "/user/profile",
	UPDATE_PROFILE: "/user/profile",

	// Resume (base resume)
	UPLOAD_RESUME:  "/resume/upload",
	GET_RESUME:     "/resume",
	DELETE_RESUME:  "/resume",

	// Jobs
	SUBMIT_JOBS: "/jobs",
	GET_JOBS:    "/jobs",
	GET_JOB:    (jobId: string) => `/jobs/${jobId}`,
	DELETE_JOB: (jobId: string) => `/jobs/${jobId}`,

	// Tailored resume generation
	GENERATE_RESUME:     (jobId: string) => `/jobs/${jobId}/generate`,
	GET_GENERATED_RESUME:(jobId: string) => `/jobs/${jobId}/resume`,
	BATCH_GENERATE: "/generate/batch",

	// Pipeline (internal/dev)
	EXTRACT_SKILLS:           "/extract-skills",
	GENERATE_RESUME_PIPELINE: "/generate-resume",
	GET_TEMPLATES:            "/templates",
	HEALTH:                   "/health",
} as const;
