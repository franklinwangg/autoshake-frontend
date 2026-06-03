import type { JobRecord, JobData, StorageResult, ResumeResult } from '../types/types';
import { ExtractJobField } from '../utils/popupUtils';
import { IsObject } from './inject';
import { HANDSHAKE_JOBS_URL, API_BASE_URL, API_ENDPOINTS } from '../config/constants';
import { injectCSSVariables } from '../config/styles';

// Compile-time debug flag for GraphQL view
declare const DEBUG_GRAPHQL_VIEW: boolean;

let authMode: "login" | "signup" = "login";
let currentCardIndex = 0;

let welcomeView: HTMLElement | null = null;
let loginView: HTMLElement | null = null;
let launchView: HTMLElement | null = null;
let mainView: HTMLElement | null = null;
let reviewView: HTMLElement | null = null;

const ALL_VIEWS = () => [welcomeView, loginView, launchView, mainView, reviewView];

function ShowStep(step: number): void {
	ALL_VIEWS().forEach(v => {
		if (v) { v.classList.add("hidden"); v.classList.remove("active"); }
	});
	const views: Record<number, HTMLElement | null> = {
		1: welcomeView,
		2: loginView,
		3: launchView,
	};
	const target = views[step];
	if (target) { target.classList.remove("hidden"); target.classList.add("active"); }
	if (typeof chrome !== "undefined" && chrome.storage) {
		chrome.storage.local.set({ currentStep: step });
	}
	if (step === 3) RestoreLaunchState();
}

function ShowLoginView(): void {
	ShowStep(2);
}

function ShowTrackingView(): void {
	ALL_VIEWS().forEach(v => {
		if (v) { v.classList.add("hidden"); v.classList.remove("active"); }
	});
	if (mainView) { mainView.classList.add("active"); mainView.classList.remove("hidden"); }
	chrome.storage.local.set({ currentStep: 4 });
	DisplayTrackedJobs();
	UpdateJobCounter();
}

function ShowReviewView(): void {
	ALL_VIEWS().forEach(v => {
		if (v) { v.classList.add("hidden"); v.classList.remove("active"); }
	});
	if (reviewView) { reviewView.classList.add("active"); reviewView.classList.remove("hidden"); }
	chrome.storage.local.set({ currentStep: 5 });

	chrome.storage.local.get("resumeResults", (result: StorageResult) => {
		currentCardIndex = 0;
		RenderCard(result.resumeResults || []);
	});
}

