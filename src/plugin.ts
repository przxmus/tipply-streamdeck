import streamDeck from "@elgato/streamdeck";

import { TipplyControlAction } from "./actions/tipply-control";

// The plugin needs detailed logs while the Tipply auth flow is being configured.
streamDeck.logger.setLevel("trace");

streamDeck.actions.registerAction(new TipplyControlAction());

streamDeck.connect();
