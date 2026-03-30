const DASHBOARD_URL = "https://tipply.pl/dashboard";
const DEFAULT_COMMAND = "resendLastDonation";

const elements = {
	command: document.getElementById("command"),
	authCookie: document.getElementById("auth-cookie"),
	connect: document.getElementById("connect"),
	disconnect: document.getElementById("disconnect"),
	openDashboard: document.getElementById("open-dashboard"),
	connectionTitle: document.getElementById("connection-title"),
	connectionDescription: document.getElementById("connection-description"),
	connectionMeta: document.getElementById("connection-meta"),
};

bootstrap().catch((error) => {
	console.error("Failed to initialize Tipply property inspector", error);
	renderState({
		status: "error",
		message: "Property inspector failed to initialize.",
	});
});

async function bootstrap() {
	bindEvents();
	subscribeToPluginMessages();

	const [settingsPayload, globalSettings] = await Promise.all([
		SDPIComponents.streamDeckClient.getSettings(),
		SDPIComponents.streamDeckClient.getGlobalSettings(),
	]);

	const currentCommand = settingsPayload?.settings?.command ?? DEFAULT_COMMAND;
	elements.command.value = currentCommand;
	renderState(mapGlobalSettings(globalSettings));
}

function bindEvents() {
	elements.command.addEventListener("change", () => {
		SDPIComponents.streamDeckClient.setSettings({
			command: elements.command.value,
		});
	});

	elements.openDashboard.addEventListener("click", async () => {
		await SDPIComponents.streamDeckClient.send("openUrl", {
			url: DASHBOARD_URL,
		});
	});

	elements.connect.addEventListener("click", async () => {
		const authCookie = elements.authCookie.value.trim();

		setBusy(true);
		renderState({
			status: "pending",
			message: "Validating Tipply session...",
		});

		await SDPIComponents.streamDeckClient.send("sendToPlugin", {
			type: "connect",
			authCookie,
		});
	});

	elements.disconnect.addEventListener("click", async () => {
		setBusy(true);
		await SDPIComponents.streamDeckClient.send("sendToPlugin", {
			type: "disconnect",
		});
	});
}

function subscribeToPluginMessages() {
	SDPIComponents.streamDeckClient.sendToPropertyInspector.subscribe((event) => {
		const payload = event.payload;

		if (!payload || payload.type !== "auth-state") {
			return;
		}

		setBusy(false);
		renderState(payload);

		if (payload.status !== "error") {
			elements.authCookie.value = "";
		}
	});
}

function renderState(state) {
	switch (state.status) {
		case "connected":
			elements.connectionTitle.textContent = `Connected as ${state.account.username}`;
			elements.connectionDescription.textContent =
				"Tipply account is ready for Stream Deck actions.";
			elements.connectionMeta.textContent = state.connectedAt
				? `Authorized at ${formatDate(state.connectedAt)}`
				: "";
			break;
		case "error":
			elements.connectionTitle.textContent = "Authorization failed";
			elements.connectionDescription.textContent =
				state.message ?? "Tipply connection could not be established.";
			elements.connectionMeta.textContent = "";
			break;
		case "pending":
			elements.connectionTitle.textContent = "Connecting to Tipply";
			elements.connectionDescription.textContent =
				state.message ?? "Waiting for Tipply validation.";
			elements.connectionMeta.textContent = "";
			break;
		default:
			elements.connectionTitle.textContent = "Tipply is not connected";
			elements.connectionDescription.textContent =
				state.message ?? "Paste an auth_token cookie to authorize this plugin.";
			elements.connectionMeta.textContent = "";
			break;
	}
}

function mapGlobalSettings(globalSettings) {
	if (globalSettings?.authCookie && globalSettings?.account) {
		return {
			status: "connected",
			account: globalSettings.account,
			connectedAt: globalSettings.connectedAt,
		};
	}

	return {
		status: "disconnected",
		message: "Paste an auth_token cookie to authorize this plugin.",
	};
}

function formatDate(value) {
	try {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date(value));
	} catch {
		return value;
	}
}

function setBusy(value) {
	elements.connect.disabled = value;
	elements.disconnect.disabled = value;
	elements.openDashboard.disabled = value;
	elements.command.disabled = value;
	elements.authCookie.disabled = value;
}
