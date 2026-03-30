import {
	action,
	KeyDownEvent,
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
	resendLatestTip,
	skipCurrentTip,
	validateAuthCookie,
} from "../tipply";

type SupportedAction = "resend" | "skip";

abstract class TipplyActionBase extends SingletonAction {
	protected constructor(
		private readonly actionType: SupportedAction,
		private readonly buttonTitle: string,
	) {
		super();
	}

	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		await ev.action.setTitle(this.buttonTitle);
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
			} else {
				await resendLatestTip(authCookie);
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
