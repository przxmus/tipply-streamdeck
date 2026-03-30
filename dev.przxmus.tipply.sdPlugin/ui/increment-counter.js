const elements = {
	authCookie: document.getElementById("auth-cookie"),
	connectionTitle: document.getElementById("connection-title"),
};

let submitTimer;
let lastSubmittedValue = "";

bootstrap().catch((error) => {
	console.error("Failed to initialize Tipply property inspector", error);
	renderState({
		status: "error",
		message: "Property inspector failed to initialize.",
	});
});

function bootstrap() {
	bindEvents();
	subscribeToPluginMessages();
	renderState({
		status: "pending",
		message: "Loading authorization state.",
	});
}

function bindEvents() {
	elements.authCookie.addEventListener("input", scheduleTokenSubmit);
	elements.authCookie.addEventListener("change", () => {
		void submitToken();
	});
	elements.authCookie.addEventListener("paste", scheduleTokenSubmit);
}

function subscribeToPluginMessages() {
	SDPIComponents.streamDeckClient.sendToPropertyInspector.subscribe((event) => {
		const payload = event.payload;

		if (!payload || payload.type !== "auth-state") {
			return;
		}

		setBusy(false);
		renderState(payload);

		if (payload.status === "connected") {
			elements.authCookie.value = "";
			elements.authCookie.placeholder = "Stored securely. Paste a new token to replace it";
			lastSubmittedValue = "";
			return;
		}

		if (payload.status === "disconnected") {
			elements.authCookie.placeholder = "Paste token to connect or replace";
			lastSubmittedValue = "";
			return;
		}

		if (payload.status === "error") {
			lastSubmittedValue = "";
		}
	});
}

function renderState(state) {
	switch (state.status) {
		case "connected":
			elements.connectionTitle.textContent = `Connected as ${state.account.username}`;
			break;
		case "error":
			elements.connectionTitle.textContent = "Authorization failed";
			break;
		case "pending":
			elements.connectionTitle.textContent = "Connecting to Tipply";
			break;
		default:
			elements.connectionTitle.textContent = "Tipply is not connected";
			break;
	}
}

function scheduleTokenSubmit() {
	clearTimeout(submitTimer);
	submitTimer = setTimeout(() => {
		void submitToken();
	}, 400);
}

async function submitToken() {
	clearTimeout(submitTimer);

	const authCookie = elements.authCookie.value.trim();

	if (!authCookie || authCookie === lastSubmittedValue) {
		return;
	}

	lastSubmittedValue = authCookie;
	setBusy(true);
	renderState({
		status: "pending",
		message: "Validating Tipply session...",
	});

	await SDPIComponents.streamDeckClient.send("sendToPlugin", {
		type: "set-auth-cookie",
		authCookie,
	});
}

function setBusy(value) {
	elements.authCookie.disabled = value;
}
