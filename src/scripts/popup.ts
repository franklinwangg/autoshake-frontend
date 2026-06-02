import type { JobRecord, JobData, StorageResult, GraphqlResponse } from '../types/types';
import { GetRelativeTime, GetFieldFromObject, ExtractJobField } from '../utils/popupUtils';
import { IsObject } from './inject';
import { HANDSHAKE_BASE_URL, HANDSHAKE_JOBS_URL, API_BASE_URL, API_ENDPOINTS } from '../config/constants';
import { injectCSSVariables } from '../config/styles';

// Compile-time debug flag for GraphQL view
declare const DEBUG_GRAPHQL_VIEW: boolean;

interface ParsedGraphQLData {
	[key: string]: unknown;
}

let authMode: "login" | "signup" = "login";

let toggle: HTMLInputElement | null = null;
let stateText: HTMLElement | null = null;
let jobList: HTMLElement | null = null;
let graphqlToggleButton: HTMLElement | null = null;
let graphqlStats: HTMLElement | null = null;
let submitButton: HTMLButtonElement | null = null;
let welcomeView: HTMLElement | null = null;
let loginView: HTMLElement | null = null;
let launchView: HTMLElement | null = null;
let mainView: HTMLElement | null = null;

const ALL_VIEWS = () => [welcomeView, loginView, launchView, mainView];

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

