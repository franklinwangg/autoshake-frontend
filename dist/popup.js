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
    EXTRACT_RESUME_TEXT: "/resume/extract-text",
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
  var welcomeView = null;
  var loginView = null;
  var launchView = null;
  var mainView = null;
  var processingView = null;
  var ALL_VIEWS = () => [welcomeView, loginView, launchView, mainView, processingView];
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
  function ShowTrackingView() {
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
    DisplayTrackedJobs();
    UpdateJobCounter();
  }
  function ShowProcessingView() {
    ALL_VIEWS().forEach((v) => {
      if (v) {
        v.classList.add("hidden");
        v.classList.remove("active");
      }
    });
    if (processingView) {
      processingView.classList.add("active");
      processingView.classList.remove("hidden");
    }
    chrome.storage.local.set({ currentStep: 5 });
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
        FetchAndExtractResume(token);
        ShowChecklistPanel();
      });
    } catch {
      if (authError) authError.textContent = "Network error. Please try again.";
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }
  async function FetchAndExtractResume(authToken) {
    try {
      const resumeRes = await fetch(API_BASE_URL + API_ENDPOINTS.GET_RESUME, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (!resumeRes.ok) return;
      const resumeData = await resumeRes.json();
      const url = resumeData.resumes?.[0]?.url;
      if (!url) return;
      const extractRes = await fetch(API_BASE_URL + API_ENDPOINTS.EXTRACT_RESUME_TEXT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ url })
      });
      if (!extractRes.ok) return;
      const extractData = await extractRes.json();
      if (extractData.text) {
        chrome.storage.local.set({ resumeText: extractData.text });
      }
    } catch {
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
  function UpdateJobCounter() {
    chrome.storage.local.get("jobData", (result) => {
      const jobData = result.jobData || {};
      const count = Object.values(jobData).filter((job) => job.clicked).length;
      const el = document.getElementById("jobCount");
      if (el) el.textContent = String(count);
    });
  }
  function DisplayTrackedJobs() {
    const listEl = document.getElementById("trackedJobList");
    if (!listEl) return;
    chrome.storage.local.get("jobData", (result) => {
      const jobData = result.jobData || {};
      const jobs = Object.values(jobData).filter((job) => job.clicked);
      if (jobs.length === 0) {
        listEl.innerHTML = `<p class="tracked-job-empty">No jobs yet \u2014 browse Handshake and click a job to add it.</p>`;
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
  async function HandleDoneApplying() {
    const btn = document.getElementById("doneApplyingButton");
    if (btn) btn.disabled = true;
    const result = await new Promise(
      (resolve) => chrome.storage.local.get(["authToken", "jobData", "resumeText"], (items) => resolve(items))
    );
    const jobData = result.jobData || {};
    const jobs = Object.values(jobData).filter((job) => job.clicked);
    await Promise.allSettled(
      jobs.map((job) => {
        const jobDescription = ExtractJobField(job.graphqlResponses || [], ["job", "description"]) || ExtractJobField(job.graphqlResponses || [], ["job", "title"]) || "";
        return fetch(API_BASE_URL + API_ENDPOINTS.GENERATE_RESUME_PIPELINE, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${result.authToken}`
          },
          body: JSON.stringify({
            job_description: jobDescription,
            resume: result.resumeText ?? ""
          })
        });
      })
    );
    chrome.storage.local.set({ jobData: {} }, () => {
      ShowProcessingView();
    });
  }
  if (typeof window !== "undefined" && typeof chrome !== "undefined" && typeof chrome.storage !== "undefined" && typeof globalThis.vi === "undefined") {
    injectCSSVariables();
    welcomeView = document.getElementById("welcomeView");
    loginView = document.getElementById("loginView");
    launchView = document.getElementById("launchView");
    mainView = document.getElementById("mainView");
    processingView = document.getElementById("processingView");
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
    document.getElementById("logoutButton")?.addEventListener("click", HandleLogout);
    document.getElementById("doneApplyingButton")?.addEventListener("click", HandleDoneApplying);
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.currentStep?.newValue === 4) {
        ShowTrackingView();
      }
      if (changes.launchStatus) {
        UpdateLaunchStatus(changes.launchStatus.newValue);
      }
      if (changes.jobData) {
        UpdateJobCounter();
        DisplayTrackedJobs();
      }
    });
    chrome.storage.local.get(["username", "currentStep"], (result) => {
      const step = result.currentStep;
      if (step === 5) {
        ShowProcessingView();
      } else if (step === 4 || !step && result.username) {
        ShowTrackingView();
      } else if (step === 3) {
        ShowStep(3);
      } else if (step === 2) {
        ShowStep(2);
      } else {
        ShowStep(1);
      }
    });
    if (false) {
      console.log("[AutoShake] GraphQL debug view enabled");
    }
  }
})();
