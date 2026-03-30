import streamDeck from "@elgato/streamdeck";

import {
	TipplyResendAction,
	TipplySkipAction,
} from "./actions/tipply-actions";

// The plugin needs detailed logs while the Tipply auth flow is being configured.
streamDeck.logger.setLevel("trace");

streamDeck.actions.registerAction(new TipplyResendAction());
streamDeck.actions.registerAction(new TipplySkipAction());

streamDeck.connect();
