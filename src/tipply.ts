import {
	type CurrentUser,
	createTipplyClient,
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

export function createAuthenticatedClient(authCookie: string) {
	return createTipplyClient({
		authCookie,
		appOrigin: DEFAULT_TIPPLY_APP_ORIGIN,
	});
}

export async function validateAuthCookie(authCookie: string): Promise<{
	account: NonNullable<TipplyGlobalSettings["account"]>;
	connectedAt: string;
}> {
	const currentUser = await createAuthenticatedClient(authCookie).me.get();

	return {
		account: {
			id: currentUser.id,
			username: currentUser.username,
		},
		connectedAt: new Date().toISOString(),
	};
}

export async function resendLatestTip(authCookie: string): Promise<Tip> {
	const client = createAuthenticatedClient(authCookie);
	const tips = await client.tips.list().limit(10).get();
	const latestTip = getLatestTip(tips);

	if (!latestTip) {
		throw new Error("No donations were found on this Tipply account.");
	}

	await client.tips.id(latestTip.id).resend();

	return latestTip;
}

export async function skipCurrentTip(authCookie: string): Promise<void> {
	await createAuthenticatedClient(authCookie).tipAlerts.skipCurrent();
}

export async function getCurrentUser(authCookie: string): Promise<CurrentUser> {
	return createAuthenticatedClient(authCookie).me.get();
}

export async function toggleSetting(
	authCookie: string,
	action: TipplyToggleAction,
): Promise<CurrentUser> {
	const client = createAuthenticatedClient(authCookie);
	const currentUser = await client.me.get();

	switch (action) {
		case "alerts":
			await client.settings.alerts.toggle(!currentUser.widgetAlertsDisabled);
			break;
		case "alertSound":
			await client.settings.alertSound.toggle(!currentUser.widgetAlertsSoundDisabled);
			break;
		case "moderatorMode":
			await client.moderators.mode.toggle();
			break;
	}

	return client.me.get();
}

export function getToggleButtonTitle(
	action: TipplyToggleAction,
	currentUser: CurrentUser,
): string {
	switch (action) {
		case "alerts":
			return currentUser.widgetAlertsDisabled ? "Alerts Off" : "Alerts On";
		case "alertSound":
			return currentUser.widgetAlertsSoundDisabled ? "Sound Off" : "Sound On";
		case "moderatorMode":
			return currentUser.moderationMode ? "Mod On" : "Mod Off";
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
