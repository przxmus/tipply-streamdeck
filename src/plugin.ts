import streamDeck from "@elgato/streamdeck";

import {
	TipplyAlertsAction,
	TipplyAlertSoundAction,
	TipplyModeratorModeAction,
	TipplyResendAction,
	TipplySkipAction,
} from "./actions/tipply-actions";

// The plugin needs detailed logs while the Tipply auth flow is being configured.
streamDeck.logger.setLevel("trace");

streamDeck.actions.registerAction(new TipplyResendAction());
streamDeck.actions.registerAction(new TipplySkipAction());
streamDeck.actions.registerAction(new TipplyAlertsAction());
streamDeck.actions.registerAction(new TipplyAlertSoundAction());
streamDeck.actions.registerAction(new TipplyModeratorModeAction());

streamDeck.connect();
