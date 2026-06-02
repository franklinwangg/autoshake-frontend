"use strict";
(() => {
  // src/scripts/inject.ts
  var IsObject = (value) => value !== null && typeof value === "object";
  var NormalizeId = (value) => {
    if (typeof value === "string" && /^\d+$/.test(value)) return value;
    if (typeof value === "number" && Number.isInteger(value)) return String(value);
    return null;
  };
  var FindJobIdInObject = (obj) => {
    if (!IsObject(obj)) return null;
    if ("__typename" in obj && obj.__typename === "Job" && "id" in obj) {
      return NormalizeId(obj.id);
    }
    if (IsObject(obj.job) && "id" in obj.job) {
      return NormalizeId(obj.job.id);
    }
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = FindJobIdInObject(item);
        if (found) return found;
      }
      return null;
    }
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (key === "jobId" || key === "job_id" || key === "jobID") {
        const normalized = NormalizeId(value);
        if (normalized) return normalized;
      }
      if (key === "variables" && IsObject(value)) {
        const candidate = ("jobId" in value ? value.jobId : void 0) ?? ("id" in value ? value.id : void 0) ?? ("job_id" in value ? value.job_id : void 0) ?? ("jobID" in value ? value.jobID : void 0);
        const normalized = NormalizeId(candidate);
        if (normalized) return normalized;
      }
      if (IsObject(value) || Array.isArray(value)) {
        const found = FindJobIdInObject(value);
        if (found) return found;
      }
    }
    return null;
  };
  (() => {
    if (window.__AUTOSHAKE_INITIALIZED__) {
      console.log("[AutoShake] inject.js already running, skipping re-init");
      return;
    }
    window.__AUTOSHAKE_INITIALIZED__ = true;
    console.log("[AutoShake] inject.js initializing");
    window.__AUTOSHAKE_GRAPHQL_RESPONSES__ = [];
    window.__AUTOSHAKE_CLICKED_JOBS__ = [];
    const origFetch = window.fetch;
    const ParseJSON = (text) => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    };
    const ExtractJobIdFromRequest = (args) => {
      try {
        const requestInit = args[1];
        const body = requestInit?.body;
        if (typeof body === "string") {
          const parsedBody = ParseJSON(body);
          if (parsedBody) {
            const candidate = FindJobIdInObject(parsedBody);
            if (candidate) return candidate;
          }
        }
        if (IsObject(body)) {
          const candidate = FindJobIdInObject(body);
          if (candidate) return candidate;
        }
        const firstArg = args[0];
        const url = typeof firstArg === "string" ? firstArg : IsObject(firstArg) && "url" in firstArg && typeof firstArg.url === "string" ? firstArg.url : void 0;
        if (url) {
          const match = url.match(/jobId=(\d+)/) || url.match(/\/job-search\/(\d+)/);
          if (match) return match[1] ?? null;
        }
      } catch (error) {
        console.warn("[AutoShake] Error extracting job ID from request", error);
      }
      return null;
    };
    window.fetch = async (...args) => {
      const res = await origFetch(...args);
      const clone = res.clone();
      clone.json().then((data) => {
        if (IsObject(data) && ("data" in data || "errors" in data)) {
          let jobId = FindJobIdInObject("data" in data ? data.data : data);
          let source = "response";
          if (!jobId) {
            jobId = ExtractJobIdFromRequest(args);
            source = "request";
          }
          if (jobId) {
            const graphqlResponse = {
              url: String(args[0]),
              data: JSON.stringify(data),
              timestamp: (/* @__PURE__ */ new Date()).toISOString()
            };
            window.postMessage({
              type: "AUTOSHAKE_GRAPHQL_RESPONSE",
              jobId,
              response: graphqlResponse
            }, "*");
            console.log("[AutoShake] Intercepted GraphQL response for job ID:", jobId, "(source:", source, ")");
          } else {
            console.log("[AutoShake] GraphQL response has no detectable job ID, skipping");
          }
        }
      }).catch(() => {
      });
      return res;
    };
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      if (event.data.type === "AUTOSHAKE_GET_DATA") {
        window.postMessage({
          type: "AUTOSHAKE_DATA_RESPONSE",
          graphqlResponses: window.__AUTOSHAKE_GRAPHQL_RESPONSES__,
          clickedJobs: window.__AUTOSHAKE_CLICKED_JOBS__
        }, "*");
      }
    });
  })();

  // src/utils/popupUtils.ts
  var MS_PER_MINUTE = 6e4;
  var MINUTES_PER_HOUR = 60;
  var HOURS_PER_DAY = 24;
  function GetRelativeTime(isoString) {
    const now = /* @__PURE__ */ new Date();
    const past = new Date(isoString);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / MS_PER_MINUTE);
    const diffHours = Math.floor(diffMins / MINUTES_PER_HOUR);
    const diffDays = Math.floor(diffHours / HOURS_PER_DAY);
    if (diffMins < 1) {
      return "just now";
    }
    if (diffMins < MINUTES_PER_HOUR) {
      return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
    }
    if (diffHours < HOURS_PER_DAY) {
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    }
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  }
  function GetFieldFromObject(obj, path) {
    let current = obj;
    for (const segment of path) {
      if (!current || typeof current !== "object") return null;
      current = current[segment];
    }
    return current ?? null;
  }
  function ExtractJobField(responses, path) {
    if (!Array.isArray(responses)) return null;
    for (const response of responses) {
      if (!response || typeof response.data !== "string") continue;
      try {
        const parsed = JSON.parse(response.data);
        if (IsObject(parsed) && "data" in parsed) {
          const candidate = GetFieldFromObject(parsed.data, path);
          if (typeof candidate === "string" && candidate.trim().length > 0) {
            return candidate;
          }
          if (IsObject(parsed.data)) {
            for (const value of Object.values(parsed.data)) {
              const nested = GetFieldFromObject(value, path);
              if (typeof nested === "string" && nested.trim().length > 0) {
                return nested;
              }
            }
          }
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  // src/config/constants.ts
  var HANDSHAKE_BASE_URL = "https://app.joinhandshake.com";
  var HANDSHAKE_JOBS_URL = "https://app.joinhandshake.com/stu/jobs";
  var API_BASE_URL = "https://autoshake-production.up.railway.app";
  var API_ENDPOINTS = {
    // Auth
    SIGNUP: "/auth/signup",
    LOGIN: "/auth/login",
    LOGOUT: "/auth/logout",
    // User
    GET_PROFILE: "/user/profile",
    UPDATE_PROFILE: "/user/profile",
    // Resume (base resume)
    UPLOAD_RESUME: "/resume/upload",
    GET_RESUME: "/resume",
    DELETE_RESUME: "/resume",
    // Jobs
    SUBMIT_JOBS: "/jobs",
    GET_JOBS: "/jobs",
    GET_JOB: (jobId) => `/jobs/${jobId}`,
    DELETE_JOB: (jobId) => `/jobs/${jobId}`,
    // Tailored resume generation
    GENERATE_RESUME: (jobId) => `/jobs/${jobId}/generate`,
    GET_GENERATED_RESUME: (jobId) => `/jobs/${jobId}/resume`,
    BATCH_GENERATE: "/generate/batch",
    // Pipeline (internal/dev)
    EXTRACT_SKILLS: "/extract-skills",
    GENERATE_RESUME_PIPELINE: "/generate-resume",
    GET_TEMPLATES: "/templates",
    HEALTH: "/health"
  };

  // src/config/styles.ts
  var COLORS = {
    primary: "#4c61af",
    primaryDark: "#3b4f8f",
    success: "#4caf50",
    error: "#d32f2f",
    danger: "#ff4444",
    brandDark: "#1e2a5e",
    logout: "#ef9a9a",
    white: "#ffffff",
    textPrimary: "#333333",
    textSecondary: "#555555",
    textMuted: "#666666",
    textFaint: "#888888",
    textPlaceholder: "#999999",
    textDisabled: "#bbbbbb",
    textCode: "#d4d4d4",
    border: "#dddddd",
    borderSubtle: "#dde3f5",
    borderDrop: "#b0bce8",
    borderDisabled: "#cccccc",
    bgSubtle: "#f5f5f5",
    bgLight: "#fafafa",
    bgGradientStart: "#f8faff",
    bgGradientEnd: "#eef1fb",
    bgSuccess: "#f0faf0",
    bgSuccessHover: "#e8f5e9",
    bgHover: "#e8e8e8",
    bgDark: "#1e1e1e"
  };
  var SPACING = {
    4: "4px",
    6: "6px",
    8: "8px",
    10: "10px",
    12: "12px",
    14: "14px",
    16: "16px",
    20: "20px",
    24: "24px",
    32: "32px",
    36: "36px",
    40: "40px"
  };
  var FONT_SIZE = {
    xs: "11px",
    sm: "12px",
    base: "14px",
    md: "1rem",
    lg: "1.25rem",
    xl: "1.4rem",
    "2xl": "1.6rem",
    "3xl": "2rem",
    "4xl": "2.2rem",
    display: "3rem"
  };
  var RADIUS = {
    sm: "4px",
    md: "6px",
    lg: "8px",
    xl: "10px",
    "2xl": "16px",
    pill: "34px"
  };
  var TRANSITION = {
    fast: "0.2s",
    faster: "0.15s"
  };
  function camelToKebab(s) {
    return s.replace(/([A-Z])/g, "-$1").toLowerCase();
  }
  function injectCSSVariables() {
    const rules = [];
    for (const [key, value] of Object.entries(COLORS)) {
      rules.push(`  --color-${camelToKebab(key)}: ${value};`);
    }
    for (const [key, value] of Object.entries(SPACING)) {
      rules.push(`  --space-${key}: ${value};`);
    }
    for (const [key, value] of Object.entries(FONT_SIZE)) {
      rules.push(`  --text-${key}: ${value};`);
    }
    for (const [key, value] of Object.entries(RADIUS)) {
      rules.push(`  --radius-${key}: ${value};`);
    }
    for (const [key, value] of Object.entries(TRANSITION)) {
      rules.push(`  --transition-${key}: ${value};`);
    }
    const style = document.createElement("style");
    style.textContent = `:root {
${rules.join("\n")}
}`;
    document.head.appendChild(style);
  }

  // src/scripts/popup.ts
  var authMode = "login";
  var toggle = null;
  var stateText = null;
  var jobList = null;
  var graphqlToggleButton = null;
  var submitButton = null;
  var welcomeView = null;
  var loginView = null;
  var launchView = null;
  var mainView = null;
  var ALL_VIEWS = () => [welcomeView, loginView, launchView, mainView];
  function ShowStep(step) {
    ALL_VIEWS().forEach((v) => {
      if (v) {
        v.classList.add("hidden");
        v.classList.remove("active");
      }
    });
    const views = {
      1: welcomeView,
      2: loginView,
      3: launchView
    };
    const target = views[step];
    if (target) {
      target.classList.remove("hidden");
      target.classList.add("active");
    }
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ currentStep: step });
    }
    if (step === 3) RestoreLaunchState();
  }
  function ShowMainView() {
    ALL_VIEWS().forEach((v) => {
      if (v) {
        v.classList.add("hidden");
        v.classList.remove("active");
      }
    });
    if (mainView) {
      mainView.classList.add("active");
      mainView.classList.remove("hidden");
    }
    chrome.storage.local.set({ currentStep: 4 });
    chrome.storage.local.get(["username"], (result) => {
      const usernameDisplay = document.getElementById("usernameDisplay");
      if (usernameDisplay && result.username) {
        usernameDisplay.textContent = `Logged in as: ${result.username}`;
      }
    });
    InitializePopupDOMElements();
    InitializePopup();
  }
  function ShowChecklistPanel() {
    const authPanel = document.getElementById("authPanel");
    const checklistPanel = document.getElementById("checklistPanel");
    if (authPanel) authPanel.classList.add("hidden");
    if (checklistPanel) {
      checklistPanel.classList.remove("hidden");
    }
  }
  function SetAuthMode(mode) {
    authMode = mode;
    const loginTab = document.getElementById("loginTab");
    const signupTab = document.getElementById("signupTab");
    const submitBtn = document.getElementById("authSubmitButton");
    loginTab?.classList.toggle("auth-tab-active", mode === "login");
    signupTab?.classList.toggle("auth-tab-active", mode === "signup");
    if (submitBtn) submitBtn.textContent = mode === "login" ? "Log In" : "Sign Up";
  }
  async function HandleAuth() {
    const emailInput = document.getElementById("emailInput");
    const passwordInput = document.getElementById("authPasswordInput");
    const authError = document.getElementById("authError");
    const submitBtn = document.getElementById("authSubmitButton");
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
        body: JSON.stringify({ email, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (authError) authError.textContent = data.message || "Authentication failed.";
        return;
      }
      const token = data.access_token ?? data.token ?? "";
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
  async function HandleResumeUpload(file) {
    const uploadError = document.getElementById("uploadError");
    const dropZone = document.getElementById("dropZone");
    const resumeCheckItem = document.getElementById("resumeCheckItem");
    const continueButton = document.getElementById("continueButton");
    if (uploadError) uploadError.textContent = "";
    if (file.type !== "application/pdf") {
      if (uploadError) uploadError.textContent = "Please upload a PDF file.";
      return;
    }
    if (dropZone) dropZone.innerHTML = `<p class="drop-hint">Uploading...</p>`;
    const { authToken } = await new Promise(
      (resolve) => chrome.storage.local.get(["authToken"], (items) => resolve(items))
    );
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(API_BASE_URL + API_ENDPOINTS.UPLOAD_RESUME, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData
      });
      if (!res.ok) {
        if (uploadError) uploadError.textContent = "Upload failed. Please try again.";
        if (dropZone) dropZone.innerHTML = `<p class="drop-hint">Drag &amp; drop your resume PDF here</p><p class="drop-hint-sub">or <label for="fileInput" class="file-link">browse files</label></p>`;
        return;
      }
      if (dropZone) {
        dropZone.innerHTML = `<p class="upload-success">\u2713 ${file.name}</p>`;
        dropZone.classList.add("upload-done");
      }
      if (resumeCheckItem) resumeCheckItem.classList.add("checked");
      if (continueButton) continueButton.disabled = false;
    } catch {
      if (uploadError) uploadError.textContent = "Network error. Please try again.";
      if (dropZone) dropZone.innerHTML = `<p class="drop-hint">Drag &amp; drop your resume PDF here</p><p class="drop-hint-sub">or <label for="fileInput" class="file-link">browse files</label></p>`;
    }
  }
  function HandleLogout() {
    chrome.storage.local.set({ username: "", currentStep: 1, launchStatus: void 0 }, () => {
      ShowStep(1);
    });
  }
  function UpdateLaunchStatus(status) {
    const statusEl = document.getElementById("launchStatus");
    const btn = document.getElementById("startApplyingButton");
    if (!statusEl) return;
    const messages = {
      opening: "Opening Handshake...",
      waiting_login: "Waiting for you to log in...",
      detected: "Handshake detected! Loading..."
    };
    if (status && messages[status]) {
      statusEl.textContent = messages[status];
      statusEl.classList.remove("hidden");
      if (btn) btn.disabled = true;
    }
  }
  function RestoreLaunchState() {
    chrome.storage.local.get(["launchStatus"], (result) => {
      if (result.launchStatus) UpdateLaunchStatus(result.launchStatus);
    });
  }
  function InitializePopupDOMElements() {
    toggle = document.getElementById("stateToggle");
    stateText = document.getElementById("trackingLabel");
    jobList = document.getElementById("jobList");
    if (false) {
      graphqlToggleButton = document.getElementById("toggleGraphQL");
      graphqlStats = document.getElementById("graphqlStats");
    }
    submitButton = document.getElementById("submitButton");
  }
  function DeleteJob(jobId) {
    chrome.storage.local.get("jobData", (result) => {
      const jobData = result.jobData || {};
      if (jobData[jobId]) {
        jobData[jobId].clicked = false;
      }
      chrome.storage.local.set({ jobData }, () => {
        DisplayJobs();
      });
    });
  }
  async function SubmitJobList() {
    const result = await new Promise(
      (resolve) => chrome.storage.local.get(["authToken", "jobData"], (items) => resolve(items))
    );
    const jobData = result.jobData || {};
    const jobs = Object.values(jobData).filter((job) => job.clicked);
    if (jobs.length === 0) {
      alert("No jobs to submit!");
      return;
    }
    try {
      const res = await fetch(API_BASE_URL + API_ENDPOINTS.SUBMIT_JOBS, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${result.authToken}`
        },
        body: JSON.stringify({ jobs })
      });
      if (!res.ok) {
        alert("Failed to submit jobs. Please try again.");
        return;
      }
      jobs.forEach((job) => {
        if (jobData[job.jobId]) jobData[job.jobId].clicked = false;
      });
      chrome.storage.local.set({ jobData }, () => {
        DisplayJobs();
      });
      alert("Job list submitted!");
    } catch {
      alert("Network error. Could not submit jobs.");
    }
  }
  function UpdateToggleLabel(isOn) {
    if (stateText) {
      stateText.textContent = `Job Tracking: ${isOn ? "Enabled" : "Disabled"}
`;
    }
  }
  function UpdateSubmitButtonState() {
    if (!submitButton) return;
    chrome.storage.local.get("jobData", (result) => {
      const jobData = result.jobData || {};
      const jobs = Object.values(jobData).filter((job) => job.clicked);
      if (jobs.length > 0) {
        submitButton.disabled = false;
        submitButton.textContent = "Submit Job List";
      } else {
        submitButton.disabled = true;
        submitButton.textContent = "Need jobs to submit";
      }
    });
  }
  function DisplayJobs() {
    if (!jobList) return;
    const listEl = jobList;
    chrome.storage.local.get("jobData", (result) => {
      const jobData = result.jobData || {};
      const jobs = Object.values(jobData).filter((job) => job.clicked);
      if (jobs.length === 0) {
        listEl.innerHTML = "<p class='no-data-text'>No jobs in your list. Click a handshake job to add one!</p>";
        UpdateSubmitButtonState();
        return;
      }
      listEl.innerHTML = `<h2>Job List (${jobs.length})</h2>`;
      const container = document.createElement("div");
      container.className = "jobs-container";
      for (const job of jobs) {
        const jobItem = document.createElement("div");
        jobItem.className = "job-item";
        const jobTitle = ExtractJobField(job.graphqlResponses || [], ["job", "title"]) || "Unknown Job";
        const jobEmployer = ExtractJobField(job.graphqlResponses || [], ["job", "employer", "name"]);
        const relativeTime = job.clickTimestamp ? GetRelativeTime(job.clickTimestamp) : "unknown time";
        jobItem.innerHTML = `
				<div class="job-title">${jobTitle}</div>
				${jobEmployer ? `<div class="job-employer">${jobEmployer}</div>` : ""}
				<div class="job-meta">${relativeTime}</div>
				<button class="delete-button" data-job-id="${job.jobId}">\xD7</button>
			`;
        jobItem.addEventListener("click", (e) => {
          if (e.target.classList.contains("delete-button")) return;
          let fullUrl = job.href ?? "";
          if (!fullUrl.startsWith("http")) {
            fullUrl = HANDSHAKE_BASE_URL + (fullUrl.startsWith("/") ? "" : "/") + fullUrl;
          }
          chrome.tabs.create({ url: fullUrl });
        });
        const deleteButton = jobItem.querySelector(".delete-button");
        deleteButton?.addEventListener("click", (e) => {
          e.stopPropagation();
          DeleteJob(job.jobId);
        });
        container.appendChild(jobItem);
      }
      ;
      listEl.appendChild(container);
      UpdateSubmitButtonState();
    });
  }
  function InitializePopup() {
    if (!toggle || !stateText || !jobList) return;
    const toggleEl = toggle;
    const graphqlBtn = graphqlToggleButton;
    chrome.storage.local.get(["trackingEnabled"], (result) => {
      const enabled = result.trackingEnabled !== false;
      toggleEl.checked = enabled;
      UpdateToggleLabel(enabled);
      toggleEl.addEventListener("change", () => {
        const isOn = toggleEl.checked;
        chrome.storage.local.set({ trackingEnabled: isOn }, () => {
          UpdateToggleLabel(isOn);
        });
      });
    });
    DisplayJobs();
    if (false) {
      DisplayGraphQLResponses();
    }
    UpdateSubmitButtonState();
    chrome.storage.local.get(null, (items) => {
      const storageSize = JSON.stringify(items).length;
      const storageSizeMB = (storageSize / (1024 * 1024)).toFixed(2);
      console.log(`Chrome Storage Size: ${storageSizeMB} MB (${storageSize} bytes)`);
    });
    if (false) {
      graphqlBtn.addEventListener("click", () => {
        const container = document.getElementById("graphqlResponses");
        if (!container) return;
        const isHidden = container.classList.contains("hidden");
        container.classList.toggle("hidden", !isHidden);
        graphqlBtn.textContent = isHidden ? "Hide" : "Show";
      });
    }
    submitButton?.addEventListener("click", SubmitJobList);
  }
  if (typeof window !== "undefined" && typeof chrome !== "undefined" && typeof chrome.storage !== "undefined" && typeof globalThis.vi === "undefined") {
    injectCSSVariables();
    welcomeView = document.getElementById("welcomeView");
    loginView = document.getElementById("loginView");
    launchView = document.getElementById("launchView");
    mainView = document.getElementById("mainView");
    document.getElementById("getStartedButton")?.addEventListener("click", () => ShowStep(2));
    document.getElementById("loginTab")?.addEventListener("click", () => SetAuthMode("login"));
    document.getElementById("signupTab")?.addEventListener("click", () => SetAuthMode("signup"));
    document.getElementById("authSubmitButton")?.addEventListener("click", HandleAuth);
    document.getElementById("authPasswordInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") HandleAuth();
    });
    const fileInput = document.getElementById("fileInput");
    fileInput?.addEventListener("change", () => {
      if (fileInput.files?.[0]) HandleResumeUpload(fileInput.files[0]);
    });
    const dropZone = document.getElementById("dropZone");
    dropZone?.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("drop-zone-hover");
    });
    dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("drop-zone-hover"));
    dropZone?.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("drop-zone-hover");
      const file = e.dataTransfer?.files[0];
      if (file) HandleResumeUpload(file);
    });
    document.getElementById("continueButton")?.addEventListener("click", () => ShowStep(3));
    document.getElementById("startApplyingButton")?.addEventListener("click", () => {
      UpdateLaunchStatus("opening");
      chrome.tabs.create({ url: HANDSHAKE_JOBS_URL }, (tab) => {
        if (tab.id == null) return;
        chrome.runtime.sendMessage({ type: "watchHandshakeTab", tabId: tab.id });
      });
    });
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.currentStep?.newValue === 4) {
        ShowMainView();
      }
      if (changes.launchStatus) {
        UpdateLaunchStatus(changes.launchStatus.newValue);
      }
    });
    if (true) {
      document.querySelector(".graphql-section-header")?.classList.add("hidden");
      document.getElementById("graphqlResponses")?.classList.add("hidden");
    }
    document.getElementById("logoutButton")?.addEventListener("click", HandleLogout);
    chrome.storage.local.get(["username", "currentStep"], (result) => {
      const step = result.currentStep;
      if (step === 4 || !step && result.username) {
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
})();