function ShowMainView(): void {
	ALL_VIEWS().forEach(v => {
		if (v) { v.classList.add("hidden"); v.classList.remove("active"); }
	});
	if (mainView) { mainView.classList.add("active"); mainView.classList.remove("hidden"); }
	chrome.storage.local.set({ currentStep: 4 });

	chrome.storage.local.get(["username"], (result: StorageResult) => {
		const usernameDisplay = document.getElementById("usernameDisplay");
		if (usernameDisplay && result.username) {
			usernameDisplay.textContent = `Logged in as: ${result.username}`;
		}
	});

	InitializePopupDOMElements();
	InitializePopup();
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
	const authError = document.getElementById("authError");
	const dropZone = document.getElementById("dropZone");
	const resumeCheckItem = document.getElementById("resumeCheckItem");
	const continueButton = document.getElementById("continueButton") as HTMLButtonElement | null;

	if (file.type !== "application/pdf") {
		if (authError) authError.textContent = "Please upload a PDF file.";
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
			if (authError) authError.textContent = "Upload failed. Please try again.";
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
		if (authError) authError.textContent = "Network error. Please try again.";
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

function InitializePopupDOMElements() {
	toggle = document.getElementById("stateToggle") as HTMLInputElement | null;
	stateText = document.getElementById("trackingLabel");
	jobList = document.getElementById("jobList");
	if (DEBUG_GRAPHQL_VIEW) {
		graphqlToggleButton = document.getElementById("toggleGraphQL");
		graphqlStats = document.getElementById("graphqlStats");
	}
	submitButton = document.getElementById("submitButton") as HTMLButtonElement | null;
}

function DisplayGraphQLResponses(): void {
  const container: HTMLElement | null = document.getElementById("graphqlResponses");
  if (!container) return;

  chrome.storage.local.get("jobData", (result: StorageResult) => {
    const jobData: JobData = result.jobData || {};
    const responses: GraphqlResponse[] = Object.values(jobData)
      .flatMap((job: JobRecord) => Array.isArray(job.graphqlResponses) ? job.graphqlResponses : []);

    if (responses.length === 0) {
      container.innerHTML = "<p class='no-data-text'>No responses yet</p>";
      return;
    }

    container.innerHTML = "";

    responses.slice().reverse().forEach((r: GraphqlResponse, i: number) => {
      const parsed: unknown = JSON.parse(r.data);
      const parsedData: ParsedGraphQLData | null = IsObject(parsed) ? parsed as ParsedGraphQLData : null;
      const inner: unknown = parsedData && "data" in parsedData && IsObject(parsedData.data) ? parsedData.data : null;
      const operationName: string = inner
        ? Object.keys(inner).join(", ") || "unknown"
        : parsedData
          ? Object.keys(parsedData)[0] ?? "unknown"
          : "unknown";

      const item: HTMLDivElement = document.createElement("div");
      item.className = "graphql-item";
      item.innerHTML = `
        <div class="graphql-header" data-index="${i}">
          <span class="graphql-op">${operationName}</span>
          <span class="graphql-time">${GetRelativeTime(r.timestamp)}</span>
          <span class="graphql-toggle">▶</span>
        </div>
        <pre class="graphql-body" id="body-${i}">${JSON.stringify(parsed, null, 2)}</pre>
      `;

      const headerElement: Element | null = item.querySelector(".graphql-header");
      headerElement?.addEventListener("click", () => {
        const body: HTMLElement | null = document.getElementById(`body-${i}`);
        const toggleIcon: Element | null = item.querySelector(".graphql-toggle");
        const isHidden: boolean = body?.style.display === "none";
        if (body) body.style.display = isHidden ? "block" : "none";
        if (toggleIcon) toggleIcon.textContent = isHidden ? "▼" : "▶";
      });

      container.appendChild(item);
    });
  });
}

function DeleteJob(jobId: string): void {
	chrome.storage.local.get("jobData", (result: StorageResult) => {
		const jobData: JobData = result.jobData || {};
		if (jobData[jobId]) {
			jobData[jobId].clicked = false;
		}
		
		chrome.storage.local.set({ jobData }, () => {
			DisplayJobs();
		});
	});
}

function ClearAllJobs(): void {
	chrome.storage.local.set({ jobData: {} }, () => {
		DisplayJobs();
	});
}

async function SubmitJobList(): Promise<void> {
	const result = await new Promise<StorageResult>(resolve =>
		chrome.storage.local.get(["authToken", "jobData"], items => resolve(items as StorageResult))
	);

	const jobData: JobData = result.jobData || {};
	const jobs: JobRecord[] = Object.values(jobData).filter((job: JobRecord) => job.clicked);

	if (jobs.length === 0) {
		alert("No jobs to submit!");
		return;
	}

	try {
		const res = await fetch(API_BASE_URL + API_ENDPOINTS.SUBMIT_JOBS, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${result.authToken}`,
			},
			body: JSON.stringify({ jobs }),
		});

		if (!res.ok) {
			alert("Failed to submit jobs. Please try again.");
			return;
		}

		// Only clear clicked state on successful submission to preserve GraphQL data
		jobs.forEach((job: JobRecord) => {
			if (jobData[job.jobId]) jobData[job.jobId].clicked = false;
		});

		chrome.storage.local.set({ jobData }, () => { DisplayJobs(); });
		alert("Job list submitted!");
	} catch {
		alert("Network error. Could not submit jobs.");
	}
}

function UpdateToggleLabel(isOn: boolean): void {
	if (stateText) {
		stateText.textContent = `Job Tracking: ${isOn ? "Enabled" : "Disabled"}\n`;
	}
}

function UpdateSubmitButtonState(): void {
	if (!submitButton) return;
	
	chrome.storage.local.get("jobData", (result: StorageResult) => {
		const jobData: JobData = result.jobData || {};
		const jobs: JobRecord[] = Object.values(jobData).filter((job: JobRecord) => job.clicked);
		
		if (jobs.length > 0) {
			submitButton!.disabled = false;
			submitButton!.textContent = "Submit Job List";
		} else {
			submitButton!.disabled = true;
			submitButton!.textContent = "Need jobs to submit";
		}
	});
}

function DisplayJobs(): void {
	if (!jobList) return;
	const listEl = jobList;
	
	chrome.storage.local.get("jobData", (result: StorageResult) => {
		const jobData: JobData = result.jobData || {};
		const jobs: JobRecord[] = Object.values(jobData).filter((job: JobRecord) => job.clicked);
		
		if (jobs.length === 0) {
			listEl.innerHTML = "<p class='no-data-text'>No jobs in your list. Click a handshake job to add one!</p>";
			UpdateSubmitButtonState();
			return;
		}
		
		listEl.innerHTML = `<h2>Job List (${jobs.length})</h2>`;
		const container: HTMLDivElement = document.createElement("div");
		container.className = "jobs-container";
		
		for (const job of jobs) {
			const jobItem: HTMLDivElement = document.createElement("div");
			jobItem.className = "job-item";
			
			const jobTitle: string = ExtractJobField(job.graphqlResponses || [], ["job", "title"]) || "Unknown Job";
			const jobEmployer: string | null = ExtractJobField(job.graphqlResponses || [], ["job", "employer", "name"]);
			const relativeTime: string = job.clickTimestamp ? GetRelativeTime(job.clickTimestamp) : "unknown time";
			jobItem.innerHTML = `
				<div class="job-title">${jobTitle}</div>
				${jobEmployer ? `<div class="job-employer">${jobEmployer}</div>` : ""}
				<div class="job-meta">${relativeTime}</div>
				<button class="delete-button" data-job-id="${job.jobId}">×</button>
			`;
			
			jobItem.addEventListener("click", (e: MouseEvent) => {
				if ((e.target as HTMLElement).classList.contains("delete-button")) return;
				
				let fullUrl: string = job.href ?? "";
				if (!fullUrl.startsWith("http")) {
					fullUrl = HANDSHAKE_BASE_URL + (fullUrl.startsWith("/") ? "" : "/") + fullUrl;
				}
				chrome.tabs.create({ url: fullUrl });
			});
			
			const deleteButton: HTMLButtonElement | null = jobItem.querySelector(".delete-button");
			deleteButton?.addEventListener("click", (e: MouseEvent) => {
				e.stopPropagation();
				DeleteJob(job.jobId);
			});
			
			container.appendChild(jobItem);
		};
		
		listEl.appendChild(container);
		UpdateSubmitButtonState();
	});
}

function InitializePopup(): void {
	if (!toggle || !stateText || !jobList) return;

	const toggleEl: HTMLInputElement = toggle;
	const graphqlBtn: HTMLElement = graphqlToggleButton!;

	chrome.storage.local.get(["trackingEnabled"], (result: StorageResult) => {
		const enabled: boolean = result.trackingEnabled !== false;
		toggleEl.checked = enabled;
		UpdateToggleLabel(enabled);

		toggleEl.addEventListener("change", () => {
			const isOn: boolean = toggleEl.checked;
			chrome.storage.local.set({ trackingEnabled: isOn }, () => {
				UpdateToggleLabel(isOn);
			});
		});
	});

	DisplayJobs();
	if (DEBUG_GRAPHQL_VIEW) {
		DisplayGraphQLResponses();
	}
	UpdateSubmitButtonState();

	// Log storage size
	chrome.storage.local.get(null, (items: Record<string, unknown>) => {
		const storageSize = JSON.stringify(items).length;
		const storageSizeMB = (storageSize / (1024 * 1024)).toFixed(2);
		console.log(`Chrome Storage Size: ${storageSizeMB} MB (${storageSize} bytes)`);
	});

	if (DEBUG_GRAPHQL_VIEW) {
		graphqlBtn.addEventListener("click", () => {
			const container: HTMLElement | null = document.getElementById("graphqlResponses");
			if (!container) return;

			const isHidden: boolean = container.classList.contains("hidden");
			container.classList.toggle("hidden", !isHidden);
			graphqlBtn.textContent = isHidden ? "Hide" : "Show";
		});
	}

	submitButton?.addEventListener("click", SubmitJobList);
}

if (typeof window !== "undefined" && typeof chrome !== "undefined" && typeof chrome.storage !== "undefined" && typeof (globalThis as Record<string, unknown>).vi === "undefined") {
	injectCSSVariables();

	welcomeView = document.getElementById("welcomeView");
	loginView = document.getElementById("loginView");
	launchView = document.getElementById("launchView");
	mainView = document.getElementById("mainView");

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

	// Listen for background script advancing to step 4
	chrome.storage.onChanged.addListener((changes: { [key: string]: chrome.storage.StorageChange }) => {
		if (changes.currentStep?.newValue === 4) {
			ShowMainView();
		}
		if (changes.launchStatus) {
			UpdateLaunchStatus(changes.launchStatus.newValue as string);
		}
	});

	// GraphQL debug section
	if (!DEBUG_GRAPHQL_VIEW) {
		document.querySelector(".graphql-section-header")?.classList.add("hidden");
		document.getElementById("graphqlResponses")?.classList.add("hidden");
	}

	// Main view
	document.getElementById("logoutButton")?.addEventListener("click", HandleLogout);

	// Restore the right step on popup open
	chrome.storage.local.get(["username", "currentStep"], (result: StorageResult) => {
		const step = result.currentStep;
		if (step === 4 || (!step && result.username)) {
			ShowMainView();
		} else if (step === 3) {
			ShowStep(3);
		} else if (step === 2) {
			ShowStep(2);
		} else {
			ShowStep(1);
		}
	});
}
