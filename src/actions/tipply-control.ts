import {
	action,
	DialAction,
	KeyDownEvent,
	KeyAction,
	SingletonAction,
	streamDeck,
	WillAppearEvent,
	type DidReceiveSettingsEvent,
	type PropertyInspectorDidAppearEvent,
	type SendToPluginEvent,
} from "@elgato/streamdeck";

import {
	getCommandLabel,
	getCommandTitle,
	getDefaultCommand,
	type PropertyInspectorMessage,
	type PropertyInspectorStateMessage,
	type TipplyActionSettings,
	type TipplyGlobalSettings,
	resendLatestTip,
	skipCurrentTip,
	validateAuthCookie,
} from "../tipply";

@action({ UUID: "dev.przxmus.tipply.increment" })
export class TipplyControlAction extends SingletonAction<TipplyActionSettings> {
	private async getActionSettings(
		action: DialAction<TipplyActionSettings> | KeyAction<TipplyActionSettings>,
	): Promise<TipplyActionSettings> {
		return action.getSettings();
	}

	override async onWillAppear(
		ev: WillAppearEvent<TipplyActionSettings>,
	): Promise<void> {
		await this.syncTitle(ev.action, ev.payload.settings);
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<TipplyActionSettings>,
	): Promise<void> {
		await this.syncTitle(ev.action, ev.payload.settings);
	}

	override async onPropertyInspectorDidAppear(
		ev: PropertyInspectorDidAppearEvent<TipplyActionSettings>,
	): Promise<void> {
		await this.syncTitle(ev.action, await this.getActionSettings(ev.action));
		await this.sendAuthState();
	}

	override async onKeyDown(
		ev: KeyDownEvent<TipplyActionSettings>,
	): Promise<void> {
		const globalSettings =
			await streamDeck.settings.getGlobalSettings<TipplyGlobalSettings>();
		const authCookie = globalSettings.authCookie?.trim();

		if (!authCookie) {
			streamDeck.logger.warn("Tipply action invoked without authorization.");
			await ev.action.showAlert();
			return;
		}

		const command = getDefaultCommand(ev.payload.settings.command);

		try {
			if (command === "skipCurrentDonation") {
				await skipCurrentTip(authCookie);
			} else {
				await resendLatestTip(authCookie);
			}

			await ev.action.showOk();
		} catch (error) {
			streamDeck.logger.error(
				`Failed to execute ${getCommandLabel(command)}`,
				error,
			);
			await ev.action.showAlert();
		}
	}

	override async onSendToPlugin(
		ev: SendToPluginEvent<PropertyInspectorMessage, TipplyActionSettings>,
	): Promise<void> {
		const payload = ev.payload;

		if (!payload || typeof payload !== "object" || !("type" in payload)) {
			return;
		}

		switch (payload.type) {
			case "connect":
				await this.handleConnect(payload.authCookie);
				return;
			case "disconnect":
				await streamDeck.settings.setGlobalSettings<TipplyGlobalSettings>({});
				await this.sendAuthState();
				return;
			default:
				return;
		}
	}

	private async handleConnect(authCookie?: string): Promise<void> {
		const normalizedCookie = authCookie?.trim();

		if (!normalizedCookie) {
			await this.sendStateMessage({
				type: "auth-state",
				status: "error",
				message: "Paste the Tipply auth_token cookie first.",
			});
			return;
		}

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
					"Authorization failed. Refresh the Tipply session and paste a fresh auth_token cookie.",
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

	private async syncTitle(
		action: DialAction<TipplyActionSettings> | KeyAction<TipplyActionSettings>,
		settings: TipplyActionSettings,
	): Promise<void> {
		await action.setTitle(getCommandTitle(settings.command));
	}
}