function RenderCard(results: ResumeResult[]): void {
	const cardEl = document.getElementById("resumeCard");
	const dotsEl = document.getElementById("carouselDots");
	const counterEl = document.getElementById("carouselCounter");
	const prevBtn = document.getElementById("carouselPrev") as HTMLButtonElement | null;
	const nextBtn = document.getElementById("carouselNext") as HTMLButtonElement | null;

	if (!cardEl) return;

	if (results.length === 0) {
		cardEl.innerHTML = `<p class="card-empty">No results to display.</p>`;
		if (counterEl) counterEl.textContent = "";
		if (dotsEl) dotsEl.innerHTML = "";
		return;
	}

	const r = results[currentCardIndex];
	if (counterEl) counterEl.textContent = `${currentCardIndex + 1} of ${results.length}`;

	cardEl.innerHTML = `
		<div class="card-company">${r.company}</div>
		<div class="card-title">${r.title}</div>
		${r.success
			? `<span class="card-badge badge-success">✨ Tailored Successfully</span>`
			: `<span class="card-badge badge-error">Could not tailor resume</span>`
		}
		${r.href ? `<a class="card-job-link" href="${r.href}" target="_blank">View Job Posting →</a>` : ""}
		${r.success && r.pdfBase64
			? `<button class="download-button" id="downloadBtn">⬇ Download PDF</button>`
			: ""
		}
	`;

	if (r.success && r.pdfBase64) {
		document.getElementById("downloadBtn")?.addEventListener("click", () => {
			const binary = atob(r.pdfBase64!);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
			const blob = new Blob([bytes], { type: "application/pdf" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${r.company}_${r.title}_resume.pdf`.replace(/[^a-z0-9_\-]/gi, "_");
			a.click();
			URL.revokeObjectURL(url);
		});
	}

	if (dotsEl) {
		dotsEl.innerHTML = results.map((_, i) =>
			`<span class="dot ${i === currentCardIndex ? "dot-active" : ""}"></span>`
		).join("");
	}

	if (prevBtn) prevBtn.disabled = currentCardIndex === 0;
	if (nextBtn) nextBtn.disabled = currentCardIndex === results.length - 1;
}

function ShowChecklistPanel(): void {
	const authPanel = document.getElementById("authPanel");
	const checklistPanel = document.getElementById("checklistPanel");
	if (authPanel) authPanel.classList.add("hidden");
	if (checklistPanel) { checklistPanel.classList.remove("hidden"); }
}

function SetAuthMode(mode: "login" | "signup"): void {
	authMode = mode;
	const loginTab = document.getElementById("loginTab");
	const signupTab = document.getElementById("signupTab");
	const submitBtn = document.getElementById("authSubmitButton");
	loginTab?.classList.toggle("auth-tab-active", mode === "login");
	signupTab?.classList.toggle("auth-tab-active", mode === "signup");
	if (submitBtn) submitBtn.textContent = mode === "login" ? "Log In" : "Sign Up";
}

async function HandleAuth(): Promise<void> {
	const emailInput = document.getElementById("emailInput") as HTMLInputElement | null;
	const passwordInput = document.getElementById("authPasswordInput") as HTMLInputElement | null;
	const authError = document.getElementById("authError");
	const submitBtn = document.getElementById("authSubmitButton") as HTMLButtonElement | null;

	const email = emailInput?.value.trim() ?? "";
	const password = passwordInput?.value ?? "";

	if (authError) authError.textContent = "";

	if (!email || !password) {
		if (authError) authError.textContent = "Please enter your email and password.";
		return;
	}

	if (submitBtn) submitBtn.disabled = true;

	const endpoint = authMode === "login" ? API_ENDPOINTS.LOGIN : API_ENDPOINTS.SIGNUP;

	try {
		const res = await fetch(API_BASE_URL + endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password }),
		});

		const data = await res.json().catch(() => ({})) as Record<string, unknown>;

		if (!res.ok) {
			if (authError) authError.textContent = (data.message as string) || "Authentication failed.";
			return;
		}

		const token = (data.access_token ?? data.token ?? "") as string;
		chrome.storage.local.set({ username: email, authToken: token }, () => {
			if (emailInput) emailInput.value = "";
			if (passwordInput) passwordInput.value = "";
			FetchAndExtractResume(token);
			ShowChecklistPanel();
		});
	} catch {
		if (authError) authError.textContent = "Network error. Please try again.";
	} finally {
		if (submitBtn) submitBtn.disabled = false;
	}
}

async function FetchAndExtractResume(authToken: string): Promise<void> {
	try {
		const resumeRes = await fetch(API_BASE_URL + API_ENDPOINTS.GET_RESUME, {
			headers: { Authorization: `Bearer ${authToken}` },
		});
		if (!resumeRes.ok) return;

		const resumeData = await resumeRes.json() as { resumes?: Array<{ url: string }> };
		const url = resumeData.resumes?.[0]?.url;
		if (!url) return;

		const extractRes = await fetch(API_BASE_URL + API_ENDPOINTS.EXTRACT_RESUME_TEXT, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${authToken}`,
			},
			body: JSON.stringify({ url }),
		});
		if (!extractRes.ok) return;

		const extractData = await extractRes.json() as { text?: string };
		console.log("[AutoShake] FetchAndExtractResume — extracted text length:", extractData.text?.length ?? 0);
		console.log("[AutoShake] FetchAndExtractResume — extracted text preview:", extractData.text?.slice(0, 200));
		if (!extractData.text) return;

		chrome.storage.local.set({ resumeText: extractData.text });

		const parseRes = await fetch(API_BASE_URL + API_ENDPOINTS.PARSE_RESUME, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${authToken}`,
			},
			body: JSON.stringify({ text: extractData.text }),
		});
		if (!parseRes.ok) return;

		const resumeJson = await parseRes.json() as Record<string, unknown>;
		console.log("[AutoShake] FetchAndExtractResume — parsed resume:", JSON.stringify(resumeJson, null, 2));
		chrome.storage.local.set({ resumeJson });
	} catch {
		// fire-and-forget, silently fail
	}
}

async function HandleResumeUpload(file: File): Promise<void> {
	const uploadError = document.getElementById("uploadError");
	const dropZone = document.getElementById("dropZone");
	const resumeCheckItem = document.getElementById("resumeCheckItem");
	const continueButton = document.getElementById("continueButton") as HTMLButtonElement | null;

	if (uploadError) uploadError.textContent = "";

	if (file.type !== "application/pdf") {
		if (uploadError) uploadError.textContent = "Please upload a PDF file.";
		return;
	}

	if (dropZone) dropZone.innerHTML = `<p class="drop-hint">Uploading...</p>`;

	const { authToken } = await new Promise<StorageResult>(resolve =>
		chrome.storage.local.get(["authToken"], items => resolve(items as StorageResult))
	);

	const formData = new FormData();
	formData.append("file", file);

	try {
		const res = await fetch(API_BASE_URL + API_ENDPOINTS.UPLOAD_RESUME, {
			method: "POST",
			headers: { Authorization: `Bearer ${authToken}` },
			body: formData,
		});

		if (!res.ok) {
			if (uploadError) uploadError.textContent = "Upload failed. Please try again.";
			if (dropZone) dropZone.innerHTML = `<p class="drop-hint">Drag &amp; drop your resume PDF here</p><p class="drop-hint-sub">or <label for="fileInput" class="file-link">browse files</label></p>`;
			return;
		}

		if (dropZone) {
			dropZone.innerHTML = `<p class="upload-success">✓ ${file.name}</p>`;
			dropZone.classList.add("upload-done");
		}
		if (resumeCheckItem) resumeCheckItem.classList.add("checked");
		if (continueButton) continueButton.disabled = false;
	} catch {
		if (uploadError) uploadError.textContent = "Network error. Please try again.";
		if (dropZone) dropZone.innerHTML = `<p class="drop-hint">Drag &amp; drop your resume PDF here</p><p class="drop-hint-sub">or <label for="fileInput" class="file-link">browse files</label></p>`;
	}
}

function HandleLogout(): void {
	chrome.storage.local.set({ username: "", currentStep: 1, launchStatus: undefined }, () => {
		ShowStep(1);
	});
}

function UpdateLaunchStatus(status: string | undefined): void {
	const statusEl = document.getElementById("launchStatus");
	const btn = document.getElementById("startApplyingButton") as HTMLButtonElement | null;
	if (!statusEl) return;

	const messages: Record<string, string> = {
		opening: "Opening Handshake...",
		waiting_login: "Waiting for you to log in...",
		detected: "Handshake detected! Loading...",
	};

	if (status && messages[status]) {
		statusEl.textContent = messages[status];
		statusEl.classList.remove("hidden");
		if (btn) btn.disabled = true;
	}
}

function RestoreLaunchState(): void {
	chrome.storage.local.get(["launchStatus"], (result: StorageResult) => {
		if (result.launchStatus) UpdateLaunchStatus(result.launchStatus);
	});
}

function UpdateJobCounter(): void {
	chrome.storage.local.get("jobData", (result: StorageResult) => {
		const jobData: JobData = result.jobData || {};
		const count = Object.values(jobData).filter((job: JobRecord) => job.clicked).length;
		const el = document.getElementById("jobCount");
		if (el) el.textContent = String(count);
	});
}

function DisplayTrackedJobs(): void {
	const listEl = document.getElementById("trackedJobList");
	if (!listEl) return;

	chrome.storage.local.get("jobData", (result: StorageResult) => {
		const jobData: JobData = result.jobData || {};
		const jobs: JobRecord[] = Object.values(jobData).filter((job: JobRecord) => job.clicked);

		if (jobs.length === 0) {
			listEl.innerHTML = `<p class="tracked-job-empty">No jobs yet — browse Handshake and click a job to add it.</p>`;
			return;
		}

		listEl.innerHTML = "";
		for (const job of jobs) {
			const company = ExtractJobField(job.graphqlResponses || [], ["job", "employer", "name"]) || "Unknown Company";
			const title = ExtractJobField(job.graphqlResponses || [], ["job", "title"]) || "Unknown Role";

			const item = document.createElement("div");
			item.className = "tracked-job-item";
			item.innerHTML = `
				<div class="tracked-job-company">${company}</div>
				<div class="tracked-job-role">${title}</div>
			`;
			listEl.appendChild(item);
		}
	});
}

async function HandleDoneApplying(): Promise<void> {
	const btn = document.getElementById("doneApplyingButton") as HTMLButtonElement | null;
	if (btn) { btn.disabled = true; btn.textContent = "Generating..."; }

	const result = await new Promise<StorageResult>(resolve =>
		chrome.storage.local.get(["authToken", "jobData", "resumeJson"], items => resolve(items as StorageResult))
	);

	const jobData: JobData = result.jobData || {};
	const jobs: JobRecord[] = Object.values(jobData).filter((job: JobRecord) => job.clicked);

	const outcomes = await Promise.allSettled(
		jobs.map(async job => {
			const company = ExtractJobField(job.graphqlResponses || [], ["job", "employer", "name"]) || "Unknown Company";
			const title   = ExtractJobField(job.graphqlResponses || [], ["job", "title"]) || "Unknown Role";
			const jobDescription =
				ExtractJobField(job.graphqlResponses || [], ["job", "description"]) ||
				title;

			const res = await fetch(API_BASE_URL + API_ENDPOINTS.GENERATE_RESUME_PIPELINE, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${result.authToken}`,
				},
				body: JSON.stringify({ job_description: jobDescription, resume: result.resumeJson ?? {} }),
			});

			if (!res.ok) {
				return { jobId: job.jobId, company, title, href: job.href, success: false } as ResumeResult;
			}

			const buffer = await res.arrayBuffer();
			const bytes = new Uint8Array(buffer);
			let binary = "";
			for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
			const pdfBase64 = btoa(binary);

			return { jobId: job.jobId, company, title, href: job.href, success: true, pdfBase64 } as ResumeResult;
		})
	);

	const resumeResults: ResumeResult[] = outcomes.map((outcome, i) => {
		if (outcome.status === "fulfilled") return outcome.value;
		const job = jobs[i];
		const company = ExtractJobField(job.graphqlResponses || [], ["job", "employer", "name"]) || "Unknown Company";
		const title   = ExtractJobField(job.graphqlResponses || [], ["job", "title"]) || "Unknown Role";
		return { jobId: job.jobId, company, title, href: job.href, success: false };
	});

	chrome.storage.local.set({ jobData: {}, resumeResults }, () => {
		ShowReviewView();
	});
}

