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
	type PropertyInspectorMessage,
	type PropertyInspectorStateMessage,
	type TipplyGlobalSettings,
	type TipplyToggleAction,
	getCurrentUser,
	getToggleState,
	resendLatestTip,
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

abstract class TipplyActionBase extends SingletonAction {
	protected constructor(
		private readonly actionType: SupportedAction,
		private readonly defaultButtonTitle: string,
	) {
		super();
	}

	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		await this.syncTitle(ev.action);
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
				await skipCurrentTip(authCookie);
				await ev.action.setTitle(this.defaultButtonTitle);
			} else if (this.actionType === "resend") {
				await resendLatestTip(authCookie);
				await ev.action.setTitle(this.defaultButtonTitle);
			} else {
				const currentUser = await toggleSetting(authCookie, this.actionType);
				await ev.action.setTitle(this.defaultButtonTitle);
				await ev.action.setState(getToggleState(this.actionType, currentUser));
			}

			await ev.action.showOk();
		} catch (error) {
			streamDeck.logger.error(
				`Failed to execute Tipply ${this.actionType} action`,
				error,
			);
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
			await streamDeck.settings.setGlobalSettings<TipplyGlobalSettings>({
				authCookie: normalizedCookie,
				account: state.account,
				connectedAt: state.connectedAt,
			});
			await this.sendAuthState();
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

	private async syncTitle(action: KeyAction | WillAppearEvent["action"]): Promise<void> {
		if (this.actionType === "resend" || this.actionType === "skip") {
			await action.setTitle(this.defaultButtonTitle);
			return;
		}

		const globalSettings =
			await streamDeck.settings.getGlobalSettings<TipplyGlobalSettings>();
		const authCookie = globalSettings.authCookie?.trim();

		if (!authCookie) {
			await action.setTitle(this.defaultButtonTitle);
			return;
		}

		try {
			const currentUser = await getCurrentUser(authCookie);
			await action.setTitle(this.defaultButtonTitle);
			if (this.isKeyAction(action)) {
				await action.setState(getToggleState(this.actionType, currentUser));
			}
		} catch (error) {
			streamDeck.logger.warn(
				`Failed to sync title for Tipply ${this.actionType} action`,
				error,
			);
			await action.setTitle(this.defaultButtonTitle);
		}
	}

	private isKeyAction(action: KeyAction | WillAppearEvent["action"]): action is KeyAction {
		return "setState" in action;
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
