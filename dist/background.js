"use strict";
(() => {
  // src/config/constants.ts
  var IsLoginUrl = (url) => /login|sso|shibboleth|duosecurity|saml/i.test(url);
  var IsJobsPageUrl = (url) => url.includes("joinhandshake.com") && (url.includes("/job-search") || url.includes("/stu/jobs"));

  // src/scripts/background.ts
  var openPanels = /* @__PURE__ */ new Set();
  chrome.action.onClicked.addListener((tab) => {
    if (!tab.id) return;
    const tabId = tab.id;
    if (openPanels.has(tabId)) {
      chrome.sidePanel.setOptions({ tabId, enabled: false }, () => {
        chrome.sidePanel.setOptions({ tabId, enabled: true });
      });
      openPanels.delete(tabId);
    } else {
      chrome.sidePanel.open({ tabId });
      openPanels.add(tabId);
    }
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    openPanels.delete(tabId);
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message?.type) return false;
    if (message.type === "storeJob") {
      const msg = message;
      if (!msg.jobEntry) return false;
      const jobId = msg.jobEntry.jobId;
      if (!jobId) {
        sendResponse({ success: false, error: "No jobId provided" });
        return true;
      }
      chrome.storage.local.get(["trackingEnabled", "jobData"], (result) => {
        const enabled = result.trackingEnabled !== false;
        if (!enabled) {
          sendResponse({ success: false, error: "tracking_disabled" });
          return;
        }
        const jobData = result.jobData || {};
        if (!jobData[jobId]) {
          jobData[jobId] = { jobId, graphqlResponses: [], clicked: true };
        }
        jobData[jobId].href = msg.jobEntry.href;
        jobData[jobId].text = msg.jobEntry.text;
        jobData[jobId].clickTimestamp = msg.jobEntry.clickTimestamp;
        jobData[jobId].clicked = true;
        chrome.storage.local.set({ jobData }, () => {
          sendResponse({ success: true });
        });
      });
      return true;
    }
    if (message.type === "watchHandshakeTab") {
      const { tabId } = message;
      chrome.storage.local.set({ launchStatus: "opening" });
      chrome.tabs.get(tabId, (tab) => {
        if (tab.url && IsJobsPageUrl(tab.url)) {
          chrome.storage.local.set({ launchStatus: "detected", currentStep: 4 });
          return;
        }
      });
      const onUpdated = (updatedTabId, changeInfo) => {
        if (updatedTabId !== tabId || !changeInfo.url) return;
        const url = changeInfo.url;
        if (IsLoginUrl(url)) {
          chrome.storage.local.set({ launchStatus: "waiting_login" });
        } else if (IsJobsPageUrl(url)) {
          chrome.storage.local.set({ launchStatus: "detected", currentStep: 4 });
          chrome.tabs.onUpdated.removeListener(onUpdated);
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
      sendResponse({ success: true });
      return true;
    }
    return false;
  });
})();
