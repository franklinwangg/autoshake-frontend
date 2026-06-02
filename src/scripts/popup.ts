import type { JobRecord, JobData, StorageResult } from '../types/types';
import { ExtractJobField } from '../utils/popupUtils';
import { IsObject } from './inject';
import { HANDSHAKE_JOBS_URL, API_BASE_URL, API_ENDPOINTS } from '../config/constants';
import { injectCSSVariables } from '../config/styles';

// Compile-time debug flag for GraphQL view
declare const DEBUG_GRAPHQL_VIEW: boolean;

let authMode: "login" | "signup" = "login";

let welcomeView: HTMLElement | null = null;
let loginView: HTMLElement | null = null;
let launchView: HTMLElement | null = null;
let mainView: HTMLElement | null = null;
let processingView: HTMLElement | null = null;

const ALL_VIEWS = () => [welcomeView, loginView, launchView, mainView, processingView];

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

function ShowProcessingView(): void {
	ALL_VIEWS().forEach(v => {
		if (v) { v.classList.add("hidden"); v.classList.remove("active"); }
	});
	if (processingView) { processingView.classList.add("active"); processingView.classList.remove("hidden"); }
	chrome.storage.local.set({ currentStep: 5 });
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
			ShowChecklistPanel();
		});
	} catch {
		if (authError) authError.textContent = "Network error. Please try again.";
	} finally {
		if (submitBtn) submitBtn.disabled = false;
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
	if (btn) btn.disabled = true;

	const result = await new Promise<StorageResult>(resolve =>
		chrome.storage.local.get(["authToken", "jobData"], items => resolve(items as StorageResult))
	);

	const jobData: JobData = result.jobData || {};
	const jobs: JobRecord[] = Object.values(jobData).filter((job: JobRecord) => job.clicked);

	await Promise.allSettled(
		jobs.map(job =>
			fetch(API_BASE_URL + API_ENDPOINTS.GENERATE_RESUME_PIPELINE, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${result.authToken}`,
				},
				body: JSON.stringify({ job }),
			})
		)
	);

	chrome.storage.local.set({ jobData: {}, currentStep: 5 }, () => {
		ShowProcessingView();
	});
}

// Keep IsObject import valid
void IsObject;

if (typeof window !== "undefined" && typeof chrome !== "undefined" && typeof chrome.storage !== "undefined" && typeof (globalThis as Record<string, unknown>).vi === "undefined") {
	injectCSSVariables();

	welcomeView = document.getElementById("welcomeView");
	loginView = document.getElementById("loginView");
	launchView = document.getElementById("launchView");
	mainView = document.getElementById("mainView");
	processingView = document.getElementById("processingView");

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

	// Listen for background script or storage changes advancing steps
	chrome.storage.onChanged.addListener((changes: { [key: string]: chrome.storage.StorageChange }) => {
		if (changes.currentStep?.newValue === 4) {
			ShowTrackingView();
		}
		if (changes.launchStatus) {
			UpdateLaunchStatus(changes.launchStatus.newValue as string);
		}
		// Live-update counter and list as jobs are captured
		if (changes.jobData) {
			UpdateJobCounter();
			DisplayTrackedJobs();
		}
	});

	// Restore the right step on popup open
	chrome.storage.local.get(["username", "currentStep"], (result: StorageResult) => {
		const step = result.currentStep;
		if (step === 5) {
			ShowProcessingView();
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

	// GraphQL debug section (no-op if DEBUG_GRAPHQL_VIEW is false)
	if (DEBUG_GRAPHQL_VIEW) {
		console.log("[AutoShake] GraphQL debug view enabled");
	}
}
