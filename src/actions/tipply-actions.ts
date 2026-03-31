import {
	action,
	KeyDownEvent,
	KeyAction,
	SingletonAction,
	streamDeck,
	type PropertyInspectorDidAppearEvent,
	type SendToPluginEvent,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import {
	clearAuthenticatedSession,
	type PropertyInspectorMessage,
	type PropertyInspectorStateMessage,
	type TipplyGlobalSettings,
	type TipplyToggleAction,
	getCurrentUser,
	getToggleState,
	hasAuthenticatedSession,
	resendLatestTip,
	setAuthenticatedSession,
	skipCurrentTip,
	toggleSetting,
	validateAuthCookie,
} from "../tipply";

type SupportedAction =
	| "resend"
	| "skip"
	| "alerts"
	| "alertSound"
	| "moderatorMode";

type TipplyUser = Awaited<ReturnType<typeof getCurrentUser>>;

const actionInstances = new Set<TipplyActionBase>();

abstract class TipplyActionBase extends SingletonAction {
	protected constructor(
		private readonly actionType: SupportedAction,
		private readonly defaultButtonTitle: string,
	) {
		super();
		actionInstances.add(this);
	}

	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		await this.syncAction(ev.action);
	}

	override async onPropertyInspectorDidAppear(
		_ev: PropertyInspectorDidAppearEvent,
	): Promise<void> {
		await this.sendAuthState();
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const globalSettings =
			await streamDeck.settings.getGlobalSettings<TipplyGlobalSettings>();
		const authCookie = globalSettings.authCookie?.trim();

		if (!authCookie) {
			streamDeck.logger.warn(
				`Tipply ${this.actionType} action invoked without authorization.`,
			);
			await ev.action.showAlert();
			return;
		}

		try {
			if (this.actionType === "skip") {
				setAuthenticatedSession(authCookie);
				await skipCurrentTip();
				await ev.action.setTitle(this.defaultButtonTitle);
			} else if (this.actionType === "resend") {
				setAuthenticatedSession(authCookie);
				await resendLatestTip();
				await ev.action.setTitle(this.defaultButtonTitle);
			} else {
				setAuthenticatedSession(authCookie);
				const currentUser = await toggleSetting(this.actionType);
				await TipplyActionBase.syncEveryVisibleAction(currentUser);
			}

			await ev.action.showOk();
		} catch (error) {
			streamDeck.logger.error(
				`Failed to execute Tipply ${this.actionType} action`,
				error,
			);
			await TipplyActionBase.refreshConnectionState();
			await ev.action.showAlert();
		}
	}

	override async onSendToPlugin(
		ev: SendToPluginEvent<PropertyInspectorMessage, JsonObject>,
	): Promise<void> {
		const payload = ev.payload;

		if (
			!payload ||
			typeof payload !== "object" ||
			payload.type !== "set-auth-cookie"
		) {
			return;
		}

		const normalizedCookie = payload.authCookie?.trim();

		if (!normalizedCookie) {
			await this.sendStateMessage({
				type: "auth-state",
				status: "disconnected",
				message: "Paste a Tipply auth_token cookie to connect this plugin.",
			});
			return;
		}

		await this.sendStateMessage({
			type: "auth-state",
			status: "pending",
			message: "Validating Tipply session...",
		});

		try {
			const state = await validateAuthCookie(normalizedCookie);
			setAuthenticatedSession(normalizedCookie);
			await streamDeck.settings.setGlobalSettings<TipplyGlobalSettings>({
				authCookie: normalizedCookie,
				account: state.account,
				connectedAt: state.connectedAt,
			});
			await this.sendAuthState();
			await TipplyActionBase.syncEveryVisibleAction();
		} catch (error) {
			streamDeck.logger.error("Failed to validate Tipply auth cookie", error);
			await this.sendStateMessage({
				type: "auth-state",
				status: "error",
				message:
					"Authorization failed. Paste a fresh Tipply auth_token cookie from an active session.",
			});
		}
	}

	private async sendAuthState(): Promise<void> {
		await TipplyActionBase.refreshConnectionState();

		const globalSettings =
			await streamDeck.settings.getGlobalSettings<TipplyGlobalSettings>();

		if (!globalSettings.authCookie || !globalSettings.account) {
			await this.sendStateMessage({
				type: "auth-state",
				status: "disconnected",
				message: "Tipply is not connected.",
			});
			return;
		}

		await this.sendStateMessage({
			type: "auth-state",
			status: "connected",
			account: globalSettings.account,
			connectedAt: globalSettings.connectedAt,
		});
	}

	private async sendStateMessage(
		payload: PropertyInspectorStateMessage,
	): Promise<void> {
		await streamDeck.ui.sendToPropertyInspector(payload);
	}

	private async syncAction(
		action: KeyAction | WillAppearEvent["action"],
		currentUser?: TipplyUser,
	): Promise<void> {
		await action.setTitle(this.defaultButtonTitle);

		const toggleActionType = this.getToggleActionType();

		if (!this.isKeyAction(action) || !toggleActionType) {
			return;
		}

		const resolvedUser = currentUser ?? (await this.getAuthorizedCurrentUser());
		await action.setState(
			resolvedUser ? getToggleState(toggleActionType, resolvedUser) : 0,
		);
	}

	private isKeyAction(
		action: KeyAction | WillAppearEvent["action"],
	): action is KeyAction {
		return "setState" in action;
	}

	private async getAuthorizedCurrentUser(): Promise<TipplyUser | undefined> {
		const globalSettings =
			await streamDeck.settings.getGlobalSettings<TipplyGlobalSettings>();
		const toggleActionType = this.getToggleActionType();

		if (!toggleActionType) {
			return undefined;
		}

		try {
			const authCookie = globalSettings.authCookie?.trim();
			if (authCookie) {
				setAuthenticatedSession(authCookie);
			}
			return hasAuthenticatedSession() ? await getCurrentUser() : undefined;
		} catch (error) {
			streamDeck.logger.warn(
				`Failed to sync title for Tipply ${this.actionType} action`,
				error,
			);
			return undefined;
		}
	}

	private async syncVisibleActions(currentUser?: TipplyUser): Promise<void> {
		const toggleActionType = this.getToggleActionType();
		const resolvedUser =
			currentUser && toggleActionType
				? currentUser
				: await this.getAuthorizedCurrentUser();

		for (const action of this.actions) {
			await this.syncAction(action, resolvedUser);
		}
	}

	private getToggleActionType(): TipplyToggleAction | undefined {
		switch (this.actionType) {
			case "alerts":
			case "alertSound":
			case "moderatorMode":
				return this.actionType;
			default:
				return undefined;
		}
	}

	private static async syncEveryVisibleAction(
		currentUser?: TipplyUser,
	): Promise<void> {
		for (const instance of actionInstances) {
			await instance.syncVisibleActions(currentUser);
		}
	}

	private static async refreshConnectionState(): Promise<boolean> {
		const globalSettings =
			await streamDeck.settings.getGlobalSettings<TipplyGlobalSettings>();
		const authCookie = globalSettings.authCookie?.trim();

		if (!authCookie) {
			return false;
		}

		try {
			setAuthenticatedSession(authCookie);
			const currentUser = await getCurrentUser();
			const accountChanged =
				globalSettings.account?.id !== currentUser.id ||
				globalSettings.account?.username !== currentUser.username;

			if (!globalSettings.account || accountChanged) {
				await streamDeck.settings.setGlobalSettings<TipplyGlobalSettings>({
					...globalSettings,
					account: {
						id: currentUser.id,
						username: currentUser.username,
					},
					connectedAt: globalSettings.connectedAt ?? new Date().toISOString(),
				});
			}

			return true;
		} catch (error) {
			streamDeck.logger.warn("Tipply authorization is no longer valid", error);
			clearAuthenticatedSession();
			await streamDeck.settings.setGlobalSettings<TipplyGlobalSettings>({});
			await streamDeck.ui.sendToPropertyInspector({
				type: "auth-state",
				status: "disconnected",
				message:
					"Tipply session expired. Paste a fresh auth_token to reconnect.",
			});
			await TipplyActionBase.syncEveryVisibleAction();
			return false;
		}
	}
}

@action({ UUID: "dev.przxmus.tipply.resend" })
export class TipplyResendAction extends TipplyActionBase {
	constructor() {
		super("resend", "Resend");
	}
}

@action({ UUID: "dev.przxmus.tipply.skip" })
export class TipplySkipAction extends TipplyActionBase {
	constructor() {
		super("skip", "Skip");
	}
}

@action({ UUID: "dev.przxmus.tipply.alerts" })
export class TipplyAlertsAction extends TipplyActionBase {
	constructor() {
		super("alerts", "Alerts");
	}
}

@action({ UUID: "dev.przxmus.tipply.alert-sound" })
export class TipplyAlertSoundAction extends TipplyActionBase {
	constructor() {
		super("alertSound", "Sound");
	}
}

@action({ UUID: "dev.przxmus.tipply.moderator-mode" })
export class TipplyModeratorModeAction extends TipplyActionBase {
	constructor() {
		super("moderatorMode", "Mod");
	}
}
