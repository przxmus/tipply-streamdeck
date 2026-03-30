import { createTipplyClient, type Tip } from "tipply-sdk-ts";

export const DEFAULT_TIPPLY_APP_ORIGIN = "https://tipply.pl";
export const TIPPLY_DASHBOARD_URL = "https://tipply.pl/dashboard";

export type TipplyCommand = "resendLastDonation" | "skipCurrentDonation";

export type TipplyActionSettings = {
	command?: TipplyCommand;
};

export type TipplyGlobalSettings = {
	authCookie?: string;
	account?: {
		id: string;
		username: string;
	};
	connectedAt?: string;
};

export type PropertyInspectorMessage =
	| {
			type: "connect";
			authCookie?: string;
	  }
	| {
			type: "disconnect";
	  };

export type PropertyInspectorStateMessage = {
	type: "auth-state";
	status: "connected" | "disconnected" | "error";
	account?: TipplyGlobalSettings["account"];
	connectedAt?: string;
	message?: string;
};

export function getDefaultCommand(
	command?: TipplyCommand,
): TipplyCommand {
	return command ?? "resendLastDonation";
}

export function getCommandTitle(command?: TipplyCommand): string {
	return getDefaultCommand(command) === "skipCurrentDonation"
		? "Skip"
		: "Resend";
}

export function getCommandLabel(command?: TipplyCommand): string {
	return getDefaultCommand(command) === "skipCurrentDonation"
		? "Skip current donate"
		: "Resend last donate";
}

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

function getLatestTip(tips: Tip[]): Tip | undefined {
	return tips
		.filter((tip) => !tip.deleted)
		.sort((left, right) => {
			return Date.parse(right.createdAt) - Date.parse(left.createdAt);
		})
		.at(0);
}
