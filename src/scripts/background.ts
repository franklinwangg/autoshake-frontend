import type { StoreJobMessage, StorageResult, JobData, StoreJobResponse, WatchHandshakeTabMessage } from '../types/types';
import { IsLoginUrl, IsJobsPageUrl } from '../config/constants';

const openPanels = new Set<number>();

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

type IncomingMessage = StoreJobMessage | WatchHandshakeTabMessage;

chrome.runtime.onMessage.addListener((message: IncomingMessage, _sender: chrome.runtime.MessageSender, sendResponse: (response?: StoreJobResponse | { success: boolean }) => void) => {
	if (!message?.type) return false;

	if (message.type === "storeJob") {
		const msg = message as StoreJobMessage;
		if (!msg.jobEntry) return false;

		const jobId: string = msg.jobEntry.jobId;
		if (!jobId) {
			sendResponse({ success: false, error: "No jobId provided" });
			return true;
		}

		chrome.storage.local.get(["trackingEnabled", "jobData"], (result: StorageResult) => {
			const enabled: boolean = result.trackingEnabled !== false;
			if (!enabled) {
				sendResponse({ success: false, error: "tracking_disabled" });
				return;
			}

			const jobData: JobData = result.jobData || {};

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
		const { tabId } = message as WatchHandshakeTabMessage;

		chrome.storage.local.set({ launchStatus: "opening" });

		// If the tab is already on the jobs page (already logged in), advance immediately
		chrome.tabs.get(tabId, (tab) => {
			if (tab.url && IsJobsPageUrl(tab.url)) {
				chrome.storage.local.set({ launchStatus: "detected", currentStep: 4 });
				return;
			}
		});

		const onUpdated = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
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