// Keep IsObject import valid
void IsObject;

if (typeof window !== "undefined" && typeof chrome !== "undefined" && typeof chrome.storage !== "undefined" && typeof (globalThis as Record<string, unknown>).vi === "undefined") {
	injectCSSVariables();

	welcomeView = document.getElementById("welcomeView");
	loginView   = document.getElementById("loginView");
	launchView  = document.getElementById("launchView");
	mainView    = document.getElementById("mainView");
	reviewView  = document.getElementById("reviewView");

	// Step 1: Welcome
	document.getElementById("getStartedButton")?.addEventListener("click", () => ShowStep(2));

	// Step 2: Auth tabs
	document.getElementById("loginTab")?.addEventListener("click", () => SetAuthMode("login"));
	document.getElementById("signupTab")?.addEventListener("click", () => SetAuthMode("signup"));
	document.getElementById("authSubmitButton")?.addEventListener("click", HandleAuth);
	(document.getElementById("authPasswordInput") as HTMLInputElement | null)
		?.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter") HandleAuth(); });

	// Step 2: Resume upload (click + drag-and-drop)
	const fileInput = document.getElementById("fileInput") as HTMLInputElement | null;
	fileInput?.addEventListener("change", () => {
		if (fileInput.files?.[0]) HandleResumeUpload(fileInput.files[0]);
	});

	const dropZone = document.getElementById("dropZone");
	dropZone?.addEventListener("dragover", (e: DragEvent) => {
		e.preventDefault();
		dropZone.classList.add("drop-zone-hover");
	});
	dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("drop-zone-hover"));
	dropZone?.addEventListener("drop", (e: DragEvent) => {
		e.preventDefault();
		dropZone.classList.remove("drop-zone-hover");
		const file = e.dataTransfer?.files[0];
		if (file) HandleResumeUpload(file);
	});

	document.getElementById("continueButton")?.addEventListener("click", () => ShowStep(3));

	// Step 3: Launch search
	document.getElementById("startApplyingButton")?.addEventListener("click", () => {
		UpdateLaunchStatus("opening");
		chrome.tabs.create({ url: HANDSHAKE_JOBS_URL }, (tab) => {
			if (tab.id == null) return;
			chrome.runtime.sendMessage({ type: "watchHandshakeTab", tabId: tab.id });
		});
	});

	// Step 4: Tracking dashboard
	document.getElementById("logoutButton")?.addEventListener("click", HandleLogout);
	document.getElementById("doneApplyingButton")?.addEventListener("click", HandleDoneApplying);

	// Step 5: Review carousel navigation
	document.getElementById("carouselPrev")?.addEventListener("click", () => {
		chrome.storage.local.get("resumeResults", (result: StorageResult) => {
			const results = result.resumeResults || [];
			if (currentCardIndex > 0) { currentCardIndex--; RenderCard(results); }
		});
	});
	document.getElementById("carouselNext")?.addEventListener("click", () => {
		chrome.storage.local.get("resumeResults", (result: StorageResult) => {
			const results = result.resumeResults || [];
			if (currentCardIndex < results.length - 1) { currentCardIndex++; RenderCard(results); }
		});
	});
	document.getElementById("applyMoreButton")?.addEventListener("click", () => ShowTrackingView());
	document.getElementById("homeButton")?.addEventListener("click", () => ShowStep(1));

	// Listen for background script or storage changes advancing steps
	chrome.storage.onChanged.addListener((changes: { [key: string]: chrome.storage.StorageChange }) => {
		if (changes.currentStep?.newValue === 4) {
			ShowTrackingView();
		}
		if (changes.launchStatus) {
			UpdateLaunchStatus(changes.launchStatus.newValue as string);
		}
		if (changes.jobData) {
			UpdateJobCounter();
			DisplayTrackedJobs();
		}
	});

	// Restore the right step on popup open
	chrome.storage.local.get(["username", "currentStep"], (result: StorageResult) => {
		const step = result.currentStep;
		if (step === 5) {
			ShowReviewView();
		} else if (step === 4 || (!step && result.username)) {
			ShowTrackingView();
		} else if (step === 3) {
			ShowStep(3);
		} else if (step === 2) {
			ShowStep(2);
		} else {
			ShowStep(1);
		}
	});

	if (DEBUG_GRAPHQL_VIEW) {
		console.log("[AutoShake] GraphQL debug view enabled");
	}
}
