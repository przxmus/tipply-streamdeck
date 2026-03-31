import {
	type CurrentUser,
	createTipplyClient,
	type TipplyClient,
	type Tip,
} from "tipply-sdk-ts";

export const DEFAULT_TIPPLY_APP_ORIGIN = "https://tipply.pl";

export type TipplyGlobalSettings = {
	authCookie?: string;
	account?: {
		id: string;
		username: string;
	};
	connectedAt?: string;
};

export type PropertyInspectorMessage = {
	type: "set-auth-cookie";
	authCookie?: string;
};

export type PropertyInspectorStateMessage = {
	type: "auth-state";
	status: "connected" | "disconnected" | "error" | "pending";
	account?: TipplyGlobalSettings["account"];
	connectedAt?: string;
	message?: string;
};

export type TipplyToggleAction =
	| "alerts"
	| "alertSound"
	| "moderatorMode";

let sessionAuthCookie: string | undefined;
let authenticatedClient: TipplyClient | undefined;

function buildAuthenticatedClient(): TipplyClient {
	return createTipplyClient({
		session: {
			getAuthCookie: () => sessionAuthCookie,
		},
		auth: {
			refreshTokenOnRequests: true,
			refreshTokenEvery: true,
		},
		appOrigin: DEFAULT_TIPPLY_APP_ORIGIN,
	});
}

function disposeAuthenticatedClient(): void {
	authenticatedClient?.close();
	authenticatedClient = undefined;
}

export function setAuthenticatedSession(authCookie: string): void {
	sessionAuthCookie = authCookie;
	disposeAuthenticatedClient();
}

export function clearAuthenticatedSession(): void {
	sessionAuthCookie = undefined;
	disposeAuthenticatedClient();
}

export function hasAuthenticatedSession(): boolean {
	return Boolean(sessionAuthCookie?.trim());
}

export function getAuthenticatedClient(): TipplyClient {
	if (!hasAuthenticatedSession()) {
		throw new Error("Tipply auth session is not configured.");
	}

	authenticatedClient ??= buildAuthenticatedClient();
	return authenticatedClient;
}

export async function validateAuthCookie(authCookie: string): Promise<{
	account: NonNullable<TipplyGlobalSettings["account"]>;
	connectedAt: string;
}> {
	const client = createTipplyClient({
		authCookie,
		auth: {
			refreshTokenOnRequests: true,
			refreshTokenEvery: true,
		},
		appOrigin: DEFAULT_TIPPLY_APP_ORIGIN,
	});
	const currentUser = await client.me.get();
	client.close();

	return {
		account: {
			id: currentUser.id,
			username: currentUser.username,
		},
		connectedAt: new Date().toISOString(),
	};
}

export async function resendLatestTip(): Promise<Tip> {
	const client = getAuthenticatedClient();
	const tips = await client.tips.list().limit(10).get();
	const latestTip = getLatestTip(tips);

	if (!latestTip) {
		throw new Error("No donations were found on this Tipply account.");
	}

	await client.tips.id(latestTip.id).resend();

	return latestTip;
}

export async function skipCurrentTip(): Promise<void> {
	await getAuthenticatedClient().tipAlerts.skipCurrent();
}

export async function getCurrentUser(): Promise<CurrentUser> {
	return getAuthenticatedClient().me.get();
}

export async function toggleSetting(
	action: TipplyToggleAction,
): Promise<CurrentUser> {
	const client = getAuthenticatedClient();
	const currentUser = await client.me.get();
	const optimisticUser = { ...currentUser };

	switch (action) {
		case "alerts":
			await client.settings.alerts.toggle(!currentUser.widgetAlertsDisabled);
			optimisticUser.widgetAlertsDisabled = !currentUser.widgetAlertsDisabled;
			break;
		case "alertSound":
			await client.settings.alertSound.toggle(!currentUser.widgetAlertsSoundDisabled);
			optimisticUser.widgetAlertsSoundDisabled =
				!currentUser.widgetAlertsSoundDisabled;
			break;
		case "moderatorMode":
			await client.moderators.mode.toggle();
			optimisticUser.moderationMode = !currentUser.moderationMode;
			break;
	}

	return optimisticUser;
}

export function getToggleState(
	action: TipplyToggleAction,
	currentUser: CurrentUser,
): 0 | 1 {
	switch (action) {
		case "alerts":
			return currentUser.widgetAlertsDisabled ? 0 : 1;
		case "alertSound":
			return currentUser.widgetAlertsSoundDisabled ? 0 : 1;
		case "moderatorMode":
			return currentUser.moderationMode ? 1 : 0;
	}
}

function getLatestTip(tips: Tip[]): Tip | undefined {
	return tips
		.filter((tip) => !tip.deleted)
		.sort((left, right) => {
			return Date.parse(right.createdAt) - Date.parse(left.createdAt);
		})
		.at(0);
}
